import { describe, expect, it } from 'vitest';
import { isTokenExpired } from '../src/lib/utils/tokenValidity.js';

/**
 * Casos de fecha de la vigencia del token de garantía. El criterio es el mismo
 * que aplica `/api/payments/collect` y la sonda diaria, así que un falso
 * positivo aquí bloquearía un cobro legítimo.
 */

const at = (iso: string) => new Date(iso);

describe('isTokenExpired', () => {
	it('solo fecha: vale hasta el final de ese día en UTC', () => {
		expect(isTokenExpired('2026-11-25', at('2026-11-25T00:00:00Z'))).toBe(false);
		expect(isTokenExpired('2026-11-25', at('2026-11-25T23:59:59.998Z'))).toBe(false);
		expect(isTokenExpired('2026-11-25', at('2026-11-26T00:00:00Z'))).toBe(true);
	});

	it('con hora y sin zona: se interpreta como UTC', () => {
		expect(isTokenExpired('2026-11-25T10:00:00', at('2026-11-25T09:59:59Z'))).toBe(false);
		expect(isTokenExpired('2026-11-25T10:00:00', at('2026-11-25T10:00:01Z'))).toBe(true);
		expect(isTokenExpired('2026-11-25T10:00:00.500', at('2026-11-25T10:00:00Z'))).toBe(false);
		expect(isTokenExpired('2026-11-25 10:00:00', at('2026-11-25T09:59:59Z'))).toBe(false);
	});

	it('con zona explícita: se respeta el instante informado', () => {
		// 10:00 en Bogotá (UTC-5) = 15:00 UTC.
		expect(isTokenExpired('2026-11-25T10:00:00-05:00', at('2026-11-25T14:59:59Z'))).toBe(false);
		expect(isTokenExpired('2026-11-25T10:00:00-05:00', at('2026-11-25T15:00:01Z'))).toBe(true);
		expect(isTokenExpired('2026-11-25T10:00:00.000Z', at('2026-11-25T09:59:59Z'))).toBe(false);
		expect(isTokenExpired('2026-11-25T10:00:00.000Z', at('2026-11-25T10:00:01Z'))).toBe(true);
	});

	it('valor ausente o ilegible no se marca como vencido (decide la pasarela)', () => {
		expect(isTokenExpired(null)).toBe(false);
		expect(isTokenExpired(undefined)).toBe(false);
		expect(isTokenExpired('')).toBe(false);
		expect(isTokenExpired('   ')).toBe(false);
		expect(isTokenExpired('31/01/2020')).toBe(false);
		expect(isTokenExpired('2020-13-45')).toBe(false);
		expect(isTokenExpired('2020-01-31T25:00:00Z')).toBe(false);
		expect(isTokenExpired('pending')).toBe(false);
	});

	it('una vigencia amplia informada por la pasarela no bloquea el cobro', () => {
		expect(isTokenExpired('2029-12-31')).toBe(false);
	});
});
