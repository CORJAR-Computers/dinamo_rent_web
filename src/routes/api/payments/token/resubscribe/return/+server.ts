import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.js';
import { isUserAdmin } from '#lib/server/adminAuth.js';
import { queryPaymentSession } from '#lib/server/placetopay.js';

/**
 * Retorno del navegador después de la sesión de tokenización sin cobro.
 *
 * PlacetoPay agrega `requestId` al `returnUrl`. Con ese identificador se
 * consulta la sesión y, si el token está disponible, se guarda en el registro
 * de pago de la reserva. Nunca modifica el estado del pago ni de la reserva.
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
  if (!isUserAdmin(cookies)) {
    redirect(303, '/admin/login');
  }

  const reservationId = url.searchParams.get('reservationId') || '';
  const requestId = url.searchParams.get('requestId') || '';

  if (!reservationId || !requestId) {
    redirect(
      303,
      `/admin/reservas?token=error&detalle=${encodeURIComponent(
        'La pasarela no devolvió la referencia de la tokenización.'
      )}`
    );
  }

  let query = await queryPaymentSession(requestId);
  // La consulta inmediata puede llegar antes de que la pasarela consolide el
  // instrumento: se reintenta en la misma petición antes de rendirse.
  for (let attempt = 0; attempt < 2 && query.ok && !query.token; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    query = await queryPaymentSession(requestId);
  }

  if (!query.ok || !query.token) {
    const detail = query.ok
      ? 'La pasarela aún no confirma la tokenización. Recarga en unos segundos.'
      : query.message;
    redirect(303, `/admin/reservas?token=error&detalle=${encodeURIComponent(detail)}`);
  }

  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: { payment: true },
  });

  if (!reservation) {
    redirect(
      303,
      `/admin/reservas?token=error&detalle=${encodeURIComponent(
        'La reserva de la tokenización ya no existe.'
      )}`
    );
  }

  const token = query.token;
  const tokenFranchise = query.tokenFranchise || query.cardBrand || null;

  await db.payment.upsert({
    where: { reservationId: reservation.id },
    create: {
      reservationId: reservation.id,
      amount: reservation.totalAmount,
      status: 'PENDIENTE',
      gateway: 'PLACETOPAY',
      p2pStatusMessage:
        'Tarjeta de garantía registrada sin cobro inicial (tokenización administrativa)',
      cardBrand: query.cardBrand || '',
      cardLast4: query.cardLast4 || '',
      token,
      tokenStatus: 'ACTIVO',
      tokenValidUntil: query.tokenValidUntil || null,
      tokenFranchise,
    },
    update: {
      // Solo se reemplaza el instrumento; el estado del pago original no cambia.
      cardBrand: query.cardBrand || undefined,
      cardLast4: query.cardLast4 || undefined,
      token,
      tokenStatus: 'ACTIVO',
      tokenValidUntil: query.tokenValidUntil || undefined,
      tokenFranchise: tokenFranchise ?? undefined,
      p2pStatusMessage: 'Tarjeta de garantía actualizada mediante tokenización sin cobro',
    },
  });

  await db.syncLog.create({
    data: {
      entity: 'PAYMENT',
      entityId: reservation.payment?.id || reservation.id,
      action: 'UPDATE',
      status: 'PENDING',
      message: `[Token] Tarjeta de garantía actualizada para reserva ${reservation.code}`,
      payload: {
        reservationCode: reservation.code,
        requestId: query.requestId,
        tokenPrefix: token.slice(0, 8),
        tokenFranchise,
        tokenValidUntil: query.tokenValidUntil,
        purpose: 'RETOKENIZACION',
      },
    },
  });

  redirect(
    303,
    `/admin/reservas?token=actualizado&reserva=${encodeURIComponent(reservation.code)}`
  );
};
