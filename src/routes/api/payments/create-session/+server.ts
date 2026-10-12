import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.js';
import { createPaymentSession } from '#lib/server/placetopay.js';

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    const body = await request.json();
    const { reservationId } = body || {};

    if (!reservationId) {
      return Response.json({ ok: false, error: 'reservationId es obligatorio' }, { status: 400 });
    }

    const reservation = await db.reservation.findUnique({
      where: { id: reservationId },
      include: { vehicle: true },
    });

    if (!reservation) {
      return Response.json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    if (reservation.status === 'PAGADA') {
      return Response.json({ ok: false, error: 'La reserva ya fue pagada con anterioridad' }, { status: 400 });
    }

    // Configurar URL de retorno
    const origin = url.origin || 'http://localhost:5174';
    const returnUrl = `${origin}/pago/retorno`;

    // Solicitar sesión a Place to Pay
    const session = await createPaymentSession({
      reference: reservation.code,
      description: `Alquiler Dinamo Rent — ${reservation.vehicle.name} (${reservation.days} días)`,
      amountCOP: reservation.totalAmount,
      customer: {
        names: reservation.customerName,
        lastnames: reservation.customerLastname,
        email: reservation.customerEmail,
        phone: reservation.customerPhone,
        docType: reservation.customerIdType,
        docNumber: reservation.customerIdNumber,
      },
      returnUrl,
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
