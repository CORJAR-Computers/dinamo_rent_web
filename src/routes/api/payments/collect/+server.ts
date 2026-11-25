import { type RequestEvent } from '@sveltejs/kit';
import { db } from '#lib/server/db.js';
import { isUserAdmin } from '#lib/server/adminAuth.js';
import {
  collectPaymentWithToken,
  classifyTokenRejection,
  invalidateToken,
  sanitizeGatewayText,
} from '#lib/server/placetopay.js';

export const POST = async ({ request, cookies, getClientAddress }: RequestEvent) => {
  // 1. Verificación estricta de permisos de administrador (Seguridad RBAC)
  if (!isUserAdmin(cookies)) {
    return Response.json({ ok: false, error: 'No autorizado. Se requiere sesión de administrador.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { reservationId, amount, concept, description } = body || {};

    if (!reservationId) {
      return Response.json({ ok: false, error: 'reservationId es obligatorio' }, { status: 400 });
    }

    const numericAmount = Math.round(Number(amount));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return Response.json({ ok: false, error: 'El monto a cobrar debe ser un valor mayor a cero (COP)' }, { status: 400 });
    }

    if (!concept) {
      return Response.json({ ok: false, error: 'El concepto del cobro es obligatorio (ej. DEDUCIBLE, GASOLINA, DIAS_EXTRA, MULTA)' }, { status: 400 });
    }

    // 2. Obtener reserva y verificar disponibilidad del token de garantía
    const reservation = await db.reservation.findUnique({
      where: { id: reservationId },
      include: {
        payment: true,
        vehicle: true,
      },
    });

    if (!reservation) {
      return Response.json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    const { payment } = reservation;
    if (!payment || !payment.token) {
      return Response.json(
        {
          ok: false,
          error: 'Esta reserva no cuenta con una tarjeta tokenizada activa para cobros de garantía.',
        },
        { status: 400 }
      );
    }

    if (payment.tokenStatus === 'CANCELADO' || payment.tokenStatus === 'EXPIRADO') {
      return Response.json(
        {
          ok: false,
          error: `El token de la tarjeta no está activo (estado actual: ${payment.tokenStatus}).`,
        },
        { status: 400 }
      );
    }

    // 3. Generar referencia única de cobro para idempotencia (Place to Pay previene duplicados en 24h)
    const reference = `COL-${reservation.code}-${Date.now().toString(36).toUpperCase()}`;
    // La pasarela valida `payment.description` con caracteres y longitud
    // restringidos. Se normaliza aquí (ASCII, sin saltos de línea, máx. 200)
    // antes de enviarla a Collect; el texto original del administrador se
    // conserva en DepositCharge para auditoría.
    const cleanConcept = sanitizeGatewayText(concept, 30).toUpperCase() || 'OTRO';
    const detail = sanitizeGatewayText(description, 120);
    const cleanDescription = sanitizeGatewayText(
      `Dinamo Rent: ${cleanConcept} - ${detail || 'Cargos segun contrato'} (Reserva ${reservation.code})`,
      200
    );

    let clientIp = '127.0.0.1';
    try {
      clientIp = getClientAddress();
    } catch {
      clientIp =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    }
    // Guía de Suscripción §10.2: IP y agente de navegación reales del usuario que origina el cobro.
    const userAgent =
      request.headers.get('user-agent') || 'DinamoRentAdmin/1.0 Server-Collect';

    // 4. Ejecutar cobro Server-to-Server directo vía Place to Pay
    const result = await collectPaymentWithToken({
      token: payment.token,
      reference,
      description: cleanDescription,
      amountCOP: numericAmount,
      customer: {
        names: reservation.customerName,
        lastnames: reservation.customerLastname,
        email: reservation.customerEmail,
        phone: reservation.customerPhone,
        docType: reservation.customerIdType,
        docNumber: reservation.customerIdNumber,
      },
      ipAddress: clientIp,
      userAgent,
    });

    const isApproved = result.ok && result.status === 'APPROVED';
    // Sin veredicto (timeout, error de red o configuración incompleta) el cobro no
    // fue rechazado por el emisor: queda PENDIENTE y no cuenta como intento.
    const unconfirmed = !isApproved && result.status === 'PENDING';

    // 5. Registrar en auditoría de cobros de garantía (DepositCharge)
    const chargeRecord = await db.depositCharge.create({
      data: {
        reservationId: reservation.id,
        amount: numericAmount,
        concept: cleanConcept,
        description: cleanDescription,
        status: isApproved ? 'APROBADO' : unconfirmed ? 'PENDIENTE' : 'RECHAZADO',
        transactionId: result.authorization || result.receipt || null,
        p2pRequestId: result.requestId || null,
        p2pStatusMessage: result.message,
        executedBy: 'ADMIN',
      },
    });

    // 6. Registrar en el log de sincronización
    await db.syncLog.create({
      data: {
        entity: 'PAYMENT',
        entityId: chargeRecord.id,
        action: 'CREATE',
        status: 'PENDING',
        message: `Cobro de garantía procesado con token para reserva ${reservation.code}: ${cleanConcept} por ${numericAmount} COP (${result.status})`,
        payload: {
          chargeId: chargeRecord.id,
          reservationCode: reservation.code,
          concept: cleanConcept,
          amount: numericAmount,
          status: result.status,
          authorization: result.authorization,
        },
      },
    });

    // 6.b La pasarela no confirmó el cobro: se responde 502 sin tocar el token.
    // Invalidarlo aquí desvincularía la tarjeta del cliente por un fallo de
    // comunicación nuestro, no por un rechazo del emisor.
    if (unconfirmed) {
      // Un error de validación del request no deja cargo en la pasarela: el
      // mensaje se lo dice al administrador para que corrija el dato.
      const validationFailure = result.error === 'Solicitud rechazada por validación de la pasarela';
      return Response.json(
        {
          ok: false,
          error: validationFailure
            ? `${result.message} El cobro no se ejecutó y el token de la tarjeta no se modificó.`
            : `No fue posible confirmar el cobro con la pasarela (${result.message}). El cargo quedó PENDIENTE: verifícalo en el panel de PlacetoPay antes de reintentar. El token de la tarjeta no se modificó.`,
          status: 'PENDING',
          attempts: 0,
          tokenInvalidation: null,
        },
        { status: 502 }
      );
    }

    // 7. Control de rechazos e invalidación del token (Guía de Suscripción §8)
    // - Rechazos definitivos (robada, perdida, bloqueada, vencida, inválida, uso restringido) → invalidación inmediata.
    // - Cualquier otro rechazo (ej. fondos insuficientes) → máximo 3 intentos consecutivos antes de invalidar.
    let attempts = 1;
    let tokenInvalidation: { applied: boolean; reason: string; message: string } | null = null;

    if (!isApproved && result.status === 'REJECTED') {
      const recentCharges = await db.depositCharge.findMany({
        where: { reservationId: reservation.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { status: true },
      });

      attempts = 0;
      for (const charge of recentCharges) {
        if (charge.status === 'RECHAZADO') attempts += 1;
        else break;
      }

      const classification = classifyTokenRejection(result.message);
      const mustInvalidate = classification.immediate || attempts >= 3;

      if (mustInvalidate) {
        const reason =
          classification.reason ??
          `${attempts} intentos de cobro rechazados consecutivamente`;
        const invalidated = await invalidateToken(payment.token, reason);

        if (invalidated.ok) {
          await db.payment.update({
            where: { id: payment.id },
            data: {
              tokenStatus: 'CANCELADO',
              p2pStatusMessage: `Token invalidado: ${reason}`,
            },
          });
        }

        await db.syncLog.create({
          data: {
            entity: 'PAYMENT',
            entityId: payment.id,
            action: 'UPDATE',
            status: 'PENDING',
            message: `[Token] ${invalidated.ok ? 'Token invalidado' : 'Falló la invalidación del token'} para reserva ${reservation.code}: ${reason}`,
            payload: {
              reservationCode: reservation.code,
              reason,
              attempts,
              immediate: classification.immediate,
              invalidated: invalidated.ok,
              gatewayMessage: result.message,
            },
          },
        });

        tokenInvalidation = {
          applied: invalidated.ok,
          reason,
          message: invalidated.message,
        };
      }
    }

    if (!isApproved) {
      const invalidationSuffix = tokenInvalidation?.applied
        ? ` La tarjeta fue desvinculada (${tokenInvalidation.reason}); se requiere registrar una nueva tarjeta para cobrar la garantía.`
        : tokenInvalidation
          ? ` No fue posible invalidar el token en la pasarela: ${tokenInvalidation.message}`
          : '';

      return Response.json(
        {
          ok: false,
          error: `${result.message || 'La pasarela no aprobó el cobro con la tarjeta registrada.'}${invalidationSuffix}`,
          status: result.status,
          attempts,
          tokenInvalidation,
        },
        { status: 402 }
      );
    }

    return Response.json({
      ok: true,
      message: 'Cobro de garantía procesado exitosamente.',
      charge: {
        id: chargeRecord.id,
        amount: chargeRecord.amount,
        concept: chargeRecord.concept,
        authorization: chargeRecord.transactionId,
        createdAt: chargeRecord.createdAt,
      },
      attempts: 0,
    });
  } catch (err) {
    console.error('[payment/collect error]:', err);
    return Response.json({ ok: false, error: "Error interno del servidor. Intenta de nuevo." }, { status: 500 });
  }
};
