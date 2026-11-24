import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

/**
 * Regresión del endurecimiento de la consulta pública de reservas.
 *
 * El mock de Prisma aplica el `select` de verdad (igual que la base de datos):
 * si alguien cambia la consulta pública por un `include`, el mock devuelve la
 * fila completa —con token, ids de pasarela y PII— y los tests fallan.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
	isAdmin: false,
	lastQuery: null as Row | null,
	calls: 0,
	row: null as Row | null,
	rows: [] as Row[]
}));

vi.mock('#lib/server/adminAuth.js', () => ({
	isUserAdmin: () => state.isAdmin
}));

// El límite compartido tiene su propio camino (Postgres); aquí solo estorba.
vi.mock('#lib/server/rateLimit.js', () => ({
	checkRateLimit: async () => ({ allowed: true, remaining: 19, retryAfterSeconds: 600 }),
	resetRateLimit: async () => {}
}));

vi.mock('#lib/server/db.js', () => {
	type SelectNode = Record<string, unknown>;

	/** Emula `select` de Prisma: solo las claves pedidas, con sus subselects. */
	const applySelect = (row: Row, select: SelectNode): Row => {
		const out: Row = {};
		for (const [key, value] of Object.entries(select)) {
			if (!(key in row)) continue;
			if (value === true) {
				out[key] = row[key];
			} else if (value && typeof value === 'object' && 'select' in value) {
				const nested = (value as { select: SelectNode }).select;
				const source = row[key];
				out[key] =
					source && typeof source === 'object'
						? applySelect(source as Row, nested)
						: source === null
							? null
							: undefined;
			}
		}
		return out;
	};

	const resolve = (args: Row): Row[] => {
		state.lastQuery = args;
		state.calls += 1;
		const source = args.select ? state.rows.map((r) => applySelect(r, args.select as SelectNode)) : state.rows;
		return source;
	};

	return {
		db: {
			reservation: {
				findFirst: async (args: Row) => resolve(args)[0] ?? null,
				findMany: async (args: Row) => resolve(args)
			}
		}
	};
});

const { GET: listReservations } = (await import('../src/routes/api/reservations/+server.js')) as unknown as {
	GET: GetHandler;
};

const { GET: getReservation } = (await import('../src/routes/api/reservations/[id]/+server.js')) as unknown as {
	GET: GetHandler;
};

const { PUBLIC_RESERVATION_SELECT } = await import('../src/lib/server/reservationView.js');

type GetHandler = (ctx: {
	url: URL;
	cookies: Cookies;
	params: Row;
	getClientAddress: () => string;
}) => Promise<Response>;

const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() } as unknown as Cookies;

function ctx(path: string, search = ''): Parameters<GetHandler>[0] {
	return {
		url: new URL(`http://localhost${path}${search}`),
		cookies,
		params: {},
		getClientAddress: () => '10.10.10.10'
	};
}

/** Reserva completa tal como está en la base de datos (con todo lo sensible). */
function fullReservation(): Row {
	return {
		id: 'res_1',
		code: 'DIN-2026-0001',
		status: 'PAGADA',
		pickupDate: new Date('2026-12-01T10:00:00.000Z'),
		returnDate: new Date('2026-12-05T10:00:00.000Z'),
		pickupTime: '10:00',
		returnTime: '10:00',
		pickupLocation: 'Oficina Principal — Crespo',
		returnLocation: 'Oficina Principal — Crespo',
		days: 4,
		baseAmount: 400000,
		insuranceAmount: 80000,
		extrasAmount: 0,
		blockingAmount: 1200000,
		totalAmount: 571200,
		insurancePlan: 'TOTAL',
		extras: {},
		customerName: 'Ana',
		customerLastname: 'Pérez',
		customerEmail: 'ana.perez@correo.com',
		customerPhone: '3001234567',
		customerIdType: 'CC',
		customerIdNumber: '1234567890',
		customerLicense: 'LIC-998877',
		customerLicenseExp: '2030-01-01',
		customerHotel: 'Hotel Caribe',
		docPhotoUrl: 'https://blob.local/doc.jpg',
		licensePhotoUrl: 'https://blob.local/lic.jpg',
		signatureDataUrl: 'data:image/png;base64,AAAA',
		notes: 'Nota interna del mostrador',
		synced: true,
		syncedAt: new Date('2026-11-20T12:00:00.000Z'),
		desktopRef: 'DESK-123456',
		createdAt: new Date('2026-11-19T12:00:00.000Z'),
		updatedAt: new Date('2026-11-20T12:00:00.000Z'),
		vehicle: {
			id: 'veh_1',
			name: 'Kia Picanto',
			image: '/cars/picanto.jpg',
			plate: 'ABC123',
			createdAt: new Date('2026-01-01T00:00:00.000Z')
		},
		payment: {
			id: 'pay_1',
			reservationId: 'res_1',
			status: 'APROBADO',
			amount: 571200,
			transactionId: 'AUTH-778899',
			cardHolder: 'ANA PEREZ',
			cardBrand: 'VISA',
			cardLast4: '4242',
			token: 'tok_real_9f8e7d6c',
			tokenStatus: 'ACTIVO',
			tokenValidUntil: '2029-12-31',
			tokenFranchise: 'VISA',
			p2pRequestId: '987654321',
			p2pProcessUrl: 'https://checkout.placetopay.com/session/987654321',
			p2pSessionStatus: 'APPROVED',
			p2pStatusMessage: 'Transacción aprobada',
			p2pOpType: '03',
			gatewayRef: 'P2P-INTERNAL-REF',
			createdAt: new Date('2026-11-19T12:10:00.000Z'),
			updatedAt: new Date('2026-11-19T12:12:00.000Z')
		},
		insuranceBlock: { code: 'BLK-SECRETO-123', status: 'ACTIVO' },
		depositCharges: [{ id: 'chg_1', amount: 50000 }]
	};
}

