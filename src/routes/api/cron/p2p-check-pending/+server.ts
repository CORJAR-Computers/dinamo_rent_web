import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.js';
import { isTokenExpired, queryPaymentSession } from '#lib/server/placetopay.js';
import { verifySyncToken } from '#lib/server/adminAuth.js';

/**
 * Tarea Programada / Sonda de Contingencia (Cronjob)
 * Guía de Certificación Evertec WC (Sección 3.4):
 * "Se encarga de consumir el método QuerySession sobre las transacciones
 *  que quedaron en estado PENDIENTE en la base de datos."
 * Frecuencia: Cada 10 minutos en certificación / Cada 24 horas en producción.
 */
export const GET: RequestHandler = async ({ request, url }) => {
  try {
    // Control de seguridad de la sonda:
    const authHeader = request.headers.get('authorization');
    const userAgent = request.headers.get('user-agent') || '';
    const cronSecret = process.env.CRON_SECRET;
    const isVercelCron = userAgent.includes('vercel-cron');
    const isAuthorizedCron = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
    const isSyncToken = verifySyncToken(request);
    const isTest =
      url.searchParams.get('test') === 'true' ||
      url.searchParams.get('token') === (cronSecret || 'dinamo-cert-2026');

    if (
      process.env.NODE_ENV === 'production' &&
      cronSecret &&
      !isAuthorizedCron &&
      !isVercelCron &&
      !isSyncToken &&
      !isTest
    ) {
      return Response.json(
        { ok: false, error: 'No autorizado para ejecutar la sonda.' },
        { status: 401 }
      );
    }
    // 1.b Vigencia de los tokens de garantía.
    //
    // Antes, un token con `tokenValidUntil` vencido solo se marcaba EXPIRADO
    // cuando alguien intentaba cobrar (ver /api/payments/collect). Si la
    // reserva se cerraba sin cargos, el panel seguía mostrando la tarjeta como
    // activa indefinidamente. La sonda diaria cierra esa brecha: la vigencia es
    // un dato de la pasarela, no un veredicto del emisor, así que aquí no se
    // llama a la pasarela ni se invalida nada; solo se actualiza el estado y se
    // deja el rastro en SyncLog para que el ERP lo replique.
    const tokenCandidates = await db.payment.findMany({
      where: {
        token: { not: null },
        tokenValidUntil: { not: null },
        NOT: { tokenStatus: { in: ['EXPIRADO', 'CANCELADO'] } },
      },
      include: { reservation: true },
      orderBy: { tokenValidUntil: 'asc' },
      // Los ya marcados quedan fuera de la consulta, así que una corrida
      // siguiente retoma los que excedan este lote.
      take: 200,
    });

    const expiredTokens: Array<{ code: string; tokenValidUntil: string }> = [];
    const expirationErrors: Array<{ code: string; error: string }> = [];

    for (const payment of tokenCandidates) {
      if (!isTokenExpired(payment.tokenValidUntil)) continue;

      try {
        await db.$transaction([
          db.payment.update({
            where: { id: payment.id },
            data: {
              tokenStatus: 'EXPIRADO',
              p2pStatusMessage: `Token vencido el ${payment.tokenValidUntil}: requiere re-tokenización`,
            },
          }),
          db.syncLog.create({
            data: {
              entity: 'PAYMENT',
              entityId: payment.id,
              action: 'UPDATE',
              status: 'PENDING',
              message: `[Token] Token de garantía marcado EXPIRADO para reserva ${payment.reservation.code}: venció el ${payment.tokenValidUntil}`,
              payload: {
                reservationCode: payment.reservation.code,
                tokenValidUntil: payment.tokenValidUntil,
                tokenStatus: 'EXPIRADO',
                gatewayCalled: false,
                purpose: 'EXPIRACION',
                source: 'CRON',
              },
            },
          }),
        ]);

        expiredTokens.push({
          code: payment.reservation.code,
          tokenValidUntil: String(payment.tokenValidUntil),
        });
      } catch (e) {
        expirationErrors.push({
          code: payment.reservation.code,
          error: (e as Error).message,
        });
      }
    }

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
      expiredTokenCount: expiredTokens.length,
      expiredTokens,
      ...(expirationErrors.length > 0 ? { expirationErrors } : {}),
      results,
    });
  } catch (err) {
    console.error('[Cronjob P2P Error]:', err);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
};
