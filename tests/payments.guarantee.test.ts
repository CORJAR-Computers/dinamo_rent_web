import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

/**
 * Regresión de los endpoints de cobro de garantía:
 *  - 401 sin sesión de administrador (collect e invalidación de token).
 *  - 402 con el número de intentos cuando la pasarela rechaza el cobro.
 *  - Invalidación automática: inmediata para rechazos definitivos y al tercer
 *    rechazo consecutivo para los transitorios (Guía de Suscripción §8).
 */

type Obj = Record<string, unknown>;

const state = vi.hoisted(() => ({
	isAdmin: false,
	collectResult: null as Obj | null,
	invalidateResult: null as Obj | null,
	collectCalls: [] as Obj[],
	invalidateCalls: [] as Array<{ token: string; reason?: string }>,
	reservation: null as Obj | null,
	recentCharges: [] as Array<{ status: string }>,
	chargeCreates: [] as Obj[],
	paymentUpdates: [] as Obj[],
	syncLogs: [] as Obj[]
}));

vi.mock('#lib/server/adminAuth.js', () => ({
	isUserAdmin: () => state.isAdmin
}));

// Solo se sustituyen las llamadas a la pasarela; `classifyTokenRejection` es el real.
vi.mock('#lib/server/placetopay.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/placetopay.js')>();
	return {
		...actual,
		collectPaymentWithToken: async (req: Obj) => {
			state.collectCalls.push(req);
			return state.collectResult;
		},
		invalidateToken: async (token: string, reason?: string) => {
			state.invalidateCalls.push({ token, reason });
			return state.invalidateResult;
		}
	};
});

vi.mock('#lib/server/db.js', () => ({
	db: {
		reservation: { findUnique: async () => state.reservation },
		depositCharge: {
			create: async (args: Obj) => {
				state.chargeCreates.push(args);
				const data = args.data as Obj;
				return {
					id: 'chg_nuevo',
					amount: data.amount,
					concept: data.concept,
					transactionId: data.transactionId,
					createdAt: new Date('2026-11-24T12:00:00.000Z')
				};
			},
			findMany: async () => state.recentCharges
		},
		payment: {
			update: async (args: Obj) => {
				state.paymentUpdates.push(args);
				return args;
			}
		},
		syncLog: {
			create: async (args: Obj) => {
				state.syncLogs.push(args);
				return args;
			}
		},
		$transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops)
	}
}));

const { POST: collect } = (await import('../src/routes/api/payments/collect/+server.js')) as unknown as {
	POST: Handler;
};

const { POST: invalidate } = (await import(
	'../src/routes/api/payments/token/invalidate/+server.js'
)) as unknown as { POST: Handler };

type Handler = (ctx: {
	request: Request;
	cookies: Cookies;
	getClientAddress: () => string;
}) => Promise<Response>;

const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() } as unknown as Cookies;

