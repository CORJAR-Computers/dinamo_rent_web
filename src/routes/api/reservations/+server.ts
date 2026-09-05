import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
  genReservationCode,
  genBlockCode,
  daysBetween,
  INSURANCE_CONFIG,
  calcExtrasAmount,
  calcBlockingAmount,
  type ExtrasSelection,
} from '$lib/server/helpers';
import type { InsurancePlan } from '@prisma/client';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const email = url.searchParams.get('email');
    const code = url.searchParams.get('code');
    const where: Record<string, unknown> = {};
    if (email) where.customerEmail = email;
    if (code) where.code = code.toUpperCase();

    const reservations = await db.reservation.findMany({
      where,
      include: { vehicle: true, payment: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return json({ ok: true, reservations, count: reservations.length });
  } catch (e) {
    console.error('[api/reservations GET] error:', e);
    return json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const b = await request.json();
    const {
      vehicleId,
      pickupDate,
      returnDate,
      pickupTime = '10:00',
      returnTime = '10:00',
      pickupLocation = 'Aeropuerto Internacional Rafael Núñez (CTG)',
      returnLocation = 'Aeropuerto Internacional Rafael Núñez (CTG)',
      customerName,
      customerLastname = '',
      customerEmail,
      customerPhone,
      customerIdType = 'CC',
      customerIdNumber,
      customerLicense,
      customerLicenseExp,
      customerHotel,
      insurancePlan = 'TOTAL',
      extras = {},
      signatureDataUrl,
      notes,
    } = b || {};

    if (!vehicleId || !pickupDate || !returnDate || !customerName || !customerEmail || !customerPhone || !customerIdNumber) {
      return json({ ok: false, error: 'Faltan campos obligatorios para la reserva' }, { status: 400 });
    }

    // Busca o crea el vehículo si es de la flota precargada
    let vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      // Si el id es de la lista estática (ej: "kia-picanto-2024"), busca por id o crea
      vehicle = await db.vehicle.findFirst({ where: { id: vehicleId } });
      if (!vehicle) {
        return json({ ok: false, error: 'Vehículo no encontrado en el sistema' }, { status: 404 });
      }
    }
    if (!vehicle.available) {
      return json({ ok: false, error: 'El vehículo seleccionado no está disponible temporalmente' }, { status: 400 });
    }

    const start = new Date(pickupDate);
    const end = new Date(returnDate);
    if (end <= start) {
      return json({ ok: false, error: 'La fecha de devolución debe ser posterior a la fecha de entrega' }, { status: 400 });
    }

    // Verificación de solapamiento de fechas en PostgreSQL
    const conflict = await db.reservation.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: { in: ['CONFIRMADA', 'PAGADA', 'EN_CURSO'] },
        pickupDate: { lte: end },
        returnDate: { gte: start },
      },
    });
    if (conflict) {
      return json(
        {
          ok: false,
          error: 'El vehículo no está disponible para las fechas seleccionadas. Por favor elige otro vehículo o fechas.',
        },
        { status: 409 }
      );
    }

    const days = Math.max(1, daysBetween(start, end));
    const baseAmount = vehicle.pricePerDay * days;
    const plan: InsurancePlan = insurancePlan === 'BASICO' ? 'BASICO' : 'TOTAL';
    const insCfg = INSURANCE_CONFIG[plan];
    const insuranceAmount = insCfg.perDay * days;
    const extrasAmount = calcExtrasAmount(extras as ExtrasSelection, days);
    const totalAmount = baseAmount + insuranceAmount + extrasAmount;
    const blockingAmount = calcBlockingAmount(baseAmount, extrasAmount, insuranceAmount);

    let code = genReservationCode();
    // Asegurar código único
    let exists = await db.reservation.findUnique({ where: { code } });
    while (exists) {
      code = genReservationCode();
      exists = await db.reservation.findUnique({ where: { code } });
    }

    const blockCode = genBlockCode();

    const result = await db.$transaction(async (txn) => {
      const reservation = await txn.reservation.create({
        data: {
          code,
          vehicleId: vehicle.id,
          customerName,
          customerLastname,
          customerEmail,
          customerPhone,
          customerIdType,
          customerIdNumber,
          customerLicense: customerLicense || null,
          customerLicenseExp: customerLicenseExp || null,
          customerHotel: customerHotel || null,
          pickupDate: start,
          returnDate: end,
          pickupTime,
          returnTime,
          pickupLocation,
          returnLocation,
          days,
          baseAmount,
          extrasAmount,
          insuranceAmount,
          blockingAmount,
          totalAmount,
          status: 'PENDIENTE',
          insurancePlan: plan,
          extras: extras || {},
          signatureDataUrl: signatureDataUrl || null,
          notes: notes || null,
        },
        include: { vehicle: true },
      });

      await txn.insuranceBlock.create({
        data: {
          reservationId: reservation.id,
          code: blockCode,
          type: plan,
          description: `Bloqueo de garantía: ${insCfg.name} para reserva ${code}`,
          amount: Math.round(vehicle.deposit * insCfg.depositFactor),
          status: 'ACTIVO',
        },
      });

      await txn.syncLog.create({
        data: {
          entity: 'RESERVATION',
          entityId: reservation.id,
          action: 'CREATE',
          status: 'PENDING',
          message: `Reserva web ${code} creada para ${customerName} ${customerLastname}`,
          payload: {
            code,
            vehicle: vehicle.name,
            totalAmount,
            pickupDate: start.toISOString(),
            returnDate: end.toISOString(),
          },
        },
      });

      return reservation;
    });

    return json({
      ok: true,
      reservation: {
        id: result.id,
        code: result.code,
        status: result.status,
        totalAmount: result.totalAmount,
        blockingAmount: result.blockingAmount,
        days: result.days,
        synced: result.synced,
        desktopRef: result.desktopRef,
        vehicle: {
          id: result.vehicle.id,
          name: result.vehicle.name,
          plate: result.vehicle.plate,
          image: result.vehicle.image,
        },
      },
    });
  } catch (e) {
    console.error('[api/reservations POST] error:', e);
    return json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
};
