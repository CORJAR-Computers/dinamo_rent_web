import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async ({ url, request }) => {
  try {
    const onlyPending = url.searchParams.get('pending') === 'true';

    // Si la aplicación de escritorio solicita las reservas pendientes
    if (onlyPending) {
      const pendingReservations = await db.reservation.findMany({
        where: {
          synced: false,
          status: { in: ['CONFIRMADA', 'PAGADA', 'PENDIENTE'] },
        },
        include: {
          vehicle: true,
          payment: true,
          customer: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      return json({
        ok: true,
        count: pendingReservations.length,
        reservations: pendingReservations,
      });
    }

    // Dashboard y contadores de sincronización
    const [pending, synced, failed] = await Promise.all([
      db.syncLog.count({ where: { status: 'PENDING' } }),
      db.syncLog.count({ where: { status: 'SYNCED' } }),
      db.syncLog.count({ where: { status: 'FAILED' } }),
    ]);

    const recent = await db.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const [reservationsSynced, reservationsTotal, customersCount] = await Promise.all([
      db.reservation.count({ where: { synced: true } }),
      db.reservation.count(),
      db.customer.count(),
    ]);

    return json({
      ok: true,
      desktopApp: {
        name: 'Dinamo Rent ERP — Mostrador',
        version: '1.4.2',
        status: 'CONECTADO',
        lastHeartbeat: new Date().toISOString(),
        database: 'Firebird SQL Embedded (Mostrador Cartagena)',
      },
      counters: {
        total: pending + synced + failed,
        pending,
        synced,
        failed,
        reservationsSynced,
        reservationsTotal,
        customersCount,
      },
      recent,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const b = await request.json().catch(() => ({}));
    const {
      entityId,
      entity,
      desktopRef: providedRef,
      desktopCustomerId,
    } = b || {};

    if (entityId && entity) {
      const desktopRef = providedRef || `DESK-${Math.floor(100000 + Math.random() * 900000)}`;

      if (entity === 'RESERVATION') {
        const res = await db.reservation.findUnique({
          where: { id: entityId },
          include: { customer: true },
        });

        if (!res) {
          return json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
        }

        await db.reservation.update({
          where: { id: entityId },
          data: {
            synced: true,
            syncedAt: new Date(),
            desktopRef,
          },
        });

        // Si el software de escritorio envió el id_cliente de Firebird, vincular al cliente maestro
        if (desktopCustomerId && res.customerId) {
          await db.customer.update({
            where: { id: res.customerId },
            data: {
              desktopId: Number(desktopCustomerId),
              syncedWithDesktop: true,
            },
          });
        }

        await db.syncLog.create({
          data: {
            entity: 'RESERVATION',
            entityId,
            action: 'UPDATE',
            status: 'SYNCED',
            message: `Reserva ${res.code} sincronizada con contrato Firebird ${desktopRef}${desktopCustomerId ? ` (Cliente ID: ${desktopCustomerId})` : ''}`,
            syncedAt: new Date(),
          },
        });

        return json({
          ok: true,
          message: 'Sincronizado con software de escritorio',
          desktopRef,
          desktopCustomerId: desktopCustomerId || null,
        });
      }

      if (entity === 'CUSTOMER') {
        if (desktopCustomerId) {
          await db.customer.update({
            where: { id: entityId },
            data: {
              desktopId: Number(desktopCustomerId),
              syncedWithDesktop: true,
            },
          });
          return json({ ok: true, message: 'Cliente sincronizado con mostrador' });
        }
      }
    }

    return json({ ok: false, error: 'Faltan parámetros entity o entityId' }, { status: 400 });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
};
