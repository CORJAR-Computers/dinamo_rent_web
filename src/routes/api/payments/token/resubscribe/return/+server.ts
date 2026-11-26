import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isUserAdmin } from '#lib/server/adminAuth.js';
import { completeResubscribeReturn } from '#lib/server/resubscribeReturn.js';

/**
 * Retorno de la tokenización sin cobro (formato anterior, con `reservationId`
 * en la query). Se conserva para las sesiones creadas antes del cambio a la
 * ruta `/return/[reservationId]`; la lógica vive en el helper compartido.
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
  if (!isUserAdmin(cookies)) {
    redirect(303, '/admin/login');
  }

  const target = await completeResubscribeReturn({
    reservationId: url.searchParams.get('reservationId') || '',
    requestId: url.searchParams.get('requestId'),
  });

  redirect(303, target);
};
