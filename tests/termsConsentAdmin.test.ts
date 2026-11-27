import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { TERMS_VERSION } from '../src/lib/data/terms.js';
import { TERMS_DOCUMENT_HASH } from '../src/lib/server/termsConsent.js';

/**
 * Registro auditado del consentimiento de reservas existentes.
 *
 * La ruta existe para desbloquear reservas creadas antes de exigir la
 * aceptación en el checkout, sin abrir una puerta trasera: exige administrador,
 * no sobrescribe evidencia previa, toma versión y hash del servidor y deja un
 * rastro en SyncLog con fecha, IP y responsable.
 */

type Obj = Record<string, unknown>;

const state = vi.hoisted(() => ({
	admin: true,
	reservation: null as Obj | null,
	updateCount: 1,
	updates: [] as Obj[],
	logs: [] as Obj[]
}));

vi.mock('#lib/server/adminAuth.js', () => ({
	isUserAdmin: () => state.admin
}));

vi.mock('#lib/server/db.js', () => ({
	db: {
		reservation: {
			findUnique: async () => state.reservation,
			updateMany: async (args: Obj) => {
				state.updates.push(args);
				return { count: state.updateCount };
			}
		},
		syncLog: {
			create: async (args: Obj) => {
				state.logs.push(args);
				return { id: 'log_1' };
			}
		}
	}
}));

const { POST: registerConsent } = (await import(
	'../src/routes/api/reservations/[id]/terms-consent/+server.js'
)) as unknown as { POST: Handler };

type Handler = (ctx: {
	params: { id: string };
	request: Request;
	cookies: Cookies;
	getClientAddress: () => string;
}) => Promise<Response>;

const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() } as unknown as Cookies;

const reservationBase: Obj = {
	id: 'res_1',
	code: 'DIN-2026-0042',
	customerName: 'Ana Pérez',
	termsVersion: null,
	termsHash: null,
	termsAcceptedAt: null,
	termsAcceptedIp: null,
	termsAcceptedBy: null,
	termsAcceptanceNote: null
};

const call = (
	payload: Obj = { registeredBy: 'Jorge Mostrador', note: 'Contrato firmado en oficina, 27 nov' },
	ip = '10.0.0.30'
): Promise<Response> =>
	registerConsent({
		params: { id: 'res_1' },
		request: new Request('http://localhost/api/reservations/res_1/terms-consent', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		}),
		cookies,
		getClientAddress: () => ip
	});

beforeEach(() => {
	state.admin = true;
	state.reservation = { ...reservationBase };
	state.updateCount = 1;
	state.updates.length = 0;
	state.logs.length = 0;
});

describe('POST /api/reservations/:id/terms-consent — permisos', () => {
	it('rechaza sin sesión de administrador y no escribe nada', async () => {
		state.admin = false;
		const res = await call();

		expect(res.status).toBe(401);
		expect(state.updates).toHaveLength(0);
		expect(state.logs).toHaveLength(0);
	});
});

describe('POST /api/reservations/:id/terms-consent — validación', () => {
	it('exige el responsable del registro', async () => {
		const res = await call({ registeredBy: 'ab', note: 'Contrato firmado en oficina' });

		expect(res.status).toBe(400);
		expect(state.updates).toHaveLength(0);
	});

	it('exige un soporte verificable', async () => {
		const res = await call({ registeredBy: 'Jorge Mostrador', note: 'ok' });

		expect(res.status).toBe(400);
		expect(state.updates).toHaveLength(0);
	});

	it('responde 404 si la reserva no existe', async () => {
		state.reservation = null;
		const res = await call();

		expect(res.status).toBe(404);
	});
});

describe('POST /api/reservations/:id/terms-consent — evidencia', () => {
	it('guarda versión, hash, fecha, IP y rastro del registro manual', async () => {
		const res = await call();
		const json = (await res.json()) as { ok: boolean; consent: Obj };

		expect(res.status).toBe(200);
		expect(json.ok).toBe(true);
		expect(json.consent.version).toBe(TERMS_VERSION);
		expect(json.consent.hash).toBe(TERMS_DOCUMENT_HASH);
		expect(json.consent.ip).toBe('10.0.0.30');
		expect(json.consent.registeredBy).toBe('Jorge Mostrador');

		const data = state.updates[0].data as Obj;
		expect(data.termsVersion).toBe(TERMS_VERSION);
		expect(data.termsHash).toBe(TERMS_DOCUMENT_HASH);
		expect(data.termsAcceptedAt).toBeInstanceOf(Date);
		expect(data.termsAcceptedIp).toBe('10.0.0.30');
		expect(data.termsAcceptedBy).toBe('Jorge Mostrador');
		expect(String(data.termsAcceptanceNote)).toContain('Contrato firmado');

		// La escritura solo aplica si la reserva seguía sin consentimiento.
		const where = state.updates[0].where as Obj;
		expect(where).toMatchObject({ id: 'res_1', termsHash: null, termsAcceptedAt: null });
	});

	it('deja una entrada de auditoría con el estado anterior y la evidencia', async () => {
		await call();

		expect(state.logs).toHaveLength(1);
		const log = state.logs[0].data as Obj;
		expect(log.entity).toBe('RESERVATION');
		expect(log.entityId).toBe('res_1');
		expect(String(log.message)).toContain('Registro manual de Términos');

		const payload = log.payload as Obj;
		expect(payload.registeredBy).toBe('Jorge Mostrador');
		expect(payload.hash).toBe(TERMS_DOCUMENT_HASH);
		expect(payload.ip).toBe('10.0.0.30');
		expect(payload.previous).toMatchObject({ termsHash: null, termsAcceptedAt: null });
	});

	it('ignora la versión y el hash que envíe el cliente', async () => {
		await call({
			registeredBy: 'Jorge Mostrador',
			note: 'Contrato firmado en oficina',
			termsVersion: '1999-01-01',
			termsHash: 'f'.repeat(64)
		});

		const data = state.updates[0].data as Obj;
		expect(data.termsVersion).toBe(TERMS_VERSION);
		expect(data.termsHash).toBe(TERMS_DOCUMENT_HASH);
	});

	it('no sobrescribe un consentimiento ya registrado', async () => {
		state.reservation = {
			...reservationBase,
			termsVersion: TERMS_VERSION,
			termsHash: TERMS_DOCUMENT_HASH,
			termsAcceptedAt: new Date('2026-11-23T10:00:00Z'),
			termsAcceptedIp: '10.0.0.20'
		};

		const res = await call();
		const json = (await res.json()) as { code?: string };

		expect(res.status).toBe(409);
		expect(json.code).toBe('CONSENT_ALREADY_RECORDED');
		expect(state.updates).toHaveLength(0);
		expect(state.logs).toHaveLength(0);
	});

	it('no escribe si otro registro completó el consentimiento a la vez', async () => {
		state.updateCount = 0;

		const res = await call();
		const json = (await res.json()) as { code?: string };

		expect(res.status).toBe(409);
		expect(json.code).toBe('CONSENT_ALREADY_RECORDED');
		expect(state.logs).toHaveLength(0);
	});
});
