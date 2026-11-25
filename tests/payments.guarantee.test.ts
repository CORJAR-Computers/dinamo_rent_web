import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

/**
 * Regresión de los endpoints de cobro de garantía:
 *  - 401 sin sesión de administrador (collect e invalidación de token).
 *  - 402 con el número de intentos cuando la pasarela rechaza el cobro.
 *  - Invalidación automática: inmediata para rechazos definitivos y al tercer
 *    rechazo consecutivo para los transitorios (Guía de Suscripción §8).
 *
 * Solo se sustituyen las llamadas HTTP a la pasarela: `classifyTokenRejection`
 * es la implementación real, así que la regla de negocio se prueba de verdad.
 */

type Obj = Record<string, unknown>;

const state = vi.hoisted(() => ({
	isAdmin: false,
	collectResult: {} as Obj,
	invalidateResult: {} as Obj,
	collectCalls: [] as Obj[],
	invalidateCalls: [] as Array<{ token: string; reason?: string }>,
	reservation: null as Obj | null,
	recentCharges: [] as Array<{ status: string }>,
	chargeCreates: [] as Obj[],
	findManyArgs: [] as Obj[],
	paymentUpdates: [] as Obj[],
	syncLogs: [] as Obj[]
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
		invalidateToken: async (token: string, reason?: string) => {
			state.invalidateCalls.push({ token, reason });
			return state.invalidateResult;
		}
	};
});

vi.mock('#lib/server/db.js', () => {
	// Prisma devuelve la fila escrita, no los argumentos de la llamada.
	const written = (args: Obj, id: string) => ({ id, ...(args.data as Obj) });

	return {
		db: {
			reservation: { findUnique: async () => state.reservation },
			depositCharge: {
				create: async (args: Obj) => {
					state.chargeCreates.push(args);
					return { ...written(args, 'chg_nuevo'), createdAt: new Date('2026-11-24T12:00:00Z') };
				},
				findMany: async (args: Obj) => {
					state.findManyArgs.push(args);
					return state.recentCharges;
				}
			},
			payment: {
				update: async (args: Obj) => {
					state.paymentUpdates.push(args);
					return written(args, 'pay_1');
				}
			},
			syncLog: {
				create: async (args: Obj) => {
					state.syncLogs.push(args);
					return written(args, 'log_1');
				}
			},
			// Igual que Prisma con un array de operaciones: se resuelven juntas.
			$transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops)
		}
	};
});

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

