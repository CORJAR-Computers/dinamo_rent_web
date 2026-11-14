import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { db } from '#lib/server/db.js';
import { queryPaymentSession } from '#lib/server/placetopay.js';

/**
 * Webhook de Notificación para Evertec PlacetoPay.
 * 
 * Recibe peticiones POST asíncronas de la pasarela cuando una transacción
 * cambia de estado (APPROVED, REJECTED, etc.).
 * Debe responder con HTTP 200 y JSON indicando la recepción correcta.
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    console.log('[Evertec Webhook] Notificación recibida:', JSON.stringify(body));

    const { status, requestId, reference, signature } = body || {};

    if (!requestId) {
      return Response.json({ ok: false, error: 'requestId faltante' }, { status: 400 });
    }

    const secretKey = process.env.P2P_TRAN_KEY || '0km1807xKxUK8Ebw';

    // Validación opcional de firma si PlacetoPay la envía
    // signature = SHA1(requestId + status.status + status.date + secretKey)
    if (signature && status?.status && status?.date) {
      const calculatedSig = crypto
        .createHash('sha1')
        .update(`${requestId}${status.status}${status.date}${secretKey}`)
        .digest('hex');

      if (signature.toLowerCase() !== calculatedSig.toLowerCase()) {
        console.warn('[Evertec Webhook] Advertencia de firma no coincidente:', { signature, calculatedSig });
      }
    }

    // Consultamos la sesión en PlacetoPay para garantizar integridad y datos de token/instrumentos
    const query = await queryPaymentSession(String(requestId));

    let finalPaymentStatus: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE' = 'PENDIENTE';
    if (query.status === 'APPROVED' || status?.status === 'APPROVED') {
      finalPaymentStatus = 'APROBADO';
    } else if (query.status === 'REJECTED' || status?.status === 'REJECTED') {
      finalPaymentStatus = 'RECHAZADO';
    }

    // Buscamos el pago por p2pRequestId o por la referencia
    const payment = await db.payment.findFirst({
      where: {
        OR: [
          { p2pRequestId: String(requestId) },
          { reservation: { code: reference || query.reference || '' } },
        ],
      },
      include: { reservation: true },
    });

    if (!payment) {
      console.warn(`[Evertec Webhook] No se encontró el pago para requestId ${requestId} o ref ${reference}`);
      // Respondemos 200 para evitar reintentos continuos si la referencia no existe en el ambiente
      return Response.json({ ok: true, message: 'Notificación procesada sin registro local' });
    }

    // Actualizamos la base de datos de forma transaccional
    await db.$transaction(async (txn) => {
      await txn.payment.update({
        where: { id: payment.id },
        data: {
          status: finalPaymentStatus,
          p2pSessionStatus: query.status,
          p2pStatusMessage: query.message || status?.message,
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

    console.log(`[Evertec Webhook] Reserva ${payment.reservation.code} actualizada a ${finalPaymentStatus}`);
    return Response.json({ ok: true, status: finalPaymentStatus, requestId });
  } catch (err) {
    console.error('[Evertec Webhook Error]:', err);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
};
