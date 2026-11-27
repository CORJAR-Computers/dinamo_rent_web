import crypto from 'node:crypto';
import { TERMS_TEXT, TERMS_VERSION } from '#lib/data/terms.js';

/**
 * Evidencia del consentimiento contractual.
 *
 * `TERMS_DOCUMENT_HASH` es el SHA-256 del texto exacto que renderiza
 * `/terminos` (misma fuente: `#lib/data/terms.ts`). Se guarda en la reserva al
 * aceptar y se copia a cada cobro de garantía, de modo que el cargo puede
 * señalar el documento que lo autorizó sin depender de que la reserva no cambie.
 */
export const TERMS_DOCUMENT_HASH = crypto
  .createHash('sha256')
  .update(TERMS_TEXT, 'utf8')
  .digest('hex');

/** Documento vigente: es lo que el checkout muestra y lo que se acepta. */
export function currentTermsConsent(): { version: string; hash: string } {
  return { version: TERMS_VERSION, hash: TERMS_DOCUMENT_HASH };
}
