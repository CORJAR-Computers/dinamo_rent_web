import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Retorno de la sesión de tokenización sin cobro (re-tokenización admin).
 * Debe guardar el instrumento y dejar intacto el estado del pago original:
 * una tarjeta nueva no convierte una reserva pendiente en PAGADA.
 */

type Obj = Record<string, unknown>;

const state = vi.hoisted(() => ({
	isAdmin: false,
	query: {} as Obj,
	upserts: [] as Obj[],
	syncLogs: [] as Obj[]
}));

vi.mock('#lib/server/adminAuth.js', () => ({
	isUserAdmin: () => state.isAdmin
}));

vi.mock('#lib/server/placetopay.js', () => ({
	queryPaymentSession: async (requestId: string) => ({ requestId, ...state.query })
}));

vi.mock('#lib/server/db.js', () => ({
	db: {
		reservation: {
			findUnique: async () => ({
				id: 'res_1',
				code: 'DIN-2026-0001',
				totalAmount: 190400,
				payment: { id: 'pay_1' }
			})
		},
		payment: {
			upsert: async (args: Obj) => {
				state.upserts.push(args);
				return args;
			}
		},
		syncLog: {
			create: async (args: Obj) => {
				state.syncLogs.push(args);
				return args;
			}
		}
	}
}));

const { GET } = await import(
	'../src/routes/api/payments/token/resubscribe/return/+server.js'
);

function call(query: string): Promise<{ status: number; location: string }> {
	return GET({
		url: new URL(`http://localhost/api/payments/token/resubscribe/return?${query}`),
		cookies: { get: vi.fn() }
	} as unknown as Parameters<typeof GET>[0]) as unknown as Promise<{
		status: number;
		location: string;
	}>;
}

/** `redirect()` lanza; aquí se captura para inspeccionar el destino. */
async function callAndCatch(
	query: string
): Promise<{ status?: number; location?: string }> {
	try {
		await call(query);
		throw new Error('La ruta debía redirigir y no lo hizo');
	} catch (err) {
		const redirect = err as { status?: number; location?: string };
		if (!redirect.location) throw err;
		return redirect;
	}
}

beforeEach(() => {
	state.isAdmin = true;
	state.upserts.length = 0;
	state.syncLogs.length = 0;
	state.query = {
		ok: true,
		status: 'APPROVED',
		message: 'Aprobada',
		token: 'tok_nuevo_12345678',
		tokenStatus: 'ACTIVO',
		tokenValidUntil: '2030-12-31',
		tokenFranchise: 'VISA',
		cardBrand: 'VISA',
		cardLast4: '4242',
		subscriptionOnly: true
	};
});

describe('GET /api/payments/token/resubscribe/return', () => {
	it('sin sesión de administrador redirige al login', async () => {
		state.isAdmin = false;

		const redirect = await callAndCatch('reservationId=res_1&requestId=555');

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/admin/login');
		expect(state.upserts).toHaveLength(0);
	});

	it('guarda el token sin cambiar el estado del pago ni de la reserva', async () => {
		const redirect = await callAndCatch('reservationId=res_1&requestId=555');

		expect(redirect.status).toBe(303);
		expect(redirect.location).toContain('token=actualizado');
		expect(redirect.location).toContain('DIN-2026-0001');

		expect(state.upserts).toHaveLength(1);
		const upsert = state.upserts[0] as {
			where: Obj;
			create: Obj;
			update: Obj;
		};
		expect(upsert.where).toEqual({ reservationId: 'res_1' });
		expect(upsert.update.token).toBe('tok_nuevo_12345678');
		expect(upsert.update.tokenStatus).toBe('ACTIVO');
		// Una tokenización no aprueba el pago ni la reserva.
		expect(upsert.update).not.toHaveProperty('status');
		expect(upsert.create.status).toBe('PENDIENTE');

		const log = state.syncLogs[0]?.data as Obj;
		expect(String(log.message)).toContain('Tarjeta de garantía actualizada');
		expect(log).toMatchObject({ status: 'PENDING' });
	});

	it('si la pasarela no entrega token, redirige con error y no escribe', async () => {
		state.query = { ok: true, status: 'PENDING', message: 'Pendiente' };

		const redirect = await callAndCatch('reservationId=res_1&requestId=555');

		expect(redirect.status).toBe(303);
		expect(redirect.location).toContain('token=error');
		expect(state.upserts).toHaveLength(0);
		expect(state.syncLogs).toHaveLength(0);
	});

	it('sin reservationId o requestId no consulta ni escribe', async () => {
		const redirect = await callAndCatch('reservationId=res_1');

		expect(redirect.status).toBe(303);
		expect(redirect.location).toContain('token=error');
		expect(state.upserts).toHaveLength(0);
	});
});