const PUBLIC_SELECT = PUBLIC_RESERVATION_SELECT as unknown as Row;

/**
 * Aplana el select anidado a rutas `padre.hijo`.
 * Prisma anida los subselects como `payment: { select: { … } }`, así que hay
 * que entrar por `select` y no tratar el envoltorio como una columna.
 */
function flattenSelect(node: Row, prefix = ''): string[] {
	const out: string[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === 'select') continue;
		const path = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === 'object') {
			const nested = 'select' in value ? ((value as { select: Row }).select as Row) : (value as Row);
			out.push(...flattenSelect(nested, path));
		} else {
			out.push(path);
		}
	}
	return out;
}

const SELECTED = flattenSelect(PUBLIC_SELECT);

/** Rutas que jamás pueden aparecer en la vista pública. */
const FORBIDDEN = [
	'token',
	'payment.token',
	'tokenValidUntil',
	'payment.tokenValidUntil',
	'tokenFranchise',
	'payment.tokenFranchise',
	'payment.p2pRequestId',
	'payment.p2pProcessUrl',
	'payment.p2pStatusMessage',
	'payment.p2pOpType',
	'payment.gatewayRef',
	'payment.id',
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
	'customer',
	'syncedAt'
];

beforeEach(() => {
	state.isAdmin = false;
	state.lastQuery = null;
	state.calls = 0;
	state.row = fullReservation();
	state.rows = [state.row];
});

