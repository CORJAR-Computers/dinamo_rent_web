import { db } from '#lib/server/db.js';
import { invalidateToken } from '#lib/server/placetopay.js';

const REPLACEMENT_REASON = 'Tarjeta reemplazada por una tokenización nueva';

export type TokenRevocationOutcome = 'SKIPPED' | 'REVOKED' | 'FAILED';

/**
 * Invalida en PlacetoPay el token que una tokenización nueva acaba de reemplazar.
 *
 * Guardar el token nuevo en `payments` no revoca el anterior: los dos quedarían
 * vivos en la pasarela, de modo que un cobro pendiente podría ejecutarse sobre
 * una tarjeta que el cliente ya reemplazó. Se llama con el token capturado
 * **antes** de escribir el nuevo; si son el mismo (el webhook y el retorno de la
 * misma sesión, o un reintento), no hay nada que revocar y no se llama a la
 * pasarela.
 *
 * Nunca lanza: un fallo de la pasarela no puede tumbar el retorno del checkout
 * ni el webhook. Queda como `SyncLog` `FAILED` para que se vea en la auditoría.
 */
export async function revokeReplacedToken(input: {
  paymentId: string;
  reservationCode: string;
  previousToken?: string | null;
  newToken?: string | null;
  source: 'RETORNO' | 'WEBHOOK';
}): Promise<TokenRevocationOutcome> {
  const previousToken = (input.previousToken || '').trim();
  const newToken = (input.newToken || '').trim();

  if (!previousToken || !newToken || previousToken === newToken) return 'SKIPPED';

  let result: { ok: boolean; message: string };
  try {
    result = await invalidateToken(previousToken, REPLACEMENT_REASON);
  } catch (err) {
    result = {
      ok: false,
      message: (err as Error).message || 'Error de comunicación con pasarela',
    };
  }

  try {
    await db.syncLog.create({
      data: {
        entity: 'PAYMENT',
        entityId: input.paymentId,
        action: 'UPDATE',
        status: result.ok ? 'PENDING' : 'FAILED',
        message: `[Token] ${
          result.ok ? 'Token anterior invalidado' : 'No fue posible invalidar el token anterior'
        } para reserva ${input.reservationCode}: ${result.message}`,
        payload: {
          reservationCode: input.reservationCode,
          purpose: 'RETOKENIZACION',
          event: result.ok ? 'PREVIOUS_TOKEN_REVOKED' : 'PREVIOUS_TOKEN_REVOKE_FAILED',
          source: input.source,
          previousTokenPrefix: previousToken.slice(0, 8),
          newTokenPrefix: newToken.slice(0, 8),
          invalidated: result.ok,
          gatewayMessage: result.message,
        },
      },
    });
  } catch (err) {
    console.error('[Token] No se pudo registrar la revocación del token anterior:', err);
  }

  return result.ok ? 'REVOKED' : 'FAILED';
}
