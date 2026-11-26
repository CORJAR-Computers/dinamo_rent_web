import { describe, expect, it } from 'vitest';
import { calcRentalDays, rentalWindow } from '../src/lib/utils/rentalDays.js';

describe('calcRentalDays — periodos de 24 horas desde la hora de entrega', () => {
	it('cuenta los días completos cuando entrega y devolución tienen la misma hora', () => {
		expect(calcRentalDays('2026-11-24', '10:00', '2026-11-27', '10:00')).toBe(3);
	});

	it('cobra un periodo más cuando la devolución es más tarde que la entrega', () => {
		// 3 días y 8 horas = 80 horas -> 4 periodos de 24 horas.
		expect(calcRentalDays('2026-11-24', '10:00', '2026-11-27', '18:00')).toBe(4);
	});

	it('no suma un día cuando se devuelve antes de la hora de entrega', () => {
		// 22 horas.
		expect(calcRentalDays('2026-11-24', '10:00', '2026-11-25', '08:00')).toBe(1);
	});

	it('acepta una renta del mismo día con devolución posterior', () => {
		expect(calcRentalDays('2026-11-24', '10:00', '2026-11-24', '18:00')).toBe(1);
	});

	it('mantiene el cálculo por fecha cuando no se informan horas', () => {
		expect(calcRentalDays('2026-11-24', undefined, '2026-11-27', undefined)).toBe(3);
	});

	it('rechaza una ventana con devolución anterior a la entrega', () => {
		expect(rentalWindow('2026-11-24', '10:00', '2026-11-24', '09:00')).toBeNull();
		expect(rentalWindow('2026-11-27', '10:00', '2026-11-24', '10:00')).toBeNull();
	});

	it('rechaza fechas ilegibles', () => {
		expect(rentalWindow('no-es-fecha', '10:00', '2026-11-27', '10:00')).toBeNull();
		expect(calcRentalDays('no-es-fecha', '10:00', '2026-11-27', '10:00')).toBe(1);
	});
});