describe('GET /api/reservations — lista blanca pública', () => {
	it('la allowlist no contiene token, ids de pasarela ni PII', () => {
		for (const path of FORBIDDEN) {
			expect(SELECTED, `la vista pública no debe seleccionar ${path}`).not.toContain(path);
		}
		// Los campos que sí necesita el comprobante siguen ahí.
		expect(SELECTED).toContain('code');
		expect(SELECTED).toContain('payment.cardLast4');
		expect(SELECTED).toContain('payment.tokenStatus');
		expect(SELECTED).toContain('customerName');
	});

	it('sin code ni requestId responde 400 y no consulta la base', async () => {
		const res = await listReservations(ctx('/api/reservations'));
		expect(res.status).toBe(400);
		expect(state.calls).toBe(0);
		const body = (await res.json()) as { ok: boolean };
		expect(body.ok).toBe(false);
	});

	it.each([
		['email', '?email=ana.perez@correo.com'],
		['documento', '?docNumber=1234567890']
	])('rechaza el filtro por %s con 400 y sin tocar la base', async (_label, search) => {
		const res = await listReservations(ctx('/api/reservations', search));
		expect(res.status).toBe(400);
		expect(state.calls).toBe(0);
	});

	it('busca por code con el select público y jamás devuelve token, ids ni PII', async () => {
		const res = await listReservations(ctx('/api/reservations', '?code=din-2026-0001'));
		expect(res.status).toBe(200);

		// Se consultó por código, en mayúsculas, con `select` (nunca `include`).
		const query = state.lastQuery as Row;
		expect(query.where).toEqual({ code: 'DIN-2026-0001' });
		expect(query.select).toEqual(PUBLIC_SELECT);
		expect(query.include).toBeUndefined();

		expect(res.headers.get('cache-control')).toBe('no-store');

		const raw = await res.text();
		expect(raw).not.toContain('tok_real_9f8e7d6c');
		expect(raw).not.toContain('987654321');
		expect(raw).not.toContain('checkout.placetopay.com');
		expect(raw).not.toContain('ana.perez@correo.com');
		expect(raw).not.toContain('3001234567');
		expect(raw).not.toContain('1234567890');
		expect(raw).not.toContain('BLK-SECRETO-123');
		expect(raw).not.toContain('Nota interna del mostrador');

		// Lo que el comprobante necesita sigue llegando.
		const body = JSON.parse(raw) as {
			reservations: Array<{
				code: string;
				payment: { cardLast4: string; tokenStatus: string };
			}>;
		};
		expect(body.reservations).toHaveLength(1);
		expect(body.reservations[0].code).toBe('DIN-2026-0001');
		expect(body.reservations[0].payment.cardLast4).toBe('4242');
		expect(body.reservations[0].payment.tokenStatus).toBe('ACTIVO');
	});

	it('busca por requestId (referencia de pago) sin exponer el resto de la fila', async () => {
		const res = await listReservations(ctx('/api/reservations', '?requestId=987654321'));
		expect(res.status).toBe(200);

		const query = state.lastQuery as Row;
		expect(query.where).toEqual({ payment: { p2pRequestId: '987654321' } });
		expect(query.select).toEqual(PUBLIC_SELECT);

		const raw = await res.text();
		expect(raw).not.toContain('tok_real_9f8e7d6c');
		expect(raw).not.toContain('ana.perez@correo.com');
	});

	it('ignora email y documento aunque viajen junto al código', async () => {
		const res = await listReservations(
			ctx('/api/reservations', '?code=DIN-2026-0001&email=ana.perez@correo.com&docNumber=1234567890')
		);
		expect(res.status).toBe(200);
		const query = state.lastQuery as Row;
		expect(query.where).toEqual({ code: 'DIN-2026-0001' });
	});

	it('la sesión de administrador conserva los filtros y la fila completa', async () => {
		state.isAdmin = true;
		const res = await listReservations(
			ctx('/api/reservations', '?email=ana.perez@correo.com')
		);
		expect(res.status).toBe(200);

		const query = state.lastQuery as Row;
		expect(query.where).toEqual({ customerEmail: 'ana.perez@correo.com' });
		expect(query.include).toBeDefined();
		expect(query.select).toBeUndefined();

		const body = (await res.json()) as {
			reservations: Array<{ payment: { token?: string } }>;
		};
		// El token sigue disponible solo para el panel autenticado (cobros de garantía).
		expect(body.reservations[0].payment.token).toBe('tok_real_9f8e7d6c');
	});
});

describe('GET /api/reservations/[id] — vista pública por id o código', () => {
	it('sin sesión usa el select público y no filtra token ni PII', async () => {
		const res = await getReservation({ ...ctx('/api/reservations/DIN-2026-0001'), params: { id: 'DIN-2026-0001' } });
		expect(res.status).toBe(200);

		const query = state.lastQuery as Row;
		expect(query.select).toEqual(PUBLIC_SELECT);
		expect(query.include).toBeUndefined();
		expect(query.where).toEqual({ OR: [{ id: 'DIN-2026-0001' }, { code: 'DIN-2026-0001' }] });

		const raw = await res.text();
		expect(raw).not.toContain('tok_real_9f8e7d6c');
		expect(raw).not.toContain('ana.perez@correo.com');
		expect(raw).not.toContain('3001234567');
		expect(raw).not.toContain('987654321');
	});

	it('con sesión de administrador devuelve la fila completa', async () => {
		state.isAdmin = true;
		const res = await getReservation({ ...ctx('/api/reservations/res_1'), params: { id: 'res_1' } });
		expect(res.status).toBe(200);

		const query = state.lastQuery as Row;
		expect(query.include).toBeDefined();
		const body = (await res.json()) as { reservation: { payment: { token?: string } } };
		expect(body.reservation.payment.token).toBe('tok_real_9f8e7d6c');
	});
});
