import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const { id } = params;
    const reservation = await db.reservation.findFirst({
      where: {
        OR: [{ id }, { code: id.toUpperCase() }],
      },
      include: {
        vehicle: true,
        payment: true,
        insuranceBlock: true,
      },
    });

    if (!reservation) {
      return json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    return json({ ok: true, reservation });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const { id } = params;
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
        message: `Reserva ${reservation.code} cancelada`,
      },
    });

    return json({ ok: true, message: 'Reserva cancelada' });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
};