function post(handler: Handler, url: string, body: Obj): Promise<Response> {
	return handler({
		request: new Request(`http://localhost${url}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		cookies,
		getClientAddress: () => '10.0.0.20'
	});
}

const cobrar = () =>
	post(collect, '/api/payments/collect', {
		reservationId: 'res_1',
		amount: 50000,
		concept: 'DEDUCIBLE'
	});
const cancelar = () =>
	post(invalidate, '/api/payments/token/invalidate', {
		reservationId: 'res_1',
		reason: 'Fin de contrato'
	});

type CollectBody = {
	error?: string;
	attempts?: number;
	tokenInvalidation?: { applied: boolean; reason: string } | null;
};

/**
 * Deja la reserva con `previos` rechazos ya registrados y ejecuta un cobro que
 * la pasarela rechaza con `mensaje`.
 *
 * Ojo con la aritmética: el endpoint inserta el cargo ANTES de contar los
 * rechazos recientes, así que `previos` ya incluye el intento actual — es lo que
 * vería la base de datos en ese momento.
 */
async function cobroRechazado(mensaje: string, previos: number): Promise<CollectBody> {
	state.recentCharges = Array.from({ length: previos }, () => ({ status: 'RECHAZADO' }));
	state.collectResult = {
		ok: false,
		status: 'REJECTED',
		message: mensaje,
		reference: 'COL-123',
		amountCOP: 50000
	};

	const res = await cobrar();
	expect(res.status).toBe(402);
	return (await res.json()) as CollectBody;
}

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
		payment: { id: 'pay_1', token: 'tok_real_9f8e7d6c', tokenStatus: 'ACTIVO' },
		vehicle: { name: 'Kia Picanto' },
		...overrides
	};
}

beforeEach(() => {
	state.isAdmin = false;
	state.collectCalls.length = 0;
	state.invalidateCalls.length = 0;
	state.chargeCreates.length = 0;
	state.findManyArgs.length = 0;
	state.paymentUpdates.length = 0;
	state.syncLogs.length = 0;
	state.recentCharges = [];
	state.reservation = reservationFixture();
	state.collectResult = { ok: true, status: 'APPROVED', message: 'Aprobado' };
	state.invalidateResult = { ok: true, message: 'Token invalidado correctamente' };
});

describe('POST /api/payments/collect — permisos', () => {
	it('responde 401 sin sesión y no escribe ni llama a la pasarela', async () => {
		const res = await cobrar();

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

	it('un rechazo transitorio informa los intentos, no invalida y audita el rechazo', async () => {
		const body = await cobroRechazado('Fondos insuficientes', 2);

		expect(body.attempts).toBe(2);
		expect(body.tokenInvalidation).toBeNull();
		expect(body.error).toContain('Fondos insuficientes');
		expect(state.invalidateCalls).toHaveLength(0);
		expect(state.paymentUpdates).toHaveLength(0);

		// El cargo queda registrado como RECHAZADO y el conteo es sobre los más
		// recientes: si se pierde el orderBy, "consecutivos" deja de significar nada.
		expect(state.chargeCreates[0]).toMatchObject({ data: { status: 'RECHAZADO', amount: 50000 } });
		expect(state.findManyArgs[0]).toMatchObject({
			where: { reservationId: 'res_1' },
			orderBy: { createdAt: 'desc' }
		});
	});

	it('invalida el token al tercer rechazo consecutivo', async () => {
		const body = await cobroRechazado('Fondos insuficientes', 3);

		expect(body.attempts).toBe(3);
		expect(body.tokenInvalidation?.applied).toBe(true);
		expect(body.error).toContain('desvinculada');

		expect(state.invalidateCalls).toEqual([
			{ token: 'tok_real_9f8e7d6c', reason: '3 intentos de cobro rechazados consecutivamente' }
		]);
		expect(state.paymentUpdates[0]).toMatchObject({ data: { tokenStatus: 'CANCELADO' } });

		const mensajes = state.syncLogs.map((log) => String((log.data as Obj).message));
		expect(mensajes.some((mensaje) => mensaje.includes('[Token]'))).toBe(true);
	});

	it('invalida de inmediato un rechazo definitivo, sin esperar a tres intentos', async () => {
		const body = await cobroRechazado('Tarjeta vencida', 1);

		expect(body.attempts).toBe(1);
		expect(body.tokenInvalidation).toMatchObject({ applied: true, reason: 'Tarjeta vencida' });
		expect(state.invalidateCalls).toHaveLength(1);
		expect(state.paymentUpdates[0]).toMatchObject({ data: { tokenStatus: 'CANCELADO' } });
	});

	it('si la pasarela no confirma la invalidación no marca el token como cancelado', async () => {
		state.invalidateResult = { ok: false, message: 'Timeout de la pasarela' };

		const body = await cobroRechazado('Tarjeta bloqueada por el emisor', 1);

		expect(body.tokenInvalidation?.applied).toBe(false);
		expect(body.error).toContain('No fue posible invalidar el token');
		expect(state.paymentUpdates).toHaveLength(0);
	});
});

describe('POST /api/payments/collect — pasarela sin respuesta', () => {
	beforeEach(() => {
		state.isAdmin = true;
	});

	it('un fallo de comunicación deja el cargo PENDIENTE, responde 502 y no invalida el token', async () => {
		// Dos rechazos previos: si el error de red contara como tercer fallo, el
		// token del cliente se desvincularía por una caída de la pasarela.
		state.recentCharges = [{ status: 'RECHAZADO' }, { status: 'RECHAZADO' }];
		state.collectResult = {
			ok: false,
			status: 'PENDING',
			message: 'fetch failed',
			reference: 'COL-123',
			amountCOP: 50000
		};

		const res = await cobrar();
		const body = (await res.json()) as CollectBody;

		expect(res.status).toBe(502);
		expect(body.attempts).toBe(0);
		expect(body.tokenInvalidation).toBeNull();
		expect(body.error).toContain('no se modificó');

		expect(state.chargeCreates[0]).toMatchObject({ data: { status: 'PENDIENTE' } });
		expect(state.findManyArgs).toHaveLength(0);
		expect(state.invalidateCalls).toHaveLength(0);
		expect(state.paymentUpdates).toHaveLength(0);
	});
});

describe('POST /api/payments/collect — datos enviados a la pasarela', () => {
	it('cobra con el token guardado y el monto pedido', async () => {
		state.isAdmin = true;
		const res = await cobrar();

		expect(res.status).toBe(200);
		expect(state.collectCalls[0]).toMatchObject({
			token: 'tok_real_9f8e7d6c',
			amountCOP: 50000,
			customer: { docNumber: '1234567890' }
		});
	});

	it('normaliza el description a ASCII imprimible y lo acota antes de enviarlo', async () => {
		state.isAdmin = true;
		const res = await post(collect, '/api/payments/collect', {
			reservationId: 'res_1',
			amount: 50000,
			concept: 'DEDUCIBLE',
			description: `Daño en espejo — “izquierdo” #1\nAcción de garantía ${'x'.repeat(400)}`
		});

		expect(res.status).toBe(200);
		const sent = state.collectCalls[0] as unknown as { description: string };
		// La API de PlacetoPay valida description: nada fuera de ASCII, sin saltos
		// de línea y con longitud acotada (causa del error reportado por Evertec).
		expect(sent.description).toMatch(/^[A-Za-z0-9 .,()_:/+-]+$/);
		expect(sent.description).not.toContain('—');
		expect(sent.description).not.toContain('#');
		expect(sent.description).not.toContain('\n');
		expect(sent.description.length).toBeLessThanOrEqual(200);
		expect(sent.description).toContain('DEDUCIBLE');
		expect(sent.description).toContain('DIN-2026-0001');
	});
});

