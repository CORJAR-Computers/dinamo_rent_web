import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

/**
 * Límites del cobro de garantía (`/api/payments/collect`):
 *
 *  - el concepto debe pertenecer al allowlist compartido con el panel;
 *  - ningún cobro ni el acumulado de la reserva puede superar su
 *    `blockingAmount` (el bloqueo de garantía que la reserva ya calcula);
 *  - una reserva sin bloqueo no se cobra: no hay tope contra el que validar.
 *
 * La política vive en `src/lib/server/collectLimits.ts`; estos tests fijan el
 * comportamiento, no una cifra de negocio: el tope se toma de la reserva.
 */

type Obj = Record<string, unknown>;

const state = vi.hoisted(() => ({
	isAdmin: true,
	collectResult: {} as Obj,
	collectCalls: [] as Obj[],
	chargeCreates: [] as Obj[],
	chargedAmounts: [] as Array<{ amount: number }>,
	chargedArgs: [] as Obj[],
	reservation: null as Obj | null
}));

vi.mock('#lib/server/adminAuth.js', () => ({
	isUserAdmin: () => state.isAdmin
}));

vi.mock('#lib/server/placetopay.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/placetopay.js')>();
	return {
		...actual,
		collectPaymentWithToken: async (req: Obj) => {
			state.collectCalls.push(req);
			return state.collectResult;
		},
		invalidateToken: async () => ({ ok: true, message: 'Token invalidado' })
	};
});

vi.mock('#lib/server/db.js', () => {
	const written = (args: Obj, id: string) => ({ id, ...(args.data as Obj) });

	const db = {
		reservation: { findUnique: async () => state.reservation },
		payment: { update: async (args: Obj) => written(args, 'pay_1') },
		depositCharge: {
			create: async (args: Obj) => {
				state.chargeCreates.push(args);
				return written(args, 'chg_nuevo');
			},
			update: async (args: Obj) => written(args, 'chg_nuevo'),
			findFirst: async () => null,
			findMany: async (args: Obj) => {
				state.chargedArgs.push(args);
				return state.chargedAmounts;
			}
		},
		syncLog: { create: async (args: Obj) => written(args, 'log_1') },
		$executeRaw: async () => 0,
		$transaction: async (arg: unknown) =>
			typeof arg === 'function'
				? (arg as (txn: unknown) => Promise<unknown>)(db)
				: Promise.all(arg as Array<Promise<unknown>>)
	};

	return { db };
});

const { POST: collect } = (await import('../src/routes/api/payments/collect/+server.js')) as unknown as {
	POST: Handler;
};

type Handler = (ctx: {
	request: Request;
	cookies: Cookies;
	getClientAddress: () => string;
}) => Promise<Response>;

const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() } as unknown as Cookies;

const cobrar = (body: Obj = {}): Promise<Response> =>
	collect({
		request: new Request('http://localhost/api/payments/collect', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				reservationId: 'res_1',
				amount: 50000,
				concept: 'DEDUCIBLE',
				...body
			})
		}),
		cookies,
		getClientAddress: () => '10.0.0.20'
	});

type ErrorBody = {
	ok?: boolean;
	code?: string;
	error?: string;
	limits?: { cap: number; alreadyCharged: number; remaining: number };
};

function reservationFixture(overrides: Obj = {}): Obj {
	return {
		id: 'res_1',
		code: 'DIN-2026-0001',
		customerName: 'Ana',
		customerLastname: 'Pérez',
		customerEmail: 'ana.perez@correo.com',
		customerPhone: '3001234567',
		customerIdType: 'CC',
		customerIdNumber: '1234567890',
		blockingAmount: 900000,
		termsVersion: '2026-11-23',
		termsHash: 'a'.repeat(64),
		termsAcceptedAt: new Date('2026-11-23T10:00:00Z'),
		termsAcceptedIp: '10.0.0.20',
		payment: { id: 'pay_1', token: 'tok_real_9f8e7d6c', tokenStatus: 'ACTIVO' },
		vehicle: { name: 'Kia Picanto' },
		...overrides
	};
}

beforeEach(() => {
	state.isAdmin = true;
	state.collectResult = { ok: true, status: 'APPROVED', message: 'Aprobado', authorization: 'AUTH-1' };
	state.collectCalls.length = 0;
	state.chargeCreates.length = 0;
	state.chargedAmounts = [];
	state.chargedArgs.length = 0;
	state.reservation = reservationFixture();
});

