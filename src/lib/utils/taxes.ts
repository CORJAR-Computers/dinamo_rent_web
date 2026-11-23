/**
 * IVA colombiano aplicable al arrendamiento de vehículos sin conductor.
 * Las tarifas publicadas NO incluyen IVA: se calcula y se suma al total.
 */
export const IVA_RATE = 0.19;

export interface TaxBreakdown {
    /** Suma de vehículo + seguro + adicionales, sin IVA. */
    subtotal: number;
    /** IVA 19% calculado sobre el subtotal. */
    iva: number;
    /** Valor total a cobrar (subtotal + IVA). */
    total: number;
}

export function calcTaxes(subtotalCOP: number): TaxBreakdown {
    const subtotal = Math.max(0, Math.round(subtotalCOP));
    const iva = Math.round(subtotal * IVA_RATE);
    return { subtotal, iva, total: subtotal + iva };
}
