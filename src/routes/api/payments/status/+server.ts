import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { queryPaymentSession } from '$lib/server/placetopay';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const reservationId = url.searchParams.get('reservationId');
    if (!reservationId) {
      return json({ ok: false, error: 'reservationId es requerido' }, { status: 400 });
    }

    const reservation = await db.reservation.findUnique({
      where: { id: reservationId },
      include: { payment: true },
    });

    if (!reservation || !reservation.payment) {
      return json({ ok: false, error: 'Reserva o pago no encontrado' }, { status: 404 });
    }

    const { payment } = reservation;
    if (!payment.p2pRequestId) {
      return json({
        ok: true,
        live: false,
        status: payment.status,
        sessionStatus: payment.p2pSessionStatus,
      });
    }

    // Consulta en vivo a Place to Pay
    const query = await queryPaymentSession(payment.p2pRequestId);

    let newStatus: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE' = 'PENDIENTE';
    if (query.status === 'APPROVED') newStatus = 'APROBADO';
    else if (query.status === 'REJECTED') newStatus = 'RECHAZADO';

    // Actualiza en base de datos PostgreSQL
    await db.$transaction(async (txn) => {
      await txn.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          p2pSessionStatus: query.status,
          p2pStatusMessage: query.message,
          cardBrand: query.cardBrand || payment.cardBrand,
          cardLast4: query.cardLast4 || payment.cardLast4,
          transactionId: query.authorization || payment.transactionId,
        },
      });

      if (newStatus === 'APROBADO') {
        await txn.reservation.update({
          where: { id: reservation.id },
          data: { status: 'PAGADA' },
        });

        await txn.syncLog.create({
          data: {
            entity: 'PAYMENT',
            entityId: payment.id,
            action: 'UPDATE',
            status: 'PENDING',
            message: `Pago aprobado en Place to Pay para reserva ${reservation.code}`,
            payload: {
              requestId: query.requestId,
              status: query.status,
              authorization: query.authorization,
            },
          },
        });
      }
    });

    return json({
      ok: true,
      live: true,
      status: newStatus,
      sessionStatus: query.status,
      message: query.message,
    });
  } catch (err) {
    console.error('[payment/status error]:', err);
    return json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
};
