/**
 * Cálculo de días de alquiler en periodos de 24 horas.
 *
 * Las tarifas se publican por día de 24 horas contadas desde la hora de entrega,
 * así que la duración no puede depender solo de la fecha: entregar a las 10:00 y
 * devolver a las 18:00 tres días después son 80 horas (4 periodos), no 3 días.
 *
 * El cálculo se hace en UTC a propósito: el cliente navega en hora de Colombia y
 * el servidor corre en UTC; construir ambos instantes en UTC evita que un cambio
 * de zona u horario de verano altere el cobro entre el navegador y el backend.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RentalWindow {
    /** Milisegundos UTC del instante de entrega. */
    start: number;
    /** Milisegundos UTC del instante de devolución. */
    end: number;
}

/** Instante UTC de una fecha `YYYY-MM-DD` (con hora opcional `HH:MM`). */
function instant(date: string, time?: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? '').trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    let hours = 0;
    let minutes = 0;
    const normalizedTime = String(time ?? '').trim();
    if (TIME_PATTERN.test(normalizedTime)) {
        const [h, m] = normalizedTime.split(':').map(Number);
        hours = h;
        minutes = m;
    }

    return Date.UTC(year, month - 1, day, hours, minutes);
}

/**
 * Ventana de la renta, o `null` si alguna fecha es ilegible o la devolución no
 * es posterior a la entrega. Un mismo día es válido si la hora de devolución es
 * posterior a la de entrega.
 */
export function rentalWindow(
    pickupDate: string,
    pickupTime: string | undefined,
    returnDate: string,
    returnTime: string | undefined
): RentalWindow | null {
    const start = instant(pickupDate, pickupTime);
    const end = instant(returnDate, returnTime);
    if (start === null || end === null || end <= start) return null;
    return { start, end };
}

/** Días facturables (mínimo 1) en periodos de 24 horas desde la entrega. */
export function calcRentalDays(
    pickupDate: string,
    pickupTime: string | undefined,
    returnDate: string,
    returnTime: string | undefined
): number {
    const window = rentalWindow(pickupDate, pickupTime, returnDate, returnTime);
    if (!window) return 1;
    return Math.max(1, Math.ceil((window.end - window.start) / DAY_MS));
}
