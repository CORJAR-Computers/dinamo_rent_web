import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isUserAdmin } from '#lib/server/adminAuth.js';
import { completeResubscribeReturn } from '#lib/server/resubscribeReturn.js';

/**
 * Retorno de la tokenización sin cobro con la reserva en la ruta.
 *
 * El checkout SPA puede devolver el `returnUrl` sin query, así que el
 * `reservationId` no puede depender de un parámetro que se pierde. El
 * `requestId` sigue siendo opcional: si no llega, el helper usa el último
 * registrado al crear la sesión.
 */
export const GET: RequestHandler = async ({ params, url, cookies }) => {
  if (!isUserAdmin(cookies)) {
    redirect(303, '/admin/login');
  }

  const target = await completeResubscribeReturn({
    reservationId: params.reservationId,
    requestId: url.searchParams.get('requestId'),
  });

  redirect(303, target);
};
