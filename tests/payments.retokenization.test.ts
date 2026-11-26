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
	syncLogs: [] as Obj[],
	session: null as { requestId: string; createdAt: Date } | null,
	payment: { id: 'pay_1', token: null as string | null, updatedAt: new Date(0) },
	queried: [] as string[],
	sessions: null as Array<{ requestId: string; createdAt: Date }> | null
}));

vi.mock('#lib/server/adminAuth.js', () => ({
	isUserAdmin: () => state.isAdmin
}));

vi.mock('#lib/server/placetopay.js', () => ({
	queryPaymentSession: async (requestId: string) => {
		state.queried.push(requestId);
		return { requestId, ...state.query };
	}
}));

vi.mock('#lib/server/db.js', () => ({
	db: {
		reservation: {
			findUnique: async () => ({
				id: 'res_1',
				code: 'DIN-2026-0001',
				totalAmount: 190400,
				payment: state.payment
			})
		},
		payment: {
			upsert: async (args: Obj) => {
				state.upserts.push(args);
				return args;
			}
		},
		syncLog: {
			findMany: async (args: Obj) => {
				const where = args?.where as { AND?: Obj[] } | undefined;
				const and = Array.isArray(where?.AND) ? where.AND : [];
				const idFilter = and.find((entry) => {
					const payload = entry?.payload as { path?: unknown } | undefined;
					return Array.isArray(payload?.path) && payload.path[0] === 'requestId';
				});
				const idPayload = idFilter?.payload as { equals?: unknown } | undefined;
				const wanted = typeof idPayload?.equals === 'string' ? idPayload.equals : undefined;
				const list = (state.sessions ?? (state.session ? [state.session] : [])).filter(
					(session) => !wanted || session.requestId === wanted
				);
				const take = typeof args?.take === 'number' ? args.take : list.length;
				return list.slice(0, take).map((session) => ({
					createdAt: session.createdAt,
					payload: {
						purpose: 'RETOKENIZACION',
						reservationCode: 'DIN-2026-0001',
						requestId: session.requestId
					}
				}));
			},
			findFirst: async () =>
				state.session
					? {
							createdAt: state.session.createdAt,
							payload: {
								purpose: 'RETOKENIZACION',
								reservationCode: 'DIN-2026-0001',
								requestId: state.session.requestId
							}
					  }
					: null,
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
const { GET: GET_BY_PATH } = await import(
	'../src/routes/api/payments/token/resubscribe/return/[reservationId]/+server.js'
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
	state.queried.length = 0;
	state.sessions = null;
	state.session = { requestId: '555', createdAt: new Date() };
	state.payment = { id: 'pay_1', token: null, updatedAt: new Date(0) };
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

	it('sin requestId usa el último registrado al crear la sesión', async () => {
		state.session = { requestId: '777', createdAt: new Date() };

		const redirect = await callAndCatch('reservationId=res_1');

		expect(redirect.status).toBe(303);
		expect(redirect.location).toContain('token=actualizado');
		expect(state.queried).toEqual(['777']);
		expect(state.upserts).toHaveLength(1);
	});

	it('sin requestId ni sesión registrada redirige con error y no escribe', async () => {
		state.session = null;

		const redirect = await callAndCatch('reservationId=res_1');

		expect(redirect.status).toBe(303);
		expect(redirect.location).toContain('token=error');
		expect(state.queried).toHaveLength(0);
		expect(state.upserts).toHaveLength(0);
	});

	it('la ruta con reservationId en el path guarda el token sin query de sesión', async () => {
		state.session = { requestId: '888', createdAt: new Date() };

		try {
			await GET_BY_PATH({
				params: { reservationId: 'res_1' },
				url: new URL('http://localhost/api/payments/token/resubscribe/return/res_1'),
				cookies: { get: vi.fn() }
			} as unknown as Parameters<typeof GET_BY_PATH>[0]);
			throw new Error('La ruta debía redirigir y no lo hizo');
		} catch (err) {
			const redirect = err as { status?: number; location?: string };
			expect(redirect.status).toBe(303);
			expect(redirect.location).toContain('token=actualizado');
		}

		expect(state.queried).toEqual(['888']);
		expect(state.upserts).toHaveLength(1);
	});

	it('un retorno viejo no revierte una tarjeta guardada después', async () => {
		state.session = { requestId: '555', createdAt: new Date(Date.now() - 10 * 60 * 1000) };
		state.payment = {
			id: 'pay_1',
			token: 'tok_anterior_99999999',
			updatedAt: new Date()
		};

		const redirect = await callAndCatch('reservationId=res_1');

		expect(redirect.status).toBe(303);
		expect(redirect.location).toContain('token=error');
		expect(state.upserts).toHaveLength(0);
		expect(state.syncLogs).toHaveLength(0);
	});

	it('sin requestId y dos sesiones recientes no adivina cual es: falla cerrado', async () => {
		// Dos pestañas abiertas para la misma reserva: quedarse con la mas reciente
		// atribuia el retorno a una tokenizacion ajena (el falso positivo del 26-nov).
		state.sessions = [
			{ requestId: '700', createdAt: new Date() },
			{ requestId: '699', createdAt: new Date(Date.now() - 5 * 60 * 1000) }
		];

		const redirect = await callAndCatch('reservationId=res_1');

		expect(redirect.status).toBe(303);
		expect(redirect.location).toContain('token=error');
		expect(decodeURIComponent(redirect.location ?? '')).toMatch(/m[aá]s de una tokenizaci[oó]n/i);
		expect(state.queried).toHaveLength(0);
		expect(state.upserts).toHaveLength(0);
		expect(state.syncLogs).toHaveLength(0);
	});

	it('con requestId explicito elige esa sesion aunque haya otra reciente', async () => {
		state.sessions = [
			{ requestId: '700', createdAt: new Date() },
			{ requestId: '699', createdAt: new Date(Date.now() - 5 * 60 * 1000) }
		];

		const redirect = await callAndCatch('reservationId=res_1&requestId=699');

		expect(redirect.location).toContain('token=actualizado');
		expect(state.queried).toEqual(['699']);
		expect(state.upserts).toHaveLength(1);
	});
});