function collectRequest(body: Obj = { reservationId: 'res_1', amount: 50000, concept: 'DEDUCIBLE' }): Promise<Response> {
	return collect({
		request: new Request('http://localhost/api/payments/collect', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		cookies,
		getClientAddress: () => '10.0.0.20'
	});
}

function invalidateRequest(body: Obj = { reservationId: 'res_1', reason: 'Fin de contrato' }): Promise<Response> {
	return invalidate({
		request: new Request('http://localhost/api/payments/token/invalidate', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		cookies,
		getClientAddress: () => '10.0.0.20'
	});
}

function reservationFixture(overrides: Obj = {}): Obj {
	return {
		id: 'res_1',
		code: 'DIN-2026-0001',
		status: 'PAGADA',
		customerName: 'Ana',
		customerLastname: 'Pérez',
		customerEmail: 'ana.perez@correo.com',
		customerPhone: '3001234567',
		customerIdType: 'CC',
		customerIdNumber: '1234567890',
		payment: { id: 'pay_1', token: 'tok_real_9f8e7d6c', tokenStatus: 'ACTIVO' },
		vehicle: { name: 'Kia Picanto' },
		...overrides
	};
}

type CollectBody = {
	ok: boolean;
	error?: string;
	status?: string;
	attempts?: number;
	tokenInvalidation?: { applied: boolean; reason: string; message: string } | null;
};

beforeEach(() => {
	state.isAdmin = false;
	state.collectCalls.length = 0;
	state.invalidateCalls.length = 0;
	state.chargeCreates.length = 0;
	state.paymentUpdates.length = 0;
	state.syncLogs.length = 0;
	state.recentCharges = [];
	state.reservation = reservationFixture();
	state.collectResult = {
		ok: false,
		status: 'REJECTED',
		message: 'Fondos insuficientes',
		reference: 'COL-123',
		amountCOP: 50000
	};
	state.invalidateResult = { ok: true, message: 'Token invalidado correctamente' };
});

describe('POST /api/payments/collect — autorización', () => {
	it('responde 401 sin sesión de administrador y no llama a la pasarela', async () => {
		const res = await collectRequest();
		expect(res.status).toBe(401);
		expect(state.collectCalls).toHaveLength(0);
		expect(state.chargeCreates).toHaveLength(0);
		expect(state.invalidateCalls).toHaveLength(0);
	});
});

describe('POST /api/payments/collect — 402 con intentos', () => {
	beforeEach(() => {
		state.isAdmin = true;
	});

	it('un rechazo transitorio devuelve 402 con el número de intentos y no invalida', async () => {
		// El cargo recién creado ya está en la base: dos rechazados en total.
		state.recentCharges = [{ status: 'RECHAZADO' }, { status: 'RECHAZADO' }];

		const res = await collectRequest();
		expect(res.status).toBe(402);

		const body = (await res.json()) as CollectBody;
		expect(body.ok).toBe(false);
		expect(body.status).toBe('REJECTED');
		expect(body.attempts).toBe(2);
		expect(body.tokenInvalidation).toBeNull();
		expect(body.error).toContain('Fondos insuficientes');

		expect(state.invalidateCalls).toHaveLength(0);
		expect(state.paymentUpdates).toHaveLength(0);
		expect(state.chargeCreates).toHaveLength(1);
	});

	it('invalida el token automáticamente al tercer rechazo consecutivo', async () => {
		state.recentCharges = [
			{ status: 'RECHAZADO' },
			{ status: 'RECHAZADO' },
			{ status: 'RECHAZADO' }
		];

		const res = await collectRequest();
		expect(res.status).toBe(402);

		const body = (await res.json()) as CollectBody;
		expect(body.attempts).toBe(3);
		expect(body.tokenInvalidation?.applied).toBe(true);
		expect(body.error).toContain('desvinculada');

		expect(state.invalidateCalls).toHaveLength(1);
		expect(state.invalidateCalls[0]).toMatchObject({
			token: 'tok_real_9f8e7d6c',
			reason: '3 intentos de cobro rechazados consecutivamente'
		});

		// El token queda inutilizable en la base y el cambio se audita.
		expect(state.paymentUpdates).toHaveLength(1);
		const update = state.paymentUpdates[0] as { where: Obj; data: Obj };
		expect(update.where).toEqual({ id: 'pay_1' });
		expect(update.data.tokenStatus).toBe('CANCELADO');
		// Se audita el cobro rechazado y, aparte, la invalidación del token.
		const messages = state.syncLogs.map((log) => String((log as { data: Obj }).data.message));
		expect(messages.some((message) => message.includes('[Token]'))).toBe(true);
	});

	it('invalida de inmediato un rechazo definitivo (tarjeta vencida) con un solo intento', async () => {
		state.recentCharges = [{ status: 'RECHAZADO' }];
		state.collectResult = {
			ok: false,
			status: 'REJECTED',
			message: 'Tarjeta vencida',
			reference: 'COL-123',
			amountCOP: 50000
		};

		const res = await collectRequest();
		expect(res.status).toBe(402);

		const body = (await res.json()) as CollectBody;
		expect(body.attempts).toBe(1);
		expect(body.tokenInvalidation?.applied).toBe(true);
		expect(body.tokenInvalidation?.reason).toBe('Tarjeta vencida');
		expect(state.invalidateCalls).toHaveLength(1);
	});

	it('informa el fallo si la pasarela no confirma la invalidación y no marca el token', async () => {
		state.recentCharges = [{ status: 'RECHAZADO' }];
		state.collectResult = {
			ok: false,
			status: 'REJECTED',
			message: 'Tarjeta bloqueada por el emisor',
			reference: 'COL-123',
			amountCOP: 50000
		};
		state.invalidateResult = { ok: false, message: 'Timeout de la pasarela' };

		const res = await collectRequest();
		expect(res.status).toBe(402);

		const body = (await res.json()) as CollectBody;
		expect(body.tokenInvalidation?.applied).toBe(false);
		expect(body.error).toContain('No fue posible invalidar el token');

		// Sin confirmación de la pasarela el token no se da por cancelado.
		expect(state.paymentUpdates).toHaveLength(0);
	});
});

describe('POST /api/payments/token/invalidate', () => {
	it('responde 401 sin sesión de administrador y no toca el token', async () => {
		const res = await invalidateRequest();
		expect(res.status).toBe(401);
		expect(state.invalidateCalls).toHaveLength(0);
		expect(state.paymentUpdates).toHaveLength(0);
	});

	it('con sesión: cancela la suscripción, marca el token CANCELADO y lo audita', async () => {
		state.isAdmin = true;

		const res = await invalidateRequest();
		expect(res.status).toBe(200);

		const body = (await res.json()) as { ok: boolean; tokenStatus: string };
		expect(body.ok).toBe(true);
		expect(body.tokenStatus).toBe('CANCELADO');

		expect(state.invalidateCalls).toHaveLength(1);
		expect(state.invalidateCalls[0]).toMatchObject({
			token: 'tok_real_9f8e7d6c',
			reason: 'Fin de contrato'
		});

		expect(state.paymentUpdates).toHaveLength(1);
		const update = state.paymentUpdates[0] as { data: Obj };
		expect(update.data.tokenStatus).toBe('CANCELADO');
		expect(state.syncLogs).toHaveLength(1);
		const auditLog = state.syncLogs[0] as { data: Obj };
		expect(String(auditLog.data.message)).toContain('Suscripción cancelada');
	});

	it('con sesión: un token ya cancelado responde 400 sin volver a la pasarela', async () => {
		state.isAdmin = true;
		state.reservation = reservationFixture({
			payment: { id: 'pay_1', token: 'tok_real_9f8e7d6c', tokenStatus: 'CANCELADO' }
		});

		const res = await invalidateRequest();
		expect(res.status).toBe(400);
		expect(state.invalidateCalls).toHaveLength(0);
		expect(state.paymentUpdates).toHaveLength(0);
	});

	it('con sesión: si la pasarela no confirma, responde 502 y conserva el token', async () => {
		state.isAdmin = true;
		state.invalidateResult = { ok: false, message: 'Servicio no disponible' };

		const res = await invalidateRequest();
		expect(res.status).toBe(502);

		const body = (await res.json()) as { ok: boolean; error: string };
		expect(body.ok).toBe(false);
		expect(body.error).toContain('Servicio no disponible');
		expect(state.paymentUpdates).toHaveLength(0);
		expect(state.syncLogs).toHaveLength(1);
		const auditLog = state.syncLogs[0] as { data: Obj };
		expect(auditLog.data.status).toBe('FAILED');
	});
});
