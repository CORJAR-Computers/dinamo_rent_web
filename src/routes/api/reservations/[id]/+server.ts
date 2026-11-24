import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.js';
import { isUserAdmin } from '#lib/server/adminAuth.js';
import { checkRateLimit } from '#lib/server/rateLimit.js';
import {
  PUBLIC_RESERVATION_SELECT,
  PUBLIC_LOOKUP_RATE_LIMIT,
} from '#lib/server/reservationView.js';

export const GET: RequestHandler = async ({ params, cookies, getClientAddress }) => {
  try {
    const { id } = params;
    if (!id) {
      return Response.json({ ok: false, error: 'Identificador no proporcionado' }, { status: 400 });
    }

    const isAdmin = isUserAdmin(cookies);
    const where = { OR: [{ id }, { code: id.toUpperCase() }] };

    // Sin sesión esta ruta es una segunda puerta al mismo código
    // `DIN-AAAA-NNNN`: se aplica el mismo límite que en /api/reservations para
    // que no sirva para saltarse el freno de enumeración por IP.
    if (!isAdmin) {
      let clientIp = '127.0.0.1';
      try {
        clientIp = getClientAddress();
      } catch {
        clientIp = '127.0.0.1';
      }
      const rateLimit = await checkRateLimit(clientIp, PUBLIC_LOOKUP_RATE_LIMIT);
      if (!rateLimit.allowed) {
        return Response.json(
          {
            ok: false,
            error: `Demasiadas consultas de reservas. Espera ${rateLimit.retryAfterSeconds} segundos.`,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
          }
        );
      }
    }

    // Sin sesión solo se devuelve la vista pública: nunca el token de la
    // tarjeta, los ids de la pasarela ni los datos de contacto o documento.
    const reservation = isAdmin
      ? await db.reservation.findFirst({
          where,
          include: { vehicle: true, payment: true, insuranceBlock: true },
        })
      : await db.reservation.findFirst({
          where,
          select: PUBLIC_RESERVATION_SELECT,
        });

    if (!reservation) {
      return Response.json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    return Response.json(
      { ok: true, reservation },
      { headers: { 'Cache-Control': 'no-store' } }
    );
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
