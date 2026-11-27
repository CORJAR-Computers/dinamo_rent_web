import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

/**
 * Protección anti-doble cobro del cobro con token (§ Collect de PlacetoPay):
 *
 *  - El cargo se persiste PENDIENTE con su referencia ANTES de llamar a la
 *    pasarela; sin eso, un timeout deja el intento sin rastro consultable.
 *  - Mientras exista un PENDIENTE sin cerrar, la reserva no admite otro cobro.
 *  - El cierre manual es explícito: EJECUTADO exige la autorización del
 *    movimiento; NO_EJECUTADO exige el motivo y no cuenta como rechazo del
 *    emisor para la regla de tres intentos.
 */

type Obj = Record<string, unknown>;

const state = vi.hoisted(() => ({
	isAdmin: false,
	collectResult: {} as Obj,
	collectCalls: [] as Obj[],
	/** Cuántos cargos existían en la base cuando se invocó la pasarela. */
	chargesAtGatewayCall: [] as number[],
	chargeCreates: [] as Obj[],
	chargeUpdates: [] as Obj[],
	charges: [] as Obj[],
	pendingCharge: null as Obj | null,
	charge: null as Obj | null,
	recentCharges: [] as Array<{ status: string; resolution?: string | null }>,
	chargedAmounts: [] as Array<{ amount: number }>,
	reservation: null as Obj | null,
	syncLogs: [] as Obj[],
	invalidateCalls: [] as unknown[]
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
			// El cargo ya debe existir cuando la pasarela recibe la petición.
			state.chargesAtGatewayCall.push(state.charges.length);
			return state.collectResult;
		},
		invalidateToken: async () => {
			state.invalidateCalls.push(true);
			return { ok: true, message: 'Token invalidado' };
		}
	};
});

