import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.js';
import { isUserAdmin } from '#lib/server/adminAuth.js';
import { createSubscriptionSession } from '#lib/server/placetopay.js';

/**
 * Registra o reemplaza la tarjeta de garantía de una reserva mediante una
 * sesión de suscripción pura de PlacetoPay (bloque raíz `subscription`, sin
 * objeto `payment`). No ejecuta ningún cobro: el token queda disponible para
 * los Collect posteriores.
 *
 * Requiere sesión de administrador. La pasarela devuelve al retorno
 * `/api/payments/token/resubscribe/return/[reservationId]`, que guarda el token
 * en la reserva. La reserva va en la ruta porque el checkout SPA puede
 * devolver el `returnUrl` sin query.
 */
export const POST: RequestHandler = async ({ request, url, cookies, getClientAddress }) => {
  if (!isUserAdmin(cookies)) {
    return Response.json(
      { ok: false, error: 'No autorizado. Se requiere sesión de administrador.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const { reservationId } = (body || {}) as { reservationId?: string };

    if (!reservationId) {
      return Response.json({ ok: false, error: 'reservationId es obligatorio' }, { status: 400 });
    }

    const reservation = await db.reservation.findUnique({
      where: { id: reservationId },
      include: { payment: true },
    });

    if (!reservation) {
      return Response.json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    let clientIp = '127.0.0.1';
    try {
      clientIp = getClientAddress();
    } catch {
      clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    }

    const userAgent =
      request.headers.get('user-agent') || 'DinamoRentAdmin/1.0 Admin-Tokenization';

    const returnUrl = new URL(
      `/api/payments/token/resubscribe/return/${reservation.id}`,
      url.origin
    );

    const session = await createSubscriptionSession({
      reference: reservation.code,
      description: `Tokenizacion tarjeta de garantia - Reserva ${reservation.code}`,
      customer: {
        names: reservation.customerName,
        lastnames: reservation.customerLastname,
        email: reservation.customerEmail,
        phone: reservation.customerPhone,
        docType: reservation.customerIdType,
        docNumber: reservation.customerIdNumber,
      },
      returnUrl: returnUrl.toString(),
      ipAddress: clientIp,
      userAgent,
    });

    if (!session.ok || !session.processUrl) {
      return Response.json(
        {
          ok: false,
          error: session.error || 'No se pudo iniciar la tokenización con Place to Pay',
        },
        { status: 502 }
      );
    }

    await db.syncLog.create({
      data: {
        entity: 'PAYMENT',
        entityId: reservation.payment?.id || reservation.id,
        action: 'UPDATE',
        status: 'PENDING',
        message: `[Token] Sesión de nueva tokenización iniciada para reserva ${reservation.code}`,
        payload: {
          reservationCode: reservation.code,
          requestId: session.requestId,
          purpose: 'RETOKENIZACION',
          event: 'SESSION_CREATED',
        },
      },
    });

    return Response.json({
      ok: true,
      processUrl: session.processUrl,
      requestId: session.requestId,
    });
  } catch (err) {
    console.error('[payment/token/resubscribe error]:', err);
    return Response.json(
      { ok: false, error: 'Error interno del servidor. Intenta de nuevo.' },
      { status: 500 }
    );
  }
};
