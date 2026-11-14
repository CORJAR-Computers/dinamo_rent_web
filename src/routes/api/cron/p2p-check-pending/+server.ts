import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.js';
import { queryPaymentSession } from '#lib/server/placetopay.js';

/**
 * Tarea Programada / Sonda de Contingencia (Cronjob)
 * Guía de Certificación Evertec WC (Sección 3.4):
 * "Se encarga de consumir el método QuerySession sobre las transacciones
 *  que quedaron en estado PENDIENTE en la base de datos."
 * Frecuencia: Cada 15 minutos en fase de certificación / Cada 24 horas en producción.
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    // Buscar pagos con estado PENDIENTE que tengan un p2pRequestId registrado
    const pendingPayments = await db.payment.findMany({
      where: {
        status: 'PENDIENTE',
        p2pRequestId: { not: null },
      },
      include: { reservation: true },
      take: 20,
    });

    const results = [];

    for (const payment of pendingPayments) {
      if (!payment.p2pRequestId) continue;

      try {
        const query = await queryPaymentSession(payment.p2pRequestId);

        if (query.status !== 'PENDING') {
          const newStatus = query.status === 'APPROVED' ? 'APROBADO' : 'RECHAZADO';

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
                token: query.token || payment.token,
                tokenStatus: query.tokenStatus || (query.token ? 'ACTIVO' : payment.tokenStatus),
                tokenValidUntil: query.tokenValidUntil || payment.tokenValidUntil,
                tokenFranchise: query.tokenFranchise || query.cardBrand || payment.tokenFranchise,
              },
            });

            if (newStatus === 'APROBADO') {
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
                  message: `[Sonda/Cronjob Evertec] Pago resuelto como ${newStatus} para ${payment.reservation.code}`,
                },
              });
            }
          });

          results.push({
            code: payment.reservation.code,
            requestId: payment.p2pRequestId,
            previousStatus: 'PENDIENTE',
            newStatus,
          });
        } else {
          results.push({
            code: payment.reservation.code,
            requestId: payment.p2pRequestId,
            status: 'Aún en PENDIENTE en pasarela',
          });
        }
      } catch (e) {
        results.push({
          code: payment.reservation.code,
          requestId: payment.p2pRequestId,
          error: (e as Error).message,
        });
      }
    }

    return Response.json({
      ok: true,
      timestamp: new Date().toISOString(),
      processedCount: pendingPayments.length,
      results,
    });
  } catch (err) {
    console.error('[Cronjob P2P Error]:', err);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
};
