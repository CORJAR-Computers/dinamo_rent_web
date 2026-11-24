import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

/**
 * Regresión del endurecimiento de la consulta pública de reservas.
 *
 * El mock de Prisma aplica el `select` de verdad, igual que la base de datos: si
 * alguien cambia la consulta pública por un `include`, el mock devuelve la fila
 * completa —con token, ids de pasarela y PII— y los tests fallan por fuga. Las
 * aserciones sobre el JSON son, por eso, sobre datos que el mock realmente
 * habría entregado, no sobre un fixture ya "limpio".
 */

type Obj = Record<string, unknown>;

const state = vi.hoisted(() => ({
	isAdmin: false,
	queries: [] as Obj[],
	rows: [] as Obj[]
}));

vi.mock('#lib/server/adminAuth.js', () => ({
	isUserAdmin: () => state.isAdmin
}));

// El límite compartido tiene su propio test; aquí solo añadiría ruido.
vi.mock('#lib/server/rateLimit.js', () => ({
	checkRateLimit: async () => ({ allowed: true, remaining: 19, retryAfterSeconds: 600 }),
	resetRateLimit: async () => {}
}));

vi.mock('#lib/server/db.js', () => {
	/** Emula `select` de Prisma: solo las claves pedidas, con sus subselects. */
	function project(source: unknown, select?: Obj): unknown {
		if (select === undefined) return source;
		if (source === null || source === undefined) return null;
		return applySelect(source as Obj, select);
	}

	function applySelect(row: Obj, select: Obj): Obj {
		const out: Obj = {};
		for (const [key, value] of Object.entries(select)) {
			if (!(key in row)) continue;
			const nested = value === true ? undefined : ((value as { select?: Obj }).select ?? {});
			out[key] = project(row[key], nested);
		}
		return out;
	}

	const query = (args: Obj) => {
		state.queries.push(args);
		return state.rows.map((row) => project(row, args.select as Obj | undefined) as Obj);
	};

	return {
		db: {
			reservation: {
				findFirst: async (args: Obj) => query(args)[0] ?? null,
				findMany: async (args: Obj) => query(args)
			}
		}
	};
});

const { GET: listReservations } = (await import('../src/routes/api/reservations/+server.js')) as unknown as {
	GET: Handler;
};
const { GET: getReservation } = (await import('../src/routes/api/reservations/[id]/+server.js')) as unknown as {
	GET: Handler;
};
const { PUBLIC_RESERVATION_SELECT } = await import('../src/lib/server/reservationView.js');

type Handler = (ctx: {
	url: URL;
	cookies: Cookies;
	params: Obj;
	getClientAddress: () => string;
}) => Promise<Response>;

const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() } as unknown as Cookies;

function request(path: string, search = ''): Parameters<Handler>[0] {
	return {
		url: new URL(`http://localhost${path}${search}`),
		cookies,
		params: {},
		getClientAddress: () => '10.10.10.10'
	};
}

function byId(id: string): Parameters<Handler>[0] {
	return { ...request(`/api/reservations/${id}`), params: { id } };
}

/** Fila completa tal como está en la base: con token, ids de pasarela y PII. */
function fullReservation(): Obj {
	return {
		id: 'res_1',
		code: 'DIN-2026-0001',
		status: 'PAGADA',
		pickupTime: '10:00',
		pickupLocation: 'Oficina Principal — Crespo',
		days: 4,
		totalAmount: 571200,
		insurancePlan: 'TOTAL',
		customerName: 'Ana',
		customerLastname: 'Pérez',
		customerEmail: 'ana.perez@correo.com',
		customerPhone: '3001234567',
		customerIdNumber: '1234567890',
		customerHotel: 'Hotel Caribe',
		docPhotoUrl: 'https://blob.local/doc.jpg',
		signatureDataUrl: 'data:image/png;base64,AAAA',
		notes: 'Nota interna del mostrador',
		synced: true,
		syncedAt: new Date('2026-11-20T12:00:00.000Z'),
		desktopRef: 'DESK-123456',
		vehicle: { id: 'veh_1', name: 'Kia Picanto', image: '/cars/picanto.jpg', plate: 'ABC123' },
		payment: {
			id: 'pay_1',
			status: 'APROBADO',
			amount: 571200,
			transactionId: 'AUTH-778899',
			cardBrand: 'VISA',
			cardLast4: '4242',
			token: 'tok_real_9f8e7d6c',
			tokenStatus: 'ACTIVO',
			tokenValidUntil: '2029-12-31',
			p2pRequestId: '987654321',
			p2pProcessUrl: 'https://checkout.placetopay.com/session/987654321',
			p2pStatusMessage: 'Transacción aprobada',
			gatewayRef: 'P2P-INTERNAL-REF'
		},
		insuranceBlock: { code: 'BLK-SECRETO-123', status: 'ACTIVO' },
		depositCharges: [{ id: 'chg_1', amount: 50000 }]
	};
}

const SELECTED = flatten(PUBLIC_RESERVATION_SELECT as unknown as Obj);

/**
 * Nombres de campo prohibidos, a cualquier profundidad: la comprobación es por
 * `endsWith('.nombre')`, así que `token` cubre también `payment.token`.
 */
const FORBIDDEN = [
	'token',
	'tokenValidUntil',
	'tokenFranchise',
	'p2pRequestId',
	'p2pProcessUrl',
	'p2pStatusMessage',
	'p2pOpType',
	'gatewayRef',
	'customer',
	'customerEmail',
	'customerPhone',
	'customerIdType',
	'customerIdNumber',
	'customerLicense',
	'customerLicenseExp',
	'customerHotel',
	'docPhotoUrl',
	'licensePhotoUrl',
	'signatureDataUrl',
	'notes',
	'insuranceBlock',
	'depositCharges',
	'syncedAt'
];

