import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { TERMS_TEXT, TERMS_VERSION } from '../src/lib/data/terms.js';
import { TERMS_DOCUMENT_HASH } from '../src/lib/server/termsConsent.js';

/**
 * Evidencia del consentimiento contractual:
 *
 *  - el hash guardado es el SHA-256 del texto que renderiza `/terminos`, no de
 *    una copia libre;
 *  - la reserva no se crea sin aceptación explícita;
 *  - versión, hash, fecha e IP los pone el servidor: el cliente no puede
 *    declarar que aceptó otro documento.
 */

type Obj = Record<string, unknown>;

const state = vi.hoisted(() => ({
	creates: [] as Obj[],
	transactionCalls: 0
}));

vi.mock('#lib/server/rateLimit.js', () => ({
	checkRateLimit: async () => ({ allowed: true, remaining: 14, retryAfterSeconds: 600 }),
	resetRateLimit: async () => {}
}));

vi.mock('#lib/server/db.js', () => {
	const vehicle = {
		id: 'veh_1',
		name: 'Kia Picanto',
		code: 'PICANTO',
		category: 'Economico',
		pricePerDay: 120000,
		units: 2,
		available: true,
		deposit: 500000
	};
	const customer = {
		id: 'cus_1',
		names: 'Ana',
		lastnames: 'Pérez',
		fullName: 'Ana Pérez',
		email: 'ana.perez@correo.com',
		phone: '3001234567',
		docType: 'CC',
		docNumber: '1234567890',
		license: null,
		licenseExp: null
	};

	const txn = {
		reservation: {
			create: async (args: Obj) => {
				state.creates.push(args);
				return {
					...(args.data as Obj),
					id: 'res_1',
					vehicle,
					customer,
					synced: false,
					desktopRef: null
				};
			}
		},
		insuranceBlock: { create: async () => ({ id: 'blk_1' }) },
		syncLog: { create: async () => ({ id: 'log_1' }) }
	};

	const db = {
		vehicle: { findUnique: async () => vehicle, findFirst: async () => vehicle },
		reservation: {
			count: async () => 0,
			findUnique: async () => null
		},
		customer: { upsert: async () => customer },
		$transaction: async (arg: unknown) => {
			state.transactionCalls += 1;
			return (arg as (client: unknown) => Promise<unknown>)(txn);
		}
	};

	return { db };
});

const { POST: createReservation } = (await import(
	'../src/routes/api/reservations/+server.js'
)) as unknown as { POST: Handler };

type Handler = (ctx: {
	request: Request;
	cookies: Cookies;
	getClientAddress: () => string;
}) => Promise<Response>;

const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() } as unknown as Cookies;

const body = (overrides: Obj = {}): Obj => ({
	vehicleId: 'veh_1',
	pickupDate: '2026-12-01',
	returnDate: '2026-12-03',
	pickupTime: '10:00',
	returnTime: '10:00',
	customerName: 'Ana',
	customerLastname: 'Pérez',
	customerEmail: 'ana.perez@correo.com',
	customerPhone: '3001234567',
	customerIdType: 'CC',
	customerIdNumber: '1234567890',
	termsAccepted: true,
	...overrides
});

const reservar = (overrides: Obj = {}): Promise<Response> =>
	createReservation({
		request: new Request('http://localhost/api/reservations', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body(overrides))
		}),
		cookies,
		getClientAddress: () => '10.0.0.20'
	});

beforeEach(() => {
	state.creates.length = 0;
	state.transactionCalls = 0;
});

describe('documento de términos', () => {
	it('el hash es el SHA-256 del texto canónico y tiene 64 hex', () => {
		expect(TERMS_DOCUMENT_HASH).toMatch(/^[a-f0-9]{64}$/);
		expect(TERMS_DOCUMENT_HASH).toBe(
			crypto.createHash('sha256').update(TERMS_TEXT, 'utf8').digest('hex')
		);
	});

	it('la versión es una fecha ISO y el texto incluye las cláusulas de cobro', () => {
		expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(TERMS_TEXT).toContain('tokenización');
		expect(TERMS_TEXT).toContain('tres (3) intentos');
		expect(TERMS_TEXT).toContain('no es un bloqueo (hold)');
	});
});

describe('POST /api/reservations — consentimiento', () => {
	it('no crea la reserva sin aceptación de términos', async () => {
		const res = await reservar({ termsAccepted: false });
		const json = (await res.json()) as { code?: string };

		expect(res.status).toBe(400);
		expect(json.code).toBe('TERMS_NOT_ACCEPTED');
		expect(state.transactionCalls).toBe(0);
		expect(state.creates).toHaveLength(0);
	});

	it('guarda versión, hash, fecha e IP del documento vigente', async () => {
		const res = await reservar();

		expect(res.status).toBe(200);
		const data = state.creates[0].data as Obj;
		expect(data.termsVersion).toBe(TERMS_VERSION);
		expect(data.termsHash).toBe(TERMS_DOCUMENT_HASH);
		expect(data.termsAcceptedAt).toBeInstanceOf(Date);
		expect(data.termsAcceptedIp).toBe('10.0.0.20');
	});

	it('ignora la versión o el hash que envíe el cliente', async () => {
		await reservar({ termsVersion: '1999-01-01', termsHash: 'f'.repeat(64) });

		const data = state.creates[0].data as Obj;
		expect(data.termsVersion).toBe(TERMS_VERSION);
		expect(data.termsHash).toBe(TERMS_DOCUMENT_HASH);
	});
});
