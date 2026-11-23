import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { db } from '#lib/server/db.js';
import { queryPaymentSession } from '#lib/server/placetopay.js';

/**
 * Webhook de Notificación para Evertec PlacetoPay.
 *
 * Reglas de seguridad (Guía WC §4):
 * - La petición debe traer firma válida calculada con `P2P_TRAN_KEY`; sin firma
 *   válida se rechaza con 401 y no se toca la base de datos.
 * - El estado NUNCA se toma del cuerpo de la notificación: solo vale lo que
 *   responde `QuerySession`. Un cuerpo con "APPROVED" sobre una sesión PENDING
 *   no marca la reserva como pagada.
 * - Si no se puede confirmar con la pasarela se responde 502 para que Evertec
 *   reintente más tarde; la sonda de contingencia también lo recupera.
 */

/**
 * Firma oficial de la notificación: SHA1(requestId + status + date + tranKey).
 * Se compara en tiempo constante para no filtrar información por tiempos.
 */
function isValidSignature(params: {
  requestId: string;
  status?: string;
  date?: string;
  signature?: string;
  secretKey: string;
}): boolean {
  const { requestId, status, date, signature, secretKey } = params;
  if (!signature || !status || !date) return false;

  const expected = crypto
    .createHash('sha1')
    .update(`${requestId}${status}${date}${secretKey}`)
    .digest('hex');
  const provided = signature.trim().toLowerCase();

  if (provided.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const secretKey = process.env.P2P_TRAN_KEY;
    if (!secretKey) {
      console.error(
        '[Evertec Webhook] P2P_TRAN_KEY no configurada: no se puede validar la firma. Notificación rechazada.'
      );
      return Response.json(
        { ok: false, error: 'Configuración de firma no disponible' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const { requestId, status, signature } = (body || {}) as {
      requestId?: string | number;
      status?: { status?: string; date?: string };
      signature?: string;
    };

    if (!requestId) {
      return Response.json({ ok: false, error: 'requestId faltante' }, { status: 400 });
    }

    if (
      !isValidSignature({
        requestId: String(requestId),
        status: status?.status,
        date: status?.date,
        signature,
        secretKey,
      })
    ) {
      console.warn('[Evertec Webhook] Notificación sin firma válida. Rechazada.');
      return Response.json({ ok: false, error: 'Firma inválida' }, { status: 401 });
    }

    // Única fuente de verdad del estado: la consulta a la pasarela.
    const query = await queryPaymentSession(String(requestId));
    if (!query.ok) {
      console.error(
        `[Evertec Webhook] No se pudo confirmar la sesión ${requestId} con la pasarela: ${query.message}`
      );
      return Response.json(
        { ok: false, error: 'No se pudo confirmar el estado con la pasarela' },
        { status: 502 }
      );
    }

    const finalPaymentStatus: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE' =
      query.status === 'APPROVED'
        ? 'APROBADO'
        : query.status === 'REJECTED'
          ? 'RECHAZADO'
          : 'PENDIENTE';

    // Buscamos el pago por p2pRequestId o por la referencia notificada.
    const payment = await db.payment.findFirst({
      where: {
        OR: [
          { p2pRequestId: String(requestId) },
          { reservation: { code: query.reference || '' } },
        ],
      },
      include: { reservation: true },
    });

    if (!payment) {
      console.warn(`[Evertec Webhook] No se encontró el pago para requestId ${requestId}`);
      // 200 para evitar reintentos continuos si la referencia no existe en este ambiente.
      return Response.json({ ok: true, message: 'Notificación procesada sin registro local' });
    }

    if (finalPaymentStatus === 'PENDIENTE') {
      // La pasarela aún no resolvió: no se escribe nada. La sonda reintentará.
      return Response.json({ ok: true, status: finalPaymentStatus, requestId });
    }

    await db.$transaction(async (txn) => {
      await txn.payment.update({
        where: { id: payment.id },
        data: {
          status: finalPaymentStatus,
          p2pSessionStatus: query.status,
          p2pStatusMessage: query.message,
          cardBrand: query.cardBrand || payment.cardBrand,
          cardLast4: query.cardLast4 || payment.cardLast4,
          transactionId: query.authorization || payment.transactionId,
          // Tokenización de garantía (suscripción)
          token: query.token || payment.token,
          tokenStatus: query.tokenStatus || (query.token ? 'ACTIVO' : payment.tokenStatus),
          tokenValidUntil: query.tokenValidUntil || payment.tokenValidUntil,
          tokenFranchise: query.tokenFranchise || query.cardBrand || payment.tokenFranchise,
        },
      });

      if (finalPaymentStatus === 'APROBADO') {
        await txn.reservation.update({
          where: { id: payment.reservationId },
          data: { status: 'PAGADA' },
        });

        await txn.syncLog.create({
          data: {
            entity: 'PAYMENT',
            entityId: payment.id,
            action: 'UPDATE',
            status: 'PENDING',
            message: `[Webhook Evertec] Pago APROBADO para reserva ${payment.reservation.code}`,
            payload: {
              requestId: query.requestId,
              status: query.status,
              authorization: query.authorization,
              hasToken: !!(query.token || payment.token),
              cardBrand: query.cardBrand,
              cardLast4: query.cardLast4,
            },
          },
        });
      }
    });

    console.log(
      `[Evertec Webhook] Reserva ${payment.reservation.code} actualizada a ${finalPaymentStatus}`
    );
    return Response.json({ ok: true, status: finalPaymentStatus, requestId });
  } catch (err) {
    console.error('[Evertec Webhook Error]:', err);
    return Response.json(
      { ok: false, error: 'Error procesando la notificación' },
      { status: 500 }
    );
  }
};
