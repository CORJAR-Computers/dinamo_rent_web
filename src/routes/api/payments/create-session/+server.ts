import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.js';
import { createPaymentSession, queryPaymentSession } from '#lib/server/placetopay.js';
import { checkRateLimit } from '#lib/server/rateLimit.js';
import { CONTACT_PHONES, WHATSAPP_NUMBER } from '#lib/data/contact.js';

/**
 * Ventana durante la cual una transacción PENDIENTE bloquea un nuevo intento de pago.
 * Coincide con la expiración de la sesión en la pasarela (25 min) más un margen de red.
 */
const PENDING_WINDOW_MS = 26 * 60 * 1000;

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
  try {
    // Protección anti-abuso / anti-card testing: máximo 8 intentos de creación de sesión cada 10 min por IP
    let clientIp = '127.0.0.1';
    try {
      clientIp = getClientAddress();
    } catch {
      clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    }

    const rateLimit = checkRateLimit(clientIp, {
      endpointKey: 'create-payment-session',
      windowMs: 10 * 60 * 1000,
      maxRequests: 8,
    });

    if (!rateLimit.allowed) {
      return Response.json(
        {
          ok: false,
          error: `Has alcanzado el límite de intentos de pago permitidos temporalmente. Por favor espera ${rateLimit.retryAfterSeconds} segundos antes de continuar.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }
    const body = await request.json();
    const { reservationId } = body || {};

    if (!reservationId) {
      return Response.json({ ok: false, error: 'reservationId es obligatorio' }, { status: 400 });
    }

    const reservation = await db.reservation.findUnique({
      where: { id: reservationId },
      include: { vehicle: true, payment: true },
    });

    if (!reservation) {
      return Response.json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    if (reservation.status === 'PAGADA') {
      return Response.json({ ok: false, error: 'La reserva ya fue pagada con anterioridad' }, { status: 400 });
    }

    // Control de doble pago (Guía de Suscripción §6.3.3): si ya existe una operación
    // en estado PENDIENTE, se bloquea un nuevo intento y se informa la referencia,
    // la fecha y los datos de contacto del establecimiento.
    const pendingPayment = reservation.payment;
    if (
      pendingPayment &&
      pendingPayment.status === 'PENDIENTE' &&
      pendingPayment.p2pRequestId &&
      Date.now() - new Date(pendingPayment.updatedAt).getTime() < PENDING_WINDOW_MS
    ) {
      // Antes de bloquear, se confirma el estado real con QuerySession: si la pasarela
      // ya lo resolvió, se actualiza localmente y no se le impide pagar al cliente.
      const live = await queryPaymentSession(pendingPayment.p2pRequestId);

      if (live.status === 'APPROVED') {
        await db.$transaction(async (txn) => {
          await txn.payment.update({
            where: { id: pendingPayment.id },
            data: {
              status: 'APROBADO',
              p2pSessionStatus: 'APPROVED',
              p2pStatusMessage: live.message,
              transactionId: live.authorization || pendingPayment.transactionId,
            },
          });
          await txn.reservation.update({
            where: { id: reservation.id },
            data: { status: 'PAGADA' },
          });
        });

        return Response.json(
          {
            ok: false,
            code: 'ALREADY_PAID',
            error: 'La transacción asociada a esta reserva ya fue aprobada por la pasarela. No se genera un nuevo cobro.',
          },
          { status: 400 }
        );
      }

      if (live.status === 'REJECTED') {
        await db.payment.update({
          where: { id: pendingPayment.id },
          data: {
            status: 'RECHAZADO',
            p2pSessionStatus: 'REJECTED',
            p2pStatusMessage: live.message,
          },
        });
      } else {
        return Response.json(
          {
            ok: false,
            code: 'PENDING_TRANSACTION',
            error: `Ya tienes una transacción PENDIENTE para la reserva ${reservation.code}. No se generó un nuevo cobro para evitar un doble pago.`,
            pending: {
              reference: reservation.code,
              requestId: pendingPayment.p2pRequestId,
              amount: pendingPayment.amount,
              date: pendingPayment.updatedAt,
            },
            contact: {
              phones: CONTACT_PHONES,
              whatsapp: `https://wa.me/${WHATSAPP_NUMBER}`,
            },
          },
          { status: 409 }
        );
      }
    }

    // Configurar URL de retorno (incluyendo la referencia para que /pago/retorno pueda buscarla de inmediato)
    const origin = url.origin || 'http://localhost:5174';
    const returnUrl = `${origin}/pago/retorno?reference=${encodeURIComponent(reservation.code)}`;

    // Solicitar sesión a Place to Pay
    // Guía de Suscripción §10.2: se envía la IP y el agente de navegación reales del comprador.
    const userAgent =
      request.headers.get('user-agent') || 'Mozilla/5.0 DinamoRent/1.0 WebCheckout';

    // Base gravable sin IVA: vehículo + seguro + adicionales. `totalAmount` ya incluye el IVA,
    // así que la pasarela recibe base + impuesto = total.
    const taxBaseCOP =
      reservation.baseAmount + reservation.insuranceAmount + reservation.extrasAmount;

    const session = await createPaymentSession({
      reference: reservation.code,
      description: `Alquiler Dinamo Rent — ${reservation.vehicle.name} (${reservation.days} días)`,
      amountCOP: reservation.totalAmount,
      taxBaseCOP,
      customer: {
        names: reservation.customerName,
        lastnames: reservation.customerLastname,
        email: reservation.customerEmail,
        phone: reservation.customerPhone,
        docType: reservation.customerIdType,
        docNumber: reservation.customerIdNumber,
      },
      returnUrl,
      ipAddress: clientIp,
      userAgent,
    });

    if (!session.ok || !session.processUrl) {
      return Response.json({ ok: false, error: session.error || 'No se pudo iniciar la sesión con Place to Pay' }, { status: 502 });
    }

    // Upsert registro Payment en base de datos
    await db.payment.upsert({
      where: { reservationId: reservation.id },
      create: {
        reservationId: reservation.id,
        amount: reservation.totalAmount,
        status: 'PENDIENTE',
        gateway: 'PLACETOPAY',
        p2pRequestId: session.requestId || null,
        p2pProcessUrl: session.processUrl,
        p2pSessionStatus: 'PENDING',
        p2pStatusMessage: session.statusMessage || 'Sesión creada en pasarela',
      },
      update: {
        amount: reservation.totalAmount,
        status: 'PENDIENTE',
        p2pRequestId: session.requestId || null,
        p2pProcessUrl: session.processUrl,
        p2pSessionStatus: 'PENDING',
        p2pStatusMessage: session.statusMessage || 'Sesión renovada en pasarela',
      },
    });

    return Response.json({
      ok: true,
      processUrl: session.processUrl,
      requestId: session.requestId,
    });
  } catch (err) {
    console.error('[create-session error]:', err);
    return Response.json({ ok: false, error: "Error interno del servidor. Intenta de nuevo." }, { status: 500 });
  }
};