vi.mock('#lib/server/db.js', () => {
	const row = (args: Obj, id: string) => ({
		id,
		reference: 'COL-DIN-2026-0001-MOCK',
		createdAt: new Date('2026-11-27T10:00:00Z'),
		...(args.data as Obj)
	});

	const db = {
		reservation: { findUnique: async () => state.reservation },
		payment: { update: async (args: Obj) => ({ id: 'pay_1', ...(args.data as Obj) }) },
		depositCharge: {
			create: async (args: Obj) => {
				state.chargeCreates.push(args);
				const created = row(args, 'chg_nuevo');
				state.charges.push(created);
				return created;
			},
			update: async (args: Obj) => {
				state.chargeUpdates.push(args);
				const current = state.charges.find((c) => c.id === (args.where as Obj).id) ?? {};
				return { ...current, ...(args.data as Obj) };
			},
			findFirst: async () => state.pendingCharge,
			findMany: async (args: Obj) =>
				// La consulta del acumulado pide solo `amount`; la de rechazos, el estado.
				(args.select as Obj | undefined)?.amount ? state.chargedAmounts : state.recentCharges,
			findUnique: async () => state.charge
		},
		syncLog: {
			create: async (args: Obj) => {
				state.syncLogs.push(args);
				return { id: 'log_1', ...(args.data as Obj) };
			}
		},
		// Lock asesor de la transacción: no devuelve filas ni escribe nada.
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
const { POST: resolve } = (await import(
	'../src/routes/api/payments/collect/[chargeId]/resolve/+server.js'
)) as unknown as { POST: ResolveHandler };

type Handler = (ctx: {
	request: Request;
	cookies: Cookies;
	getClientAddress: () => string;
}) => Promise<Response>;

type ResolveHandler = (ctx: {
	request: Request;
	cookies: Cookies;
	params: { chargeId: string };
}) => Promise<Response>;

const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() } as unknown as Cookies;

const post = (url: string, body: Obj = {}): Promise<Response> =>
	collect({
		request: new Request(`http://localhost${url}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		cookies,
		getClientAddress: () => '10.0.0.20'
	});

const cobrar = () =>
	post('/api/payments/collect', {
		reservationId: 'res_1',
		amount: 80000,
		concept: 'DEDUCIBLE'
	});

const cerrar = (chargeId: string, body: Obj): Promise<Response> =>
	resolve({
		request: new Request(`http://localhost/api/payments/collect/${chargeId}/resolve`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		cookies,
		params: { chargeId }
	});

function reservationFixture(): Obj {
	return {
		id: 'res_1',
		code: 'DIN-2026-0001',
		customerName: 'Ana',
		customerLastname: 'Pérez',
		customerEmail: 'ana.perez@correo.com',
		customerPhone: '3001234567',
		customerIdType: 'CC',
		customerIdNumber: '1234567890',
		blockingAmount: 2000000,
		termsVersion: '2026-11-23',
		termsHash: 'a'.repeat(64),
		termsAcceptedAt: new Date('2026-11-23T10:00:00Z'),
		termsAcceptedIp: '10.0.0.20',
		payment: { id: 'pay_1', token: 'tok_real_9f8e7d6c', tokenStatus: 'ACTIVO' },
		vehicle: { name: 'Kia Picanto' }
	};
}

function pendingChargeFixture(overrides: Obj = {}): Obj {
	return {
		id: 'chg_previo',
		reservationId: 'res_1',
		reference: 'COL-DIN-2026-0001-PREV',
		amount: 50000,
		concept: 'DEDUCIBLE',
		status: 'PENDIENTE',
		resolution: null,
		createdAt: new Date('2026-11-27T09:00:00Z'),
		...overrides
	};
}

beforeEach(() => {
	state.isAdmin = true;
	state.collectResult = { ok: true, status: 'APPROVED', message: 'Aprobado', authorization: 'AUTH-1' };
	state.collectCalls.length = 0;
	state.chargesAtGatewayCall.length = 0;
	state.chargeCreates.length = 0;
	state.chargeUpdates.length = 0;
	state.charges.length = 0;
	state.pendingCharge = null;
	state.charge = null;
	state.recentCharges = [];
	state.chargedAmounts = [];
	state.syncLogs.length = 0;
	state.invalidateCalls.length = 0;
	state.reservation = reservationFixture();
});

describe('POST /api/payments/collect — persistencia previa y bloqueo', () => {
	it('guarda el cargo PENDIENTE con su referencia antes de llamar a la pasarela', async () => {
		const res = await cobrar();

		expect(res.status).toBe(200);
		// Un solo cargo, y ya existía cuando la pasarela recibió la petición.
		expect(state.chargesAtGatewayCall).toEqual([1]);
		expect(state.chargeCreates[0]).toMatchObject({
			data: {
				status: 'PENDIENTE',
				amount: 80000,
				reference: expect.stringMatching(/^COL-DIN-2026-0001-/)
			}
		});
		// No se envía nada de más a la pasarela: el cargo es local.
		expect((state.chargeCreates[0].data as Obj).transactionId).toBeUndefined();
	});

	it('completa el cargo con el veredicto aprobado y su autorización', async () => {
		await cobrar();

		expect(state.chargeUpdates[0]).toMatchObject({
			where: { id: 'chg_nuevo' },
			data: { status: 'APROBADO', transactionId: 'AUTH-1' }
		});
	});

	it('bloquea un segundo cobro mientras el anterior siga PENDIENTE', async () => {
		state.pendingCharge = pendingChargeFixture();

		const res = await cobrar();
		const body = (await res.json()) as {
			code?: string;
			error?: string;
			pending?: { id: string; reference: string; amount: number };
		};

		expect(res.status).toBe(409);
		expect(body.code).toBe('PENDING_CHARGE');
		expect(body.error).toContain('COL-DIN-2026-0001-PREV');
		expect(body.pending).toMatchObject({
			id: 'chg_previo',
			reference: 'COL-DIN-2026-0001-PREV',
			amount: 50000
		});
		// Ni llamada a la pasarela ni cargo nuevo.
		expect(state.collectCalls).toHaveLength(0);
		expect(state.chargeCreates).toHaveLength(0);
	});

	it('un cobro sin veredicto deja la referencia en la respuesta para conciliarlo', async () => {
		state.collectResult = { ok: false, status: 'PENDING', message: 'fetch failed' };

		const res = await cobrar();
		const body = (await res.json()) as { code?: string; reference?: string; chargeId?: string; error?: string };

		expect(res.status).toBe(502);
		expect(body.code).toBe('UNCONFIRMED_CHARGE');
		expect(body.reference).toMatch(/^COL-DIN-2026-0001-/);
		expect(body.chargeId).toBe('chg_nuevo');
		expect(body.error).toContain('bloquea nuevos cobros');
		// El cargo sigue PENDIENTE (es lo que impide el reintento a ciegas) y solo
		// se guarda el rastro de la pasarela para la conciliación.
		expect(state.chargeUpdates).toHaveLength(1);
		expect((state.chargeUpdates[0].data as Obj).status).toBeUndefined();
		expect((state.chargeUpdates[0].data as Obj).p2pStatusMessage).toBe('fetch failed');
	});

	it('un rechazo por validación no deja la reserva bloqueada', async () => {
		state.collectResult = {
			ok: false,
			status: 'PENDING',
			message: 'amount inválido',
			error: 'Solicitud rechazada por validación de la pasarela'
		};

		const res = await cobrar();

		expect(res.status).toBe(502);
		expect(state.chargeUpdates[0]).toMatchObject({
			where: { id: 'chg_nuevo' },
			data: { status: 'RECHAZADO', resolution: 'NO_EJECUTADO' }
		});
	});

	it('un cierre NO_EJECUTADO no cuenta como rechazo del emisor', async () => {
		state.recentCharges = [
			{ status: 'RECHAZADO', resolution: null },
			{ status: 'RECHAZADO', resolution: 'NO_EJECUTADO' },
			{ status: 'RECHAZADO', resolution: null }
		];
		state.collectResult = { ok: false, status: 'REJECTED', message: 'Fondos insuficientes' };

		const res = await cobrar();
		const body = (await res.json()) as { attempts?: number };

		expect(res.status).toBe(402);
		// Dos rechazos reales, no tres: el cierre manual no acerca al límite.
		expect(body.attempts).toBe(2);
		expect(state.invalidateCalls).toHaveLength(0);
	});
});

describe('POST /api/payments/collect/[chargeId]/resolve', () => {
	beforeEach(() => {
		state.charge = { ...pendingChargeFixture(), reservation: { code: 'DIN-2026-0001' } };
	});

	it('responde 401 sin sesión de administrador', async () => {
		state.isAdmin = false;

		const res = await cerrar('chg_previo', { resolution: 'NO_EJECUTADO', note: 'No existe el cobro' });

		expect(res.status).toBe(401);
		expect(state.chargeUpdates).toHaveLength(0);
	});

	it('rechaza una resolución distinta de EJECUTADO o NO_EJECUTADO', async () => {
		const res = await cerrar('chg_previo', { resolution: 'TAL_VEZ' });

		expect(res.status).toBe(400);
		expect(state.chargeUpdates).toHaveLength(0);
	});

	it('exige la autorización para cerrar como ejecutado', async () => {
		const res = await cerrar('chg_previo', { resolution: 'EJECUTADO' });

		expect(res.status).toBe(400);
		expect(state.chargeUpdates).toHaveLength(0);
	});

	it('exige el motivo para cerrar como no ejecutado', async () => {
		const res = await cerrar('chg_previo', { resolution: 'NO_EJECUTADO' });

		expect(res.status).toBe(400);
		expect(state.chargeUpdates).toHaveLength(0);
	});

	it('responde 404 si el cargo no existe', async () => {
		state.charge = null;

		const res = await cerrar('chg_inexistente', { resolution: 'EJECUTADO', authorization: 'AUTH-7' });

		expect(res.status).toBe(404);
		expect(state.chargeUpdates).toHaveLength(0);
	});

	it('no permite cerrar dos veces el mismo cargo', async () => {
		state.charge = pendingChargeFixture({ status: 'APROBADO', resolution: 'EJECUTADO' });

		const res = await cerrar('chg_previo', { resolution: 'EJECUTADO', authorization: 'AUTH-7' });

		expect(res.status).toBe(409);
		expect(state.chargeUpdates).toHaveLength(0);
	});

	it('cierra como ejecutado con la autorización y lo audita', async () => {
		const res = await cerrar('chg_previo', {
			resolution: 'EJECUTADO',
			authorization: '4815162342',
			note: 'Cobro visible en PlacetoPay'
		});
		const body = (await res.json()) as { ok?: boolean; charge?: Obj };

		expect(res.status).toBe(200);
		expect(body.charge).toMatchObject({
			status: 'APROBADO',
			resolution: 'EJECUTADO',
			authorization: '4815162342'
		});
		expect(state.chargeUpdates[0]).toMatchObject({
			where: { id: 'chg_previo' },
			data: {
				status: 'APROBADO',
				resolution: 'EJECUTADO',
				transactionId: '4815162342',
				resolutionNote: 'Cobro visible en PlacetoPay'
			}
		});
		expect((state.chargeUpdates[0].data as Obj).resolvedAt).toBeInstanceOf(Date);

		const log = state.syncLogs[0].data as Obj;
		expect(String(log.message)).toContain('EJECUTADO');
		expect(log).toMatchObject({ entity: 'PAYMENT', entityId: 'chg_previo' });
	});

	it('cierra como no ejecutado y deja el motivo en el registro', async () => {
		const res = await cerrar('chg_previo', {
			resolution: 'NO_EJECUTADO',
			note: 'El movimiento no aparece en PlacetoPay'
		});

		expect(res.status).toBe(200);
		expect(state.chargeUpdates[0]).toMatchObject({
			data: {
				status: 'RECHAZADO',
				resolution: 'NO_EJECUTADO',
				resolutionNote: 'El movimiento no aparece en PlacetoPay'
			}
		});
		expect((state.chargeUpdates[0].data as Obj).transactionId).toBeUndefined();
	});
});
