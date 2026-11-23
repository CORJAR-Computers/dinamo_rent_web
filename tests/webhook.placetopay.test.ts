import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Respuesta controlable de QuerySession. */
const queryState = vi.hoisted(() => ({
	result: null as Record<string, unknown> | null
}));

vi.mock('#lib/server/placetopay.js', () => ({
	queryPaymentSession: async (requestId: string) => ({ requestId, ...queryState.result })
}));

/** Estado que sustituye a Prisma: registra cada escritura. */
const dbState = vi.hoisted(() => ({
	payment: null as Record<string, unknown> | null,
	paymentUpdates: [] as Array<Record<string, unknown>>,
	reservationUpdates: [] as Array<Record<string, unknown>>
}));

vi.mock('#lib/server/db.js', () => ({
	db: {
		payment: {
			findFirst: async () => dbState.payment,
			update: async (args: Record<string, unknown>) => {
				dbState.paymentUpdates.push(args);
				return args;
			}
		},
		$transaction: async (fn: (txn: unknown) => Promise<unknown>) =>
			fn({
				payment: {
					update: async (args: Record<string, unknown>) => {
						dbState.paymentUpdates.push(args);
						return args;
					}
				},
				reservation: {
					update: async (args: Record<string, unknown>) => {
						dbState.reservationUpdates.push(args);
						return args;
					}
				},
				syncLog: { create: async () => ({}) }
			})
	}
}));

const { POST } = await import('../src/routes/api/webhooks/placetopay/+server.js');

const SECRET = 'clave-transaccional-real';
const REQUEST_ID = '987654321';
const STATUS_DATE = '2026-11-23T15:00:00.000Z';

function sign(requestId: string, status: string, date: string, secret = SECRET): string {
	return createHash('sha1').update(`${requestId}${status}${date}${secret}`).digest('hex');
}

async function webhook(body: unknown): Promise<Response> {
	return await POST({
		request: new Request('http://localhost/api/webhooks/placetopay', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as unknown as Parameters<typeof POST>[0]);
}

function paymentFixture() {
	return {
		id: 'pay_1',
		reservationId: 'res_1',
		status: 'PENDIENTE',
		p2pRequestId: REQUEST_ID,
		cardBrand: null,
		cardLast4: null,
		transactionId: null,
		token: null,
		tokenStatus: null,
		tokenValidUntil: null,
		tokenFranchise: null,
		reservation: { code: 'DIN-2026-9001' }
	};
}

beforeEach(() => {
	vi.stubEnv('P2P_TRAN_KEY', SECRET);
	queryState.result = {
		ok: true,
		status: 'PENDING',
		message: 'La transacción se encuentra pendiente'
	};
	dbState.payment = paymentFixture();
	dbState.paymentUpdates.length = 0;
	dbState.reservationUpdates.length = 0;
});

describe('webhook PlacetoPay: firma obligatoria', () => {
	it('rechaza con 401 un POST forjado sin firma y no escribe nada', async () => {
		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE }
		});

		expect(response.status).toBe(401);
		expect(dbState.paymentUpdates).toHaveLength(0);
		expect(dbState.reservationUpdates).toHaveLength(0);
		expect(dbState.payment?.status).toBe('PENDIENTE');
	});

	it('rechaza una firma calculada con otro secreto', async () => {
		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: sign(REQUEST_ID, 'APPROVED', STATUS_DATE, 'secreto-de-pruebas')
		});

		expect(response.status).toBe(401);
		expect(dbState.reservationUpdates).toHaveLength(0);
	});

	it('responde 500 si P2P_TRAN_KEY no está configurada (no valida nada)', async () => {
		vi.stubEnv('P2P_TRAN_KEY', '');
		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: sign(REQUEST_ID, 'APPROVED', STATUS_DATE, '')
		});

		expect(response.status).toBe(500);
		expect(dbState.paymentUpdates).toHaveLength(0);
	});
});

describe('webhook PlacetoPay: el estado sale solo de QuerySession', () => {
	it('un cuerpo APPROVED con la sesión PENDING no marca la reserva como PAGADA', async () => {
		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: sign(REQUEST_ID, 'APPROVED', STATUS_DATE)
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; status: string };
		expect(body.ok).toBe(true);
		expect(body.status).toBe('PENDIENTE');

		expect(dbState.paymentUpdates).toHaveLength(0);
		expect(dbState.reservationUpdates).toHaveLength(0);
		expect(dbState.payment?.status).toBe('PENDIENTE');
	});

	it('marca PAGADA solo cuando QuerySession confirma APPROVED', async () => {
		queryState.result = {
			ok: true,
			status: 'APPROVED',
			message: 'Aprobada',
			authorization: 'AUTH-123',
			token: 'tok_real_123',
			tokenStatus: 'ACTIVO',
			cardBrand: 'VISA',
			cardLast4: '4242'
		};

		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: sign(REQUEST_ID, 'APPROVED', STATUS_DATE)
		});

		expect(response.status).toBe(200);
		expect(dbState.paymentUpdates).toHaveLength(1);
		expect(dbState.reservationUpdates).toHaveLength(1);
		const update = dbState.paymentUpdates[0] as { data: Record<string, unknown> };
		expect(update.data.status).toBe('APROBADO');
		const reservationUpdate = dbState.reservationUpdates[0] as { data: Record<string, unknown> };
		expect(reservationUpdate.data.status).toBe('PAGADA');
	});

	it('no escribe nada si la pasarela no puede confirmar el estado', async () => {
		queryState.result = { ok: false, status: 'PENDING', message: 'Timeout de la pasarela' };

		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: sign(REQUEST_ID, 'APPROVED', STATUS_DATE)
		});

		expect(response.status).toBe(502);
		expect(dbState.paymentUpdates).toHaveLength(0);
		expect(dbState.reservationUpdates).toHaveLength(0);
	});
});
