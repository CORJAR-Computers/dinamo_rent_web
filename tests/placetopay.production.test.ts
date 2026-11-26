import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Estado que sustituye a Prisma. El objetivo es comprobar que, cuando la
 * pasarela falla en producción, la ruta de creación de sesión devuelve error
 * y NO escribe nada: ni Payment, ni actualización de la reserva a PAGADA.
 */
const state = vi.hoisted(() => ({
	reservation: null as Record<string, unknown> | null,
	paymentUpserts: [] as unknown[],
	reservationUpdates: [] as unknown[]
}));

vi.mock('#lib/server/db.js', () => ({
	db: {
		reservation: {
			findUnique: async () => state.reservation,
			update: async (args: unknown) => {
				state.reservationUpdates.push(args);
				return args;
			}
		},
		payment: {
			upsert: async (args: unknown) => {
				state.paymentUpserts.push(args);
				return args;
			},
			update: async (args: unknown) => args
		},
		// checkRateLimit escribe en el contador compartido: se emula una fila
		// permitida para no depender del respaldo en memoria, que en el CI
		// delataría una base inalcanzable.
		$queryRaw: async () => [{ count: 1, resetAt: new Date(Date.now() + 60_000) }],
		$executeRaw: async () => 1,
		$transaction: async (fn: (txn: unknown) => Promise<unknown>) =>
			fn({
				payment: { update: async () => ({}) },
				reservation: { update: async () => ({}) },
				syncLog: { create: async () => ({}) }
			})
	}
}));

const { createPaymentSession, queryPaymentSession, collectPaymentWithToken, isMockEnabled } =
	await import('../src/lib/server/placetopay.js');
const { POST } = await import('../src/routes/api/payments/create-session/+server.js');

function pendingReservation() {
	return {
		id: 'res_1',
		code: 'DIN-2026-9001',
		status: 'PENDIENTE',
		totalAmount: 190400,
		baseAmount: 160000,
		insuranceAmount: 0,
		extrasAmount: 0,
		days: 1,
		customerName: 'Juan',
		customerLastname: 'Pérez',
		customerEmail: 'juan@example.com',
		customerPhone: '3001234567',
		customerIdType: 'CC',
		customerIdNumber: '1047412345',
		vehicle: { name: 'Chevrolet Onix' },
		payment: null
	};
}

function sessionRequest() {
	return {
		reference: 'DIN-2026-9001',
		description: 'Alquiler Dinamo Rent — Chevrolet Onix (1 días)',
		amountCOP: 190400,
		taxBaseCOP: 160000,
		customer: {
			names: 'Juan',
			lastnames: 'Pérez',
			email: 'juan@example.com',
			phone: '3001234567',
			docType: 'CC',
			docNumber: '1047412345'
		},
		returnUrl: 'https://dinamo-rent-a-car.vercel.app/pago/retorno?reference=DIN-2026-9001'
	};
}

/** Ejecuta la ruta con una IP distinta por prueba para no agotar el rate limit. */
async function callCreateSession(ip: string): Promise<Response> {
	const request = new Request('http://localhost/api/payments/create-session', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ reservationId: 'res_1' })
	});

	return POST({
		request,
		url: new URL('http://localhost/api/payments/create-session'),
		getClientAddress: () => ip
	} as unknown as Parameters<typeof POST>[0]);
}

function productionEnv(): void {
	vi.stubEnv('NODE_ENV', 'production');
	vi.stubEnv('P2P_ENV', 'prod');
	vi.stubEnv('P2P_LOGIN', 'comercio-real');
	vi.stubEnv('P2P_TRAN_KEY', 'clave-transaccional-real');
	vi.stubEnv('P2P_MOCK', 'false');
}

beforeEach(() => {
	state.reservation = pendingReservation();
	state.paymentUpserts.length = 0;
	state.reservationUpdates.length = 0;
});

