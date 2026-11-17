import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.js';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const vehicleId = url.searchParams.get('vehicleId');
    const pickupDate = url.searchParams.get('pickupDate');
    const returnDate = url.searchParams.get('returnDate');

    if (!vehicleId || !pickupDate || !returnDate) {
      return Response.json(
        { ok: false, error: 'vehicleId, pickupDate y returnDate son requeridos' },
        { status: 400 }
      );
    }

    const start = new Date(pickupDate);
    const end = new Date(returnDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return Response.json(
        { ok: false, error: 'Rango de fechas inválido' },
        { status: 400 }
      );
    }

    let vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      vehicle = await db.vehicle.findFirst({ where: { id: vehicleId } });
      if (!vehicle) {
        return Response.json({ ok: false, error: 'Vehículo no encontrado' }, { status: 404 });
      }
    }

    if (!vehicle.available) {
      return Response.json({
        ok: true,
        available: false,
        reason: 'El vehículo está inhabilitado temporalmente en la flota.',
      });
    }

    const unitsAvailable = vehicle.units || 1;

    // Conteo de reservas activas que solapen con este rango de fechas
    const activeReservationsCount = await db.reservation.count({
      where: {
        vehicleId: vehicle.id,
        status: { in: ['CONFIRMADA', 'PAGADA', 'EN_CURSO'] },
        pickupDate: { lte: end },
        returnDate: { gte: start },
      },
    });

    const isAvailable = activeReservationsCount < unitsAvailable;

    return Response.json({
      ok: true,
      available: isAvailable,
      activeReservationsCount,
      unitsTotal: unitsAvailable,
      reason: isAvailable
        ? 'Vehículo disponible para las fechas solicitadas'
        : 'El vehículo no está disponible para las fechas seleccionadas debido a reservas previas.',
    });
  } catch (err) {
    console.error('[check-availability error]:', err);
    return Response.json({ ok: false, error: 'Error interno al consultar disponibilidad' }, { status: 500 });
  }
};