describe('POST /api/payments/token/invalidate', () => {
	it('responde 401 sin sesión y no toca el token', async () => {
		const res = await cancelar();

		expect(res.status).toBe(401);
		expect(state.invalidateCalls).toHaveLength(0);
		expect(state.paymentUpdates).toHaveLength(0);
	});

	it('con sesión: invalida en la pasarela, marca CANCELADO y audita', async () => {
		state.isAdmin = true;
		const res = await cancelar();

		expect(res.status).toBe(200);
		expect(state.invalidateCalls).toEqual([
			{ token: 'tok_real_9f8e7d6c', reason: 'Fin de contrato' }
		]);
		expect(state.paymentUpdates[0]).toMatchObject({ data: { tokenStatus: 'CANCELADO' } });

		const log = state.syncLogs[0].data as Obj;
		expect(log).toMatchObject({ status: 'PENDING' });
		expect(String(log.message)).toContain('Suscripción cancelada');
	});

	it('con sesión: un token ya cancelado responde 400 sin volver a la pasarela', async () => {
		state.isAdmin = true;
		state.reservation = reservationFixture({
			payment: { id: 'pay_1', token: 'tok_real_9f8e7d6c', tokenStatus: 'CANCELADO' }
		});

		const res = await cancelar();

		expect(res.status).toBe(400);
		expect(state.invalidateCalls).toHaveLength(0);
		expect(state.paymentUpdates).toHaveLength(0);
	});

	it('con sesión: si la pasarela falla responde 502, no actualiza y registra el fallo', async () => {
		state.isAdmin = true;
		state.invalidateResult = { ok: false, message: 'Servicio no disponible' };

		const res = await cancelar();

		expect(res.status).toBe(502);
		expect(state.paymentUpdates).toHaveLength(0);
		const log = state.syncLogs[0].data as Obj;
		expect(log).toMatchObject({ status: 'FAILED' });
		expect(String(log.message)).toContain('Servicio no disponible');
	});
});