function flatten(node: Obj, prefix = ''): string[] {
	return Object.entries(node).flatMap(([key, value]) => {
		if (key === 'select') return [];
		const path = prefix ? `${prefix}.${key}` : key;
		if (!value || typeof value !== 'object') return [path];
		const nested = (value as { select?: Obj }).select ?? (value as Obj);
		return flatten(nested, path);
	});
}

function leaks(json: unknown): string[] {
	const found: string[] = [];
	const walk = (node: unknown) => {
		if (!node || typeof node !== 'object') return;
		for (const [key, value] of Object.entries(node)) {
			if (FORBIDDEN.some((forbidden) => key === forbidden)) found.push(key);
			walk(value);
		}
	};
	walk(json);
	return found;
}

const lastQuery = () => state.queries.at(-1) as Obj;

beforeEach(() => {
	state.isAdmin = false;
	state.queries.length = 0;
	state.rows = [fullReservation()];
});

describe('GET /api/reservations — vista pública', () => {
	it('la allowlist no selecciona token, ids de pasarela ni PII', () => {
		for (const field of FORBIDDEN) {
			expect(SELECTED, `la vista pública no debe seleccionar ${field}`).not.toContain(field);
		}
		// Lo que el comprobante necesita sí sigue en la allowlist.
		expect(SELECTED).toEqual(
			expect.arrayContaining(['code', 'customerName', 'payment.cardLast4', 'payment.tokenStatus'])
		);
	});

	it('rechaza con 400 toda consulta sin código ni referencia de pago', async () => {
		for (const search of ['', '?email=ana.perez@correo.com', '?docNumber=1234567890']) {
			const res = await listReservations(request('/api/reservations', search));
			expect(res.status, `consulta "${search || 'sin parámetros'}"`).toBe(400);
		}
		expect(state.queries).toHaveLength(0);
	});

	it('busca por código y devuelve solo la fila proyectada por la allowlist', async () => {
		const res = await listReservations(request('/api/reservations', '?code=din-2026-0001'));

		expect(res.status).toBe(200);
		expect(lastQuery().where).toEqual({ code: 'DIN-2026-0001' });
		expect(lastQuery().select).toEqual(PUBLIC_RESERVATION_SELECT);
		expect(lastQuery().include).toBeUndefined();
		expect(res.headers.get('cache-control')).toBe('no-store');

		const body = await res.json();
		expect(leaks(body)).toEqual([]);

		// El mock habría devuelto el token y la PII si la consulta fuera un include:
		// comprobarlo en crudo evita que una proyección rota pase desapercibida.
		const raw = JSON.stringify(body);
		for (const secreto of ['tok_real_9f8e7d6c', 'ana.perez@correo.com', '3001234567', '987654321']) {
			expect(raw).not.toContain(secreto);
		}
		// Y lo permitido no se perdió por el camino.
		expect(body).toMatchObject({
			count: 1,
			reservations: [{ code: 'DIN-2026-0001', payment: { cardLast4: '4242', tokenStatus: 'ACTIVO' } }]
		});
	});

	it('busca por referencia de pago sin exponer el resto de la fila', async () => {
		const res = await listReservations(request('/api/reservations', '?requestId=987654321'));

		expect(res.status).toBe(200);
		expect(lastQuery().where).toEqual({ payment: { p2pRequestId: '987654321' } });
		expect(lastQuery().select).toEqual(PUBLIC_RESERVATION_SELECT);
		expect(leaks(await res.json())).toEqual([]);
	});

	it('ignora email y documento aunque viajen junto al código', async () => {
		const res = await listReservations(
			request('/api/reservations', '?code=DIN-2026-0001&email=ana.perez@correo.com&docNumber=1234567890')
		);

		expect(res.status).toBe(200);
		expect(lastQuery().where).toEqual({ code: 'DIN-2026-0001' });
	});

	it('con sesión de administrador conserva los filtros y la fila completa', async () => {
		state.isAdmin = true;
		const res = await listReservations(request('/api/reservations', '?email=ana.perez@correo.com'));

		expect(res.status).toBe(200);
		expect(lastQuery().where).toEqual({ customerEmail: 'ana.perez@correo.com' });
		expect(lastQuery().include).toBeDefined();
		expect(lastQuery().select).toBeUndefined();

		// El token solo está disponible aquí; el cobro de garantía lo necesita.
		const body = (await res.json()) as { reservations: Array<{ payment: { token: string } }> };
		expect(body.reservations[0].payment.token).toBe('tok_real_9f8e7d6c');
	});
});

describe('GET /api/reservations/[id] — vista pública', () => {
	it('sin sesión proyecta la allowlist y no filtra token ni PII', async () => {
		const res = await getReservation(byId('DIN-2026-0001'));

		expect(res.status).toBe(200);
		expect(lastQuery().select).toEqual(PUBLIC_RESERVATION_SELECT);
		expect(lastQuery().include).toBeUndefined();
		// Acepta el código además del id interno.
		expect(lastQuery().where).toEqual({
			OR: [{ id: 'DIN-2026-0001' }, { code: 'DIN-2026-0001' }]
		});

		const raw = JSON.stringify(await res.json());
		expect(raw).not.toContain('tok_real_9f8e7d6c');
		expect(raw).not.toContain('ana.perez@correo.com');
	});

	it('con sesión de administrador devuelve la fila completa', async () => {
		state.isAdmin = true;
		const res = await getReservation(byId('res_1'));

		expect(res.status).toBe(200);
		expect(lastQuery().include).toBeDefined();
		const body = (await res.json()) as { reservation: { payment: { token: string } } };
		expect(body.reservation.payment.token).toBe('tok_real_9f8e7d6c');
	});
});
