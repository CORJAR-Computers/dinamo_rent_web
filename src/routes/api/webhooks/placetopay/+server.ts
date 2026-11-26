import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { db } from '#lib/server/db.js';
import { queryPaymentSession } from '#lib/server/placetopay.js';
import { revokeReplacedToken } from '#lib/server/tokenReplacement.js';

/**
 * Webhook de Notificación para Evertec PlacetoPay.
 *
 * Reglas de seguridad (Guía WC §4):
 * - La petición debe traer firma válida calculada con `P2P_TRAN_KEY`; sin firma
 *   válida se rechaza con 401 y no se toca la base de datos. Se aceptan los dos
 *   formatos documentados por Evertec: SHA-1 (40 hex, sin prefijo) y SHA-256
 *   (prefijo `sha256:`, 64 hex), para poder migrar sin ventana de 401.
 * - El estado NUNCA se toma del cuerpo de la notificación: solo vale lo que
 *   responde `QuerySession`. Un cuerpo con "APPROVED" sobre una sesión PENDING
 *   no marca la reserva como pagada.
 * - Si no se puede confirmar con la pasarela se responde 502 para que Evertec
 *   reintente más tarde; la sonda de contingencia también lo recupera.
 */

const PAYMENT_STATUS: Record<'APPROVED' | 'REJECTED' | 'PENDING', 'APROBADO' | 'RECHAZADO' | 'PENDIENTE'> = {
  APPROVED: 'APROBADO',
  REJECTED: 'RECHAZADO',
  PENDING: 'PENDIENTE',
};

/**
 * Firma oficial de la notificación: HASH(requestId + status + date + tranKey).
 * - SHA-1 (heredada): sin prefijo, 40 caracteres hex.
 * - SHA-256 (recomendada): prefijo `sha256:`, 64 caracteres hex.
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

  const raw = signature.trim().toLowerCase();
  const isSha256 = raw.startsWith('sha256:');
  const provided = isSha256 ? raw.slice('sha256:'.length) : raw;

  // Solo hex: Buffer.from(..., 'hex') descarta caracteres inválidos en silencio.
  if (!/^[0-9a-f]+$/.test(provided)) return false;

  const expected = crypto
    .createHash(isSha256 ? 'sha256' : 'sha1')
    .update(`${requestId}${status}${date}${secretKey}`)
    .digest('hex');

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

    const requestIdStr = String(requestId);

    if (
      !isValidSignature({
        requestId: requestIdStr,
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
    const query = await queryPaymentSession(requestIdStr);
    if (!query.ok) {
      console.error(
        `[Evertec Webhook] No se pudo confirmar la sesión ${requestId} con la pasarela: ${query.message}`
      );
      return Response.json(
        { ok: false, error: 'No se pudo confirmar el estado con la pasarela' },
        { status: 502 }
      );
    }

    const finalPaymentStatus = PAYMENT_STATUS[query.status];

    // Buscamos el pago por p2pRequestId o por la referencia notificada.
    const payment = await db.payment.findFirst({
      where: {
        OR: [
          { p2pRequestId: requestIdStr },
          ...(query.reference ? [{ reservation: { code: query.reference } }] : []),
        ],
      },
      include: { reservation: true },
    });

    if (!payment) {
      console.warn(`[Evertec Webhook] No se encontró el pago para requestId ${requestId}`);
      // 200 para evitar reintentos continuos si la referencia no existe en este ambiente.
      return Response.json({ ok: true, message: 'Notificación procesada sin registro local' });
    }

    // Tokenización sin cobro (re-tokenización administrativa): la sesión no
    // tiene pago asociado. Solo se actualiza el instrumento; nunca se marca la
    // reserva como PAGADA ni se altera el estado del cobro original.
    if (query.subscriptionOnly) {
      if (query.status !== 'APPROVED' || !query.token) {
        return Response.json({
          ok: true,
          status: finalPaymentStatus,
          requestId: requestIdStr,
          tokenUpdated: false,
        });
      }

      const previousToken = payment.token;

      await db.payment.update({
        where: { id: payment.id },
        data: {
          token: query.token,
          tokenStatus: 'ACTIVO',
          tokenValidUntil: query.tokenValidUntil || payment.tokenValidUntil,
          tokenFranchise: query.tokenFranchise || query.cardBrand || payment.tokenFranchise,
          cardBrand: query.cardBrand || payment.cardBrand,
          cardLast4: query.cardLast4 || payment.cardLast4,
          p2pStatusMessage: 'Tarjeta de garantía actualizada mediante tokenización sin cobro',
        },
      });

      // El token anterior no puede quedar vivo en la pasarela: el webhook puede
      // llegar antes que el retorno y, si no se revoca aquí, la tarjeta
      // reemplazada seguiría admitiendo cobros.
      await revokeReplacedToken({
        paymentId: payment.id,
        reservationCode: payment.reservation.code,
        previousToken,
        newToken: query.token,
        source: 'WEBHOOK',
      });

      await db.syncLog.create({
        data: {
          entity: 'PAYMENT',
          entityId: payment.id,
          action: 'UPDATE',
          status: 'PENDING',
          message: `[Token] Nueva tokenización administrativa para reserva ${payment.reservation.code}`,
          payload: {
            requestId: query.requestId,
            reservationCode: payment.reservation.code,
            tokenPrefix: query.token.slice(0, 8),
            tokenFranchise: query.tokenFranchise || query.cardBrand,
            tokenValidUntil: query.tokenValidUntil,
            purpose: 'RETOKENIZACION',
          },
        },
      });

      return Response.json({
        ok: true,
        status: finalPaymentStatus,
        requestId: requestIdStr,
        tokenUpdated: true,
      });
    }

    if (finalPaymentStatus === 'PENDIENTE') {
      // La pasarela aún no resolvió: no se escribe nada. La sonda reintentará.
      return Response.json({ ok: true, status: finalPaymentStatus, requestId: requestIdStr });
    }

    // Idempotencia: la firma sigue siendo válida para siempre, así que una
    // notificación repetida no debe reescribir un pago ya aplicado.
    if (payment.status === 'APROBADO') {
      return Response.json({
        ok: true,
        status: 'APROBADO',
        requestId: requestIdStr,
        duplicate: true,
      });
    }

    // Un APPROVED tardío no puede revivir una reserva ya cancelada.
    if (finalPaymentStatus === 'APROBADO' && payment.reservation.status === 'CANCELADA') {
      await db.syncLog.create({
        data: {
          entity: 'PAYMENT',
          entityId: payment.id,
          action: 'UPDATE',
          status: 'PENDING',
          message: `[Webhook Evertec] Pago aprobado ignorado: la reserva ${payment.reservation.code} está cancelada`,
          payload: {
            requestId: query.requestId,
            status: query.status,
            ignored: 'RESERVA_CANCELADA',
          },
        },
      });
      return Response.json({
        ok: true,
        status: finalPaymentStatus,
        requestId: requestIdStr,
        ignored: 'RESERVA_CANCELADA',
      });
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
    return Response.json({ ok: true, status: finalPaymentStatus, requestId: requestIdStr });
  } catch (err) {
    console.error('[Evertec Webhook Error]:', err);
    return Response.json(
      { ok: false, error: 'Error procesando la notificación' },
      { status: 500 }
    );
  }
};
