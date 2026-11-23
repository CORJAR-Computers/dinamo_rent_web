import { describe, expect, it } from 'vitest';
import { IVA_RATE, calcTaxes } from '../src/lib/utils/taxes.js';

describe('calcTaxes', () => {
    it('calcula el 19% y el total cuadra con el subtotal', () => {
        const { subtotal, iva, total } = calcTaxes(1000000);
        expect(subtotal).toBe(1000000);
        expect(iva).toBe(190000);
        expect(total).toBe(subtotal + iva);
    });

    it('redondea el IVA al peso, sin perder ni sumar un peso en el total', () => {
        // 160000 * 3 + 35000 * 3 = 585000 → 19% = 111150
        expect(calcTaxes(585000)).toEqual({ subtotal: 585000, iva: 111150, total: 696150 });
        // 111111 * 0.19 = 21111.09 → 21111; el total siempre es subtotal + iva
        const odd = calcTaxes(111111);
        expect(odd.iva).toBe(Math.round(111111 * IVA_RATE));
        expect(odd.total).toBe(odd.subtotal + odd.iva);
        // 0.5 exacto: 50 * 0.19 = 9.5 → 10 (Math.round hacia arriba)
        expect(calcTaxes(50).iva).toBe(10);
    });

    it('no genera impuestos negativos', () => {
        expect(calcTaxes(-5000)).toEqual({ subtotal: 0, iva: 0, total: 0 });
    });

    it('omite centavos en la base, como los importes enteros de la reserva', () => {
        expect(calcTaxes(99999.6).subtotal).toBe(100000);
    });
});
