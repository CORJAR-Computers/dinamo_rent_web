import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.js';
import { isUserAdmin } from '#lib/server/adminAuth.js';

export const GET: RequestHandler = async ({ params, cookies }) => {
  try {
    const { id } = params;
    if (!id) {
      return Response.json({ ok: false, error: 'Identificador no proporcionado' }, { status: 400 });
    }

    const isAdmin = isUserAdmin(cookies);

    const reservation = await db.reservation.findFirst({
      where: {
        OR: [{ id }, { code: id.toUpperCase() }],
      },
      include: {
        vehicle: true,
        payment: {
          select: {
            id: true,
            status: true,
            amount: true,
            cardBrand: true,
            cardLast4: true,
            transactionId: true,
            tokenStatus: true,
            // Ocultar token y detalles sensibles si no es admin
            token: isAdmin,
            p2pRequestId: isAdmin,
          },
        },
        insuranceBlock: true,
      },
    });

    if (!reservation) {
      return Response.json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    return Response.json({ ok: true, reservation });
  } catch (e) {
    console.error('[reservations/:id error]:', e);
    return Response.json({ ok: false, error: "Error interno del servidor. Intenta de nuevo." }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params, cookies }) => {
  // Se requiere sesión administrativa para cancelar reservas
  if (!isUserAdmin(cookies)) {
    return Response.json({ ok: false, error: 'No autorizado. Se requieren permisos de administrador.' }, { status: 401 });
  }

  try {
    const { id } = params;
    if (!id) {
      return Response.json({ ok: false, error: 'Identificador de reserva requerido' }, { status: 400 });
    }

    const reservation = await db.reservation.update({
      where: { id },
      data: { status: 'CANCELADA' },
    });

    await db.syncLog.create({
      data: {
        entity: 'RESERVATION',
        entityId: reservation.id,
        action: 'UPDATE',
        status: 'PENDING',
        message: `Reserva ${reservation.code} cancelada por administrador`,
      },
    });

    return Response.json({ ok: true, message: 'Reserva cancelada exitosamente' });
  } catch (e) {
    console.error('[reservations/:id error]:', e);
    return Response.json({ ok: false, error: "Error interno del servidor. Intenta de nuevo." }, { status: 500 });
  }
};
