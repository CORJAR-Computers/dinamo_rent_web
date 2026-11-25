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
	reservationUpdates: [] as Array<Record<string, unknown>>,
	syncLogs: [] as Array<Record<string, unknown>>
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
		syncLog: {
			create: async (args: Record<string, unknown>) => {
				dbState.syncLogs.push(args);
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

/** Firma SHA-256 con el prefijo que exige Evertec tras la migración. */
function signSha256(requestId: string, status: string, date: string, secret = SECRET): string {
	return `sha256:${createHash('sha256').update(`${requestId}${status}${date}${secret}`).digest('hex')}`;
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
		reservation: { code: 'DIN-2026-9001', status: 'PENDIENTE' }
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
	dbState.syncLogs.length = 0;
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

describe('webhook PlacetoPay: firma SHA-256 con prefijo', () => {
	it('acepta una firma SHA-256 válida y procesa la notificación', async () => {
		queryState.result = {
			ok: true,
			status: 'APPROVED',
			message: 'Aprobada',
			authorization: 'AUTH-456'
		};

		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: signSha256(REQUEST_ID, 'APPROVED', STATUS_DATE)
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; status: string };
		expect(body.ok).toBe(true);
		expect(body.status).toBe('APROBADO');
		expect(dbState.reservationUpdates).toHaveLength(1);
	});

	it('rechaza con 401 una firma SHA-256 calculada con otro secreto', async () => {
		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: signSha256(REQUEST_ID, 'APPROVED', STATUS_DATE, 'secreto-de-pruebas')
		});

		expect(response.status).toBe(401);
		expect(dbState.paymentUpdates).toHaveLength(0);
		expect(dbState.reservationUpdates).toHaveLength(0);
	});

	it('rechaza con 401 una firma SHA-256 manipulada', async () => {
		const valid = signSha256(REQUEST_ID, 'APPROVED', STATUS_DATE);
		const last = valid.slice(-1);
		const tampered = valid.slice(0, -1) + (last === '0' ? '1' : '0');

		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: tampered
		});

		expect(response.status).toBe(401);
		expect(dbState.paymentUpdates).toHaveLength(0);
		expect(dbState.reservationUpdates).toHaveLength(0);
	});

	it('rechaza con 401 un SHA-1 al que se le puso el prefijo sha256:', async () => {
		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: `sha256:${sign(REQUEST_ID, 'APPROVED', STATUS_DATE)}`
		});

		expect(response.status).toBe(401);
		expect(dbState.paymentUpdates).toHaveLength(0);
	});
});

describe('webhook PlacetoPay: idempotencia', () => {
	it('una notificación APPROVED repetida no reescribe un pago ya APROBADO', async () => {
		dbState.payment = {
			...paymentFixture(),
			status: 'APROBADO',
			reservation: { code: 'DIN-2026-9001', status: 'PAGADA' }
		};
		queryState.result = {
			ok: true,
			status: 'APPROVED',
			message: 'Aprobada',
			authorization: 'AUTH-123'
		};

		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: sign(REQUEST_ID, 'APPROVED', STATUS_DATE)
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; duplicate?: boolean };
		expect(body.ok).toBe(true);
		expect(body.duplicate).toBe(true);
		expect(dbState.paymentUpdates).toHaveLength(0);
		expect(dbState.reservationUpdates).toHaveLength(0);
		expect(dbState.syncLogs).toHaveLength(0);
	});

	it('un APPROVED no revive una reserva CANCELADA', async () => {
		dbState.payment = {
			...paymentFixture(),
			reservation: { code: 'DIN-2026-9001', status: 'CANCELADA' }
		};
		queryState.result = {
			ok: true,
			status: 'APPROVED',
			message: 'Aprobada',
			authorization: 'AUTH-123'
		};

		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: sign(REQUEST_ID, 'APPROVED', STATUS_DATE)
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; ignored?: string };
		expect(body.ok).toBe(true);
		expect(body.ignored).toBe('RESERVA_CANCELADA');
		expect(dbState.paymentUpdates).toHaveLength(0);
		expect(dbState.reservationUpdates).toHaveLength(0);
		expect(dbState.syncLogs).toHaveLength(1);
	});
});

describe('webhook PlacetoPay: tokenización sin cobro', () => {
	it('actualiza el token sin marcar el pago ni la reserva como aprobados', async () => {
		dbState.payment = {
			...paymentFixture(),
			status: 'APROBADO',
			reservation: { code: 'DIN-2026-9001', status: 'PAGADA' }
		};
		queryState.result = {
			ok: true,
			status: 'APPROVED',
			subscriptionOnly: true,
			token: 'tok_nuevo_12345678',
			tokenStatus: 'ACTIVO',
			cardBrand: 'MASTERCARD',
			cardLast4: '1111'
		};

		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: sign(REQUEST_ID, 'APPROVED', STATUS_DATE)
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { tokenUpdated?: boolean };
		expect(body.tokenUpdated).toBe(true);
		expect(dbState.paymentUpdates).toHaveLength(1);
		expect(dbState.reservationUpdates).toHaveLength(0);

		const update = dbState.paymentUpdates[0] as { data: Record<string, unknown> };
		expect(update.data.token).toBe('tok_nuevo_12345678');
		expect(update.data.tokenStatus).toBe('ACTIVO');
		expect(update.data.status).toBeUndefined();
		expect(dbState.syncLogs).toHaveLength(1);
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

describe('webhook PlacetoPay: pago normal con suscripción', () => {
	it('una sesión con payment y subscription marca la reserva PAGADA y no se trata como tokenización sin cobro', async () => {
		// Es la forma en que QuerySession responde a la compra del canon cuando
		// además se tokeniza la garantía: hay pago, así que subscriptionOnly es
		// false y el webhook debe seguir el camino normal.
		queryState.result = {
			ok: true,
			status: 'APPROVED',
			message: 'Pago aprobado',
			reference: 'DIN-2026-9001',
			authorization: 'AUTH-456',
			subscriptionOnly: false,
			token: 'tok_garantia_12345678',
			tokenStatus: 'ACTIVO',
			tokenFranchise: 'VISA',
			cardBrand: 'VISA',
			cardLast4: '4242'
		};

		const response = await webhook({
			requestId: REQUEST_ID,
			status: { status: 'APPROVED', date: STATUS_DATE },
			signature: sign(REQUEST_ID, 'APPROVED', STATUS_DATE)
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			status?: string;
			tokenUpdated?: boolean;
			duplicate?: boolean;
		};
		expect(body.status).toBe('APROBADO');
		expect(body.tokenUpdated).toBeUndefined();
		expect(body.duplicate).toBeUndefined();

		expect(dbState.paymentUpdates).toHaveLength(1);
		expect((dbState.paymentUpdates[0] as { data: Record<string, unknown> }).data).toMatchObject({
			status: 'APROBADO',
			token: 'tok_garantia_12345678',
			tokenStatus: 'ACTIVO'
		});
		expect(dbState.reservationUpdates).toHaveLength(1);
		expect((dbState.reservationUpdates[0] as { data: Record<string, unknown> }).data).toMatchObject({
			status: 'PAGADA'
		});
	});
});