describe('POST /api/payments/collect — allowlist de conceptos', () => {
	it('rechaza un concepto fuera de la lista sin llamar a la pasarela', async () => {
		const res = await cobrar({ concept: 'PROPINA' });
		const body = (await res.json()) as ErrorBody;

		expect(res.status).toBe(400);
		expect(body.code).toBe('INVALID_CONCEPT');
		expect(body.error).toContain('PROPINA');
		expect(body.error).toContain('DEDUCIBLE');
		expect(state.collectCalls).toHaveLength(0);
		expect(state.chargeCreates).toHaveLength(0);
	});

	it('normaliza mayúsculas y espacios antes de validar el concepto', async () => {
		const res = await cobrar({ concept: ' deducible ' });

		expect(res.status).toBe(200);
		expect(state.collectCalls).toHaveLength(1);
		expect(String((state.collectCalls[0] as Obj).description)).toContain('DEDUCIBLE');
	});

	it('acepta todos los conceptos del allowlist compartido', async () => {
		for (const concept of ['DEDUCIBLE', 'GASOLINA', 'DIAS_EXTRA', 'MULTA', 'OTRO']) {
			state.collectCalls.length = 0;
			const res = await cobrar({ concept });
			expect(res.status, `concepto ${concept}`).toBe(200);
			expect(state.collectCalls).toHaveLength(1);
		}
	});
});

describe('POST /api/payments/collect — tope contra blockingAmount', () => {
	it('rechaza un cobro mayor que la garantía de la reserva', async () => {
		const res = await cobrar({ amount: 900001 });
		const body = (await res.json()) as ErrorBody;

		expect(res.status).toBe(400);
		expect(body.code).toBe('EXCEEDS_GUARANTEE');
		expect(body.limits).toMatchObject({ cap: 900000, alreadyCharged: 0, remaining: 900000 });
		expect(state.collectCalls).toHaveLength(0);
		expect(state.chargeCreates).toHaveLength(0);
	});

	it('acepta un cobro exactamente igual al tope', async () => {
		const res = await cobrar({ amount: 900000 });

		expect(res.status).toBe(200);
		expect(state.chargeCreates[0]).toMatchObject({ data: { amount: 900000 } });
	});

	it('rechaza el cobro si la reserva no tiene bloqueo de garantía', async () => {
		state.reservation = reservationFixture({ blockingAmount: 0 });

		const res = await cobrar();
		const body = (await res.json()) as ErrorBody;

		expect(res.status).toBe(400);
		expect(body.code).toBe('NO_GUARANTEE');
		expect(state.collectCalls).toHaveLength(0);
		expect(state.chargeCreates).toHaveLength(0);
	});
});

describe('POST /api/payments/collect — consentimiento', () => {
	it('rechaza el cobro si la reserva no tiene evidencia de aceptación', async () => {
		state.reservation = reservationFixture({
			termsVersion: null,
			termsHash: null,
			termsAcceptedAt: null
		});

		const res = await cobrar();
		const body = (await res.json()) as ErrorBody;

		expect(res.status).toBe(400);
		expect(body.code).toBe('NO_CONSENT');
		expect(body.error).toContain('Términos y Condiciones');
		expect(state.collectCalls).toHaveLength(0);
		expect(state.chargeCreates).toHaveLength(0);
	});

	it('copia la versión y el hash del consentimiento al cargo', async () => {
		await cobrar();

		expect(state.chargeCreates[0]).toMatchObject({
			data: { consentVersion: '2026-11-23', consentHash: 'a'.repeat(64) }
		});
	});
});

describe('POST /api/payments/collect — tope acumulado de la reserva', () => {
	it('rechaza un cobro que supera el saldo disponible de la garantía', async () => {
		state.chargedAmounts = [{ amount: 800000 }];

		const res = await cobrar({ amount: 150000 });
		const body = (await res.json()) as ErrorBody;

		expect(res.status).toBe(400);
		expect(body.code).toBe('EXCEEDS_ACCUMULATED');
		expect(body.limits).toMatchObject({ cap: 900000, alreadyCharged: 800000, remaining: 100000 });
		expect(state.collectCalls).toHaveLength(0);
		expect(state.chargeCreates).toHaveLength(0);
	});

	it('acepta el cobro que deja el acumulado justo en el tope', async () => {
		state.chargedAmounts = [{ amount: 800000 }, { amount: 50000 }];

		const res = await cobrar({ amount: 50000 });

		expect(res.status).toBe(200);
		expect(state.collectCalls).toHaveLength(1);
	});

	it('suma solo lo aprobado y lo pendiente al calcular el acumulado', async () => {
		await cobrar();

		expect(state.chargedArgs[0]).toMatchObject({
			where: {
				reservationId: 'res_1',
				status: { in: ['APROBADO', 'PENDIENTE'] }
			},
			select: { amount: true }
		});
	});
});
