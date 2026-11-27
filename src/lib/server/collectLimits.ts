/**
 * TOPE CONTRACTUAL DE LOS COBROS CON TOKEN — único punto de configuración.
 *
 * El tope NO se define aquí con una cifra: sale de `Reservation.blockingAmount`,
 * el bloqueo de garantía que la reserva ya calcula al crearse (vehículo × plan
 * de seguro). Es el importe que el cliente autoriza y el que el panel muestra
 * como garantía, así que no hace falta inventar un límite nuevo.
 *
 * PARA AJUSTARLO:
 *  - Si el negocio autoriza cobrar por encima del bloqueo, sube
 *    `COLLECT_CAP_FACTOR` (por ejemplo 1.2 = hasta un 20 % adicional).
 *  - Si el tope debe venir de otra fuente contractual, cambia el cuerpo de
 *    `contractCapCOP()`: es la única función que decide el límite y la usan
 *    tanto el cobro individual como el acumulado.
 *  - Si devuelve `null`, el cobro se rechaza: una reserva sin monto de garantía
 *    no tiene tope contra el que validar, y cobrar sin tope no es aceptable.
 *
 * El acumulado cuenta los cargos APROBADOS más los PENDIENTES (un pendiente sin
 * resolver pudo haber cobrado y bloquea la reserva de todos modos).
 */

/** Multiplicador sobre el bloqueo de garantía. 1 = no se puede superar. */
export const COLLECT_CAP_FACTOR = 1;

/** Tope en COP para la reserva, o `null` si no hay bloqueo de garantía. */
export function contractCapCOP(blockingAmount: number | null | undefined): number | null {
	const base = Math.round(Number(blockingAmount ?? 0));
	if (!Number.isFinite(base) || base <= 0) return null;
	return Math.round(base * COLLECT_CAP_FACTOR);
}

export type CollectLimitFailure = {
	ok: false;
	code: 'EXCEEDS_GUARANTEE' | 'EXCEEDS_ACCUMULATED';
	error: string;
	cap: number;
	alreadyCharged: number;
	remaining: number;
};

/**
 * Valida un cobro contra el tope de la reserva:
 *  1. ningún cobro individual puede superar el tope;
 *  2. la suma de lo ya cobrado más este intento tampoco.
 */
export function checkCollectAmount(params: {
	amount: number;
	cap: number;
	alreadyCharged: number;
}): { ok: true; remaining: number } | CollectLimitFailure {
	const { amount, cap, alreadyCharged } = params;
	const remaining = Math.max(0, cap - alreadyCharged);

	if (amount > cap) {
		return {
			ok: false,
			code: 'EXCEEDS_GUARANTEE',
			error: `El monto (${amount} COP) supera el tope de garantía de la reserva (${cap} COP).`,
			cap,
			alreadyCharged,
			remaining
		};
	}

	if (alreadyCharged + amount > cap) {
		return {
			ok: false,
			code: 'EXCEEDS_ACCUMULATED',
			error: `El cobro (${amount} COP) supera el saldo disponible de la garantía: ya se cobraron ${alreadyCharged} COP de ${cap} COP y quedan ${remaining} COP.`,
			cap,
			alreadyCharged,
			remaining
		};
	}

	return { ok: true, remaining: remaining - amount };
}
