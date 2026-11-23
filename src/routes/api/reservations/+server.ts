import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.js';
import {
  genReservationCode,
  genBlockCode,
  daysBetween,
  INSURANCE_CONFIG,
  calcExtrasAmount,
  calcBlockingAmount,
  type ExtrasSelection,
} from '#lib/server/helpers.js';
import type { InsurancePlan } from '@prisma/client';

import { isUserAdmin } from '#lib/server/adminAuth.js';
import { PICKUP_LOCATIONS, normalizePickupLocation } from '#lib/data/fleet.js';
import { validateDocumentNumber, normalizeDocType } from '#lib/utils/documentValidation.js';
import { checkRateLimit } from '#lib/server/rateLimit.js';
import { calcTaxes } from '#lib/utils/taxes.js';

export const GET: RequestHandler = async ({ url, cookies }) => {
  try {
    const email = url.searchParams.get('email');
    const code = url.searchParams.get('code');
    const docNumber = url.searchParams.get('docNumber');
    const requestId = url.searchParams.get('requestId');

    const isAdmin = isUserAdmin(cookies);

    // Protección anti-scraping / anti-fuga de datos (PII):
    // Si no es un administrador autenticado, se exige obligatoriamente un filtro de búsqueda específico.
    if (!isAdmin && !code && !email && !docNumber && !requestId) {
      return Response.json(
        {
          ok: false,
          error: 'Por seguridad, debes indicar tu código de reserva, correo o número de documento para consultar.',
        },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {};
    if (email) where.customerEmail = email.trim().toLowerCase();
    if (code) where.code = code.toUpperCase();
    if (docNumber) where.customerIdNumber = docNumber.trim();
    if (requestId) where.payment = { p2pRequestId: requestId.trim() };

    const reservations = await db.reservation.findMany({
      where,
      include: {
        vehicle: true,
        payment: true,
        customer: true,
      },
      orderBy: { createdAt: 'desc' },
      take: isAdmin ? 100 : 10,
    });

    return Response.json({ ok: true, reservations, count: reservations.length });
  } catch (e) {
    console.error('[api/reservations GET] error:', e);
    return Response.json({ ok: false, error: "Error interno del servidor. Intenta de nuevo." }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  try {
    // Control de tasa anti-spam / anti-bot: máximo 15 solicitudes de reserva cada 10 min por IP
    let clientIp = '127.0.0.1';
    try {
      clientIp = getClientAddress();
    } catch {
      clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    }

    const rateLimit = checkRateLimit(clientIp, {
      endpointKey: 'create-reservation',
      windowMs: 10 * 60 * 1000,
      maxRequests: 15,
    });

    if (!rateLimit.allowed) {
      return Response.json(
        {
          ok: false,
          error: `Has enviado demasiadas solicitudes de reserva en poco tiempo. Por favor espera ${rateLimit.retryAfterSeconds} segundos.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }
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
      docPhotoUrl,
      licensePhotoUrl,
      insurancePlan = 'TOTAL',
      extras = {},
      signatureDataUrl,
      notes,
    } = b || {};

    if (!vehicleId || !pickupDate || !returnDate || !customerName || !customerEmail || !customerPhone || !customerIdNumber) {
      return Response.json({ ok: false, error: 'Faltan campos obligatorios para la reserva' }, { status: 400 });
    }

    // === VALIDACIÓN ESTRICTA DE DOCUMENTO SEGÚN PLACETOPAY ===
    const cleanDocType = normalizeDocType(customerIdType);
    const docValidation = validateDocumentNumber(cleanDocType, String(customerIdNumber));
    if (!docValidation.valid) {
      return Response.json({ ok: false, error: docValidation.error }, { status: 400 });
    }

    // === UBICACIONES: solo valores conocidos (PICKUP_LOCATIONS) ===
    // Se normaliza (mayúsculas/acentos/espacios/guiones) y lo que no exista en
    // la lista se rechaza con 400. Vacío o ausente -> valor por defecto.
    const rawPickup = typeof pickupLocation === 'string' ? pickupLocation.trim() : '';
    const rawReturn = typeof returnLocation === 'string' ? returnLocation.trim() : '';
    const resolvedPickup = rawPickup ? normalizePickupLocation(rawPickup) : PICKUP_LOCATIONS[0];
    const resolvedReturn = rawReturn ? normalizePickupLocation(rawReturn) : PICKUP_LOCATIONS[0];
    if (!resolvedPickup || !resolvedReturn) {
      const invalid = !resolvedPickup ? `pickupLocation="${rawPickup}"` : `returnLocation="${rawReturn}"`;
      return Response.json(
        {
          ok: false,
          error: `Ubicación desconocida (${invalid}). Valores permitidos: ${PICKUP_LOCATIONS.join(' | ')}`,
          allowed: PICKUP_LOCATIONS,
        },
        { status: 400 }
      );
    }

    let vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      vehicle = await db.vehicle.findFirst({ where: { id: vehicleId } });
      if (!vehicle) {
        return Response.json({ ok: false, error: 'Vehículo no encontrado en el sistema' }, { status: 404 });
      }
    }
    if (!vehicle.available) {
      return Response.json({ ok: false, error: 'El vehículo seleccionado no está disponible temporalmente' }, { status: 400 });
    }

    const start = new Date(pickupDate);
    const end = new Date(returnDate);
    if (end <= start) {
      return Response.json({ ok: false, error: 'La fecha de devolución debe ser posterior a la fecha de entrega' }, { status: 400 });
    }

    // Verificación de solapamiento de fechas y unidades disponibles en PostgreSQL
    const unitsAvailable = vehicle.units || 1;
    const activeReservationsCount = await db.reservation.count({
      where: {
        vehicleId: vehicle.id,
        status: { in: ['CONFIRMADA', 'PAGADA', 'EN_CURSO'] },
        pickupDate: { lte: end },
        returnDate: { gte: start },
      },
    });

    if (activeReservationsCount >= unitsAvailable) {
      return Response.json(
        {
          ok: false,
          error: 'El vehículo no está disponible para las fechas seleccionadas. Por favor elige otro vehículo o fechas.',
        },
        { status: 409 }
      );
    }

    // === GESTIÓN DE CLIENTE (CERO DUPLICADOS) ===
    const cleanDoc = String(customerIdNumber).trim();
    const cleanEmail = String(customerEmail).trim().toLowerCase();
    const cleanPhone = String(customerPhone).trim();
    const fullName = `${customerName.trim()} ${(customerLastname || '').trim()}`.trim();

    const customer = await db.customer.upsert({
      where: { docNumber: cleanDoc },
      create: {
        docType: cleanDocType,
        docNumber: cleanDoc,
        names: customerName.trim(),
        lastnames: (customerLastname || '').trim(),
        fullName,
        email: cleanEmail,
        phone: cleanPhone,
        license: customerLicense?.trim() || null,
        licenseExp: customerLicenseExp?.trim() || null,
        hotel: customerHotel?.trim() || null,
      },
      update: {
        docType: cleanDocType,
        names: customerName.trim(),
        lastnames: (customerLastname || '').trim(),
        fullName,
        email: cleanEmail,
        phone: cleanPhone,
        license: customerLicense?.trim() || undefined,
        licenseExp: customerLicenseExp?.trim() || undefined,
        hotel: customerHotel?.trim() || undefined,
      },
    });

    const days = Math.max(1, daysBetween(start, end));
    const baseAmount = vehicle.pricePerDay * days;
    const plan: InsurancePlan = insurancePlan === 'BASICO' ? 'BASICO' : 'TOTAL';
    const insCfg = INSURANCE_CONFIG[plan];
    const insuranceAmount = insCfg.perDay * days;
    const extrasAmount = calcExtrasAmount(extras as ExtrasSelection, days);
    // Las tarifas publicadas no incluyen IVA: se calcula el 19% y se suma al total.
    const subtotalAmount = baseAmount + insuranceAmount + extrasAmount;
    const taxes = calcTaxes(subtotalAmount);
    const totalAmount = taxes.total;
    const blockingAmount = calcBlockingAmount(baseAmount, extrasAmount, insuranceAmount);

    let code = genReservationCode();
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
          customerId: customer.id,
          customerName: customer.names,
          customerLastname: customer.lastnames,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          customerIdType: customer.docType,
          customerIdNumber: customer.docNumber,
          customerLicense: customer.license,
          customerLicenseExp: customer.licenseExp,
          customerHotel: customer.hotel,
          pickupDate: start,
          returnDate: end,
          pickupTime,
          returnTime,
          pickupLocation: resolvedPickup,
          returnLocation: resolvedReturn,
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
          docPhotoUrl: docPhotoUrl || null,
          licensePhotoUrl: licensePhotoUrl || null,
          notes: notes || null,
        },
        include: {
          vehicle: true,
          customer: true,
        },
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
          message: `Reserva web ${code} creada para ${customer.fullName} (${customer.docNumber})`,
          payload: {
            code,
            customerId: customer.id,
            customerDoc: customer.docNumber,
            customerName: customer.fullName,
            vehicle: vehicle.name,
            totalAmount,
            pickupDate: start.toISOString(),
            returnDate: end.toISOString(),
          },
        },
      });

      return reservation;
    });

    return Response.json({
      ok: true,
      reservation: {
        id: result.id,
        code: result.code,
        status: result.status,
        subtotalAmount,
        taxAmount: taxes.iva,
        totalAmount: result.totalAmount,
        blockingAmount: result.blockingAmount,
        days: result.days,
        synced: result.synced,
        desktopRef: result.desktopRef,
        customer: {
          id: result.customer?.id,
          docNumber: result.customer?.docNumber,
          fullName: result.customer?.fullName,
          email: result.customer?.email,
          phone: result.customer?.phone,
          desktopId: result.customer?.desktopId,
        },
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
    return Response.json({ ok: false, error: "Error interno del servidor. Intenta de nuevo." }, { status: 500 });
  }
};