describe('PlaceToPay en producción: nunca simula', () => {
	it('un error de red devuelve 502 y la reserva no queda PAGADA', async () => {
		productionEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockRejectedValue(new Error('gateway no disponible'))
		);

		const response = await callCreateSession('203.0.113.10');
		expect(response.status).toBe(502);

		const body = (await response.json()) as { ok: boolean };
		expect(body.ok).toBe(false);

		// No se creó Payment ni se tocó la reserva.
		expect(state.paymentUpserts).toHaveLength(0);
		expect(state.reservationUpdates).toHaveLength(0);
		expect(state.reservation?.status).toBe('PENDIENTE');
	});

	it('una respuesta no exitosa de la pasarela no genera una sesión ficticia', async () => {
		productionEnv();
		// Cada llamada recibe una Response nueva: el cuerpo solo puede leerse una vez.
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async () =>
				new Response(
					JSON.stringify({ status: { status: 'FAILED', message: 'Error interno de la pasarela' } }),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
			)
		);

		const result = await createPaymentSession(sessionRequest());
		expect(result.ok).toBe(false);
		expect(result.processUrl).toBeUndefined();
		expect(result.requestId).toBeUndefined();

		const response = await callCreateSession('203.0.113.11');
		expect(response.status).toBe(502);
		expect(state.paymentUpserts).toHaveLength(0);
		expect(state.reservationUpdates).toHaveLength(0);
		expect(state.reservation?.status).toBe('PENDIENTE');
	});

	it('no aprueba un requestId "P2P-" inventado, ni con P2P_MOCK=true', async () => {
		productionEnv();
		vi.stubEnv('P2P_MOCK', 'true');
		expect(isMockEnabled()).toBe(false);

		const result = await queryPaymentSession('P2P-FALLBACK-1700000000000');
		expect(result.ok).toBe(false);
		expect(result.status).toBe('PENDING');
		expect(result.token).toBeUndefined();
	});

	it('trata un NODE_ENV ausente como producción', async () => {
		productionEnv();
		vi.stubEnv('NODE_ENV', '');
		vi.stubEnv('P2P_MOCK', 'true');
		expect(isMockEnabled()).toBe(false);
	});

	it('falla cerrado con P2P_ENV=prod sin credenciales y no llama a la pasarela', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('P2P_ENV', 'prod');
		vi.stubEnv('P2P_LOGIN', '');
		vi.stubEnv('P2P_TRAN_KEY', '');
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const session = await createPaymentSession(sessionRequest());
		expect(session.ok).toBe(false);
		expect(session.processUrl).toBeUndefined();
		expect(session.error).toMatch(/P2P_LOGIN y P2P_TRAN_KEY/);

		const status = await queryPaymentSession('123456');
		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/P2P_LOGIN y P2P_TRAN_KEY/);

		const collected = await collectPaymentWithToken({
			token: 'tok_real_123',
			reference: 'DIN-2026-9001',
			description: 'Cobro de garantía',
			amountCOP: 50000,
			customer: {
				names: 'Juan',
				lastnames: 'Pérez',
				email: 'juan@example.com',
				phone: '3001234567',
				docType: 'CC',
				docNumber: '1047412345'
			}
		});
		// Sin credenciales no hay veredicto del emisor: PENDING, no REJECTED. Si se
		// marcara como rechazo, tres fallos de configuración invalidarían el token
		// del cliente (ver collect/+server.ts).
		expect(collected.status).toBe('PENDING');
		expect(collected.ok).toBe(false);
		expect(collected.message).toMatch(/P2P_LOGIN y P2P_TRAN_KEY/);

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('exige P2P_ENV en producción: sin la variable falla cerrado y no cae al sandbox', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('P2P_ENV', '');
		// Credenciales presentes: el fallo debe venir de P2P_ENV, no de ellas.
		vi.stubEnv('P2P_LOGIN', 'comercio-real');
		vi.stubEnv('P2P_TRAN_KEY', 'clave-transaccional-real');
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const session = await createPaymentSession(sessionRequest());
		expect(session.ok).toBe(false);
		expect(session.processUrl).toBeUndefined();
		expect(session.error).toMatch(/P2P_ENV es obligatoria/);

		const status = await queryPaymentSession('123456');
		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/P2P_ENV es obligatoria/);

		const collected = await collectPaymentWithToken({
			token: 'tok_real_123',
			reference: 'DIN-2026-9001',
			description: 'Cobro de garantía',
			amountCOP: 50000,
			customer: {
				names: 'Juan',
				lastnames: 'Pérez',
				email: 'juan@example.com',
				phone: '3001234567',
				docType: 'CC',
				docNumber: '1047412345'
			}
		});
		// Sin configuración no hay veredicto: PENDING, nunca un rechazo que gaste intentos.
		expect(collected.ok).toBe(false);
		expect(collected.status).toBe('PENDING');
		expect(collected.message).toMatch(/P2P_ENV es obligatoria/);

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('rechaza un P2P_ENV desconocido en lugar de asumir sandbox', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('P2P_ENV', 'produccion');
		vi.stubEnv('P2P_LOGIN', 'comercio-real');
		vi.stubEnv('P2P_TRAN_KEY', 'clave-transaccional-real');
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const session = await createPaymentSession(sessionRequest());
		expect(session.ok).toBe(false);
		expect(session.error).toMatch(/P2P_ENV="produccion"/);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('acepta P2P_ENV=test explícito en producción y usa el sandbox', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('P2P_ENV', 'test');
		vi.stubEnv('P2P_LOGIN', 'comercio-sandbox');
		vi.stubEnv('P2P_TRAN_KEY', 'clave-sandbox');
		const fetchSpy = vi.fn(async () =>
			new Response(
				JSON.stringify({
					status: { status: 'OK', message: 'Sesión creada' },
					requestId: '3971301',
					processUrl: 'https://checkout-test.placetopay.com/session/3971301'
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchSpy);

		const session = await createPaymentSession(sessionRequest());
		expect(session.ok).toBe(true);
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://checkout-test.placetopay.com/api/session',
			expect.anything()
		);
	});

	it('fuera de producción, sin P2P_ENV sigue usando el sandbox', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		vi.stubEnv('P2P_ENV', '');
		vi.stubEnv('P2P_LOGIN', '');
		vi.stubEnv('P2P_TRAN_KEY', '');
		vi.stubEnv('P2P_MOCK', 'false');
		const fetchSpy = vi.fn(async () =>
			new Response(
				JSON.stringify({
					status: { status: 'OK', message: 'Sesión creada' },
					requestId: '3971302',
					processUrl: 'https://checkout-test.placetopay.com/session/3971302'
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchSpy);

		const session = await createPaymentSession(sessionRequest());
		expect(session.ok).toBe(true);
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://checkout-test.placetopay.com/api/session',
			expect.anything()
		);
	});
});

describe('modo simulado: solo desarrollo con flag explícito', () => {
	it('simula cuando NODE_ENV=development y P2P_MOCK=true', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		vi.stubEnv('P2P_MOCK', 'true');
		expect(isMockEnabled()).toBe(true);

		const result = await createPaymentSession(sessionRequest());
		expect(result.ok).toBe(true);
		expect(result.requestId).toMatch(/^P2P-/);
		expect(result.processUrl).toContain('requestId=P2P-');

		const status = await queryPaymentSession(result.requestId as string);
		expect(status.status).toBe('APPROVED');
	});

	it('no simula en desarrollo si falta el flag', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		vi.stubEnv('P2P_MOCK', 'false');
		expect(isMockEnabled()).toBe(false);

		const status = await queryPaymentSession('P2P-123');
		expect(status.ok).toBe(false);
		expect(status.status).toBe('PENDING');
	});
});
