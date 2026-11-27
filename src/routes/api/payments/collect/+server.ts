import { type RequestEvent } from '@sveltejs/kit';
import { db } from '#lib/server/db.js';
import { isUserAdmin } from '#lib/server/adminAuth.js';
import { COLLECT_CONCEPT_VALUES } from '#lib/data/depositCharges.js';
import { checkCollectAmount, contractCapCOP } from '#lib/server/collectLimits.js';
import { requestIp } from '#lib/server/clientIp.js';
import {
  collectPaymentWithToken,
  classifyTokenRejection,
  invalidateToken,
  isTokenExpired,
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
      return Response.json(
        {
          ok: false,
          code: 'INVALID_CONCEPT',
          error: `El concepto del cobro es obligatorio. Valores permitidos: ${COLLECT_CONCEPT_VALUES.join(', ')}.`,
        },
        { status: 400 }
      );
    }

    // Allowlist de conceptos: el texto libre no llega a la pasarela ni a la
    // auditoría. La lista vive en `#lib/data/depositCharges.js` y la comparte
    // el selector del panel, así que no pueden desincronizarse.
    const cleanConcept = sanitizeGatewayText(concept, 30).toUpperCase();
    if (!COLLECT_CONCEPT_VALUES.includes(cleanConcept)) {
      return Response.json(
        {
          ok: false,
          code: 'INVALID_CONCEPT',
          error: `Concepto no admitido: "${cleanConcept}". Valores permitidos: ${COLLECT_CONCEPT_VALUES.join(', ')}.`,
        },
        { status: 400 }
      );
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

    // 2.a Sin evidencia de aceptación de términos no hay consentimiento que
    // autorice el cargo. Se rechaza antes de tocar la pasarela y antes de crear
    // el cargo, para no dejar un pendiente que luego no se pueda justificar.
    if (!reservation.termsVersion || !reservation.termsHash || !reservation.termsAcceptedAt) {
      return Response.json(
        {
          ok: false,
          code: 'NO_CONSENT',
          error:
            'La reserva no tiene registrada la aceptación de Términos y Condiciones (versión, hash, fecha e IP). Sin ese consentimiento no se puede ejecutar el cobro: un administrador puede registrarlo desde el panel de reservas.',
        },
        { status: 400 }
      );
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

    if (payment.tokenStatus === 'CANCELADO') {
      return Response.json(
        {
          ok: false,
          error: 'El token de la tarjeta fue cancelado y no admite nuevos cobros.',
          status: 'CANCELLED',
          tokenStatus: 'CANCELADO',
          retokenizationRequired: true,
        },
        { status: 400 }
      );
    }

    // 2.b Vigencia del token: si la fecha informada por la pasarela ya pasó, el
    // instrumento no debe viajar a Collect. Enviarlo con una tarjeta vencida
    // provoca un rechazo definitivo que además invalida el token; aquí se marca
    // EXPIRADO y se pide la re-tokenización sin gastar el intento ni llamar a
    // la pasarela. Si la sonda diaria ya lo marcó, solo se responde: reescribir
    // el pago o duplicar el SyncLog en cada intento no aporta nada.
    if (payment.tokenStatus === 'EXPIRADO' || isTokenExpired(payment.tokenValidUntil)) {
      if (payment.tokenStatus !== 'EXPIRADO') {
        await db.payment.update({
          where: { id: payment.id },
          data: {
            tokenStatus: 'EXPIRADO',
            p2pStatusMessage: `Token vencido el ${payment.tokenValidUntil}: requiere re-tokenización`,
          },
        });

        await db.syncLog.create({
          data: {
            entity: 'PAYMENT',
            entityId: payment.id,
            action: 'UPDATE',
            status: 'PENDING',
            message: `[Token] Cobro bloqueado para reserva ${reservation.code}: token vencido el ${payment.tokenValidUntil}`,
            payload: {
              reservationCode: reservation.code,
              tokenValidUntil: payment.tokenValidUntil,
              tokenStatus: 'EXPIRADO',
              gatewayCalled: false,
              purpose: 'EXPIRACION',
            },
          },
        });
      }

      return expiredTokenResponse(payment.tokenValidUntil);
    }

    // 3. Generar referencia única de cobro para idempotencia (Place to Pay previene duplicados en 24h)
    const reference = `COL-${reservation.code}-${Date.now().toString(36).toUpperCase()}`;
    // La pasarela valida `payment.description` con caracteres y longitud
    // restringidos. Se normaliza aquí (ASCII, sin saltos de línea, máx. 200)
    // antes de enviarla a Collect. El texto libre del administrador no se
    // persiste: en DepositCharge queda esta misma versión saneada, que es la
    // que se envió a la pasarela y la que sirve de auditoría del cargo.
    const detail = sanitizeGatewayText(description, 120);
    const cleanDescription = sanitizeGatewayText(
      `Dinamo Rent: ${cleanConcept} - ${detail || 'Cargos segun contrato'} (Reserva ${reservation.code})`,
      200
    );

    const clientIp = requestIp({ request, getClientAddress });
    // Guía de Suscripción §10.2: IP y agente de navegación reales del usuario que origina el cobro.
    const userAgent =
      request.headers.get('user-agent') || 'DinamoRentAdmin/1.0 Server-Collect';

    // 4. Persistir la intención ANTES de llamar a la pasarela.
    //
    // El cargo nace PENDIENTE con su referencia: si la respuesta del Collect se
    // pierde (timeout, error de red, función cortada a mitad), la fila queda como
    // el único rastro de que hubo un intento y con qué referencia buscarlo en
    // PlacetoPay. Desde ese momento bloquea nuevos cobros de la reserva hasta que
    // una persona lo cierre como ejecutado o no ejecutado.
    //
    // El lock asesor (por reserva) serializa dos cobros simultáneos del mismo
    // contrato: el segundo espera al primero y, al releer, ve su cargo en vez de
    // colarse entre la comprobación y la inserción. Es un lock de transacción y
    // no escribe ninguna fila: tocar `payments.updatedAt` aquí alargaría la
    // ventana de pago pendiente que usa create-session.
    const chargeOutcome = await db.$transaction(async (txn) => {
      await txn.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reservation.id}))`;

      const unresolved = await txn.depositCharge.findFirst({
        where: { reservationId: reservation.id, status: 'PENDIENTE', resolution: null },
        orderBy: { createdAt: 'desc' },
      });

      if (unresolved) return { blocked: unresolved } as const;

      // Tope contractual: `Reservation.blockingAmount` (ver collectLimits.ts).
      // Sin garantía no hay límite contra el que validar, así que no se cobra.
      const cap = contractCapCOP(reservation.blockingAmount);
      if (cap === null) {
        return {
          rejected: {
            code: 'NO_GUARANTEE',
            status: 400,
            error:
              'La reserva no tiene monto de garantía (blockingAmount), así que no hay tope contractual contra el que validar el cobro. Revisa la reserva antes de cobrar.',
            limits: null,
          },
        } as const;
      }

      // Acumulado de la reserva: lo aprobado más lo pendiente sin resolver. Se
      // lee dentro de la transacción, con el lock asesor tomado, para que dos
      // cobros simultáneos no sumen su importe contra el mismo saldo.
      const charged = await txn.depositCharge.findMany({
        where: {
          reservationId: reservation.id,
          status: { in: ['APROBADO', 'PENDIENTE'] },
        },
        select: { amount: true },
      });
      const alreadyCharged = charged.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);

      const limit = checkCollectAmount({ amount: numericAmount, cap, alreadyCharged });
      if (!limit.ok) {
        return {
          rejected: {
            code: limit.code,
            status: 400,
            error: limit.error,
            limits: {
              cap: limit.cap,
              alreadyCharged: limit.alreadyCharged,
              remaining: limit.remaining,
            },
          },
        } as const;
      }

      const created = await txn.depositCharge.create({
        data: {
          reservationId: reservation.id,
          amount: numericAmount,
          concept: cleanConcept,
          description: cleanDescription,
          status: 'PENDIENTE',
          reference,
          executedBy: 'ADMIN',
          consentVersion: reservation.termsVersion,
          consentHash: reservation.termsHash,
        },
      });

      return { charge: created } as const;
    });

    const blocked = 'blocked' in chargeOutcome ? chargeOutcome.blocked : undefined;

    if (blocked) {
      const pending = blocked;
      return Response.json(
        {
          ok: false,
          code: 'PENDING_CHARGE',
          error: `Esta reserva tiene un cobro PENDIENTE sin resolver (${pending.concept} por ${pending.amount} COP, referencia ${pending.reference ?? 'sin referencia'}). Ciérralo como ejecutado o no ejecutado antes de iniciar otro cobro.`,
          pending: {
            id: pending.id,
            reference: pending.reference,
            amount: pending.amount,
            concept: pending.concept,
            createdAt: pending.createdAt,
          },
        },
        { status: 409 }
      );
    }

    const rejected = 'rejected' in chargeOutcome ? chargeOutcome.rejected : undefined;

    if (rejected) {
      return Response.json(
        {
          ok: false,
          code: rejected.code,
          error: rejected.error,
          ...(rejected.limits ? { limits: rejected.limits } : {}),
        },
        { status: rejected.status }
      );
    }

    const chargeRecord = 'charge' in chargeOutcome ? chargeOutcome.charge : undefined;

    if (!chargeRecord) {
      return Response.json(
        { ok: false, error: 'No se pudo registrar el intento de cobro. No se llamó a la pasarela.' },
        { status: 500 }
      );
    }

    // 5. Ejecutar cobro Server-to-Server directo vía Place to Pay
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

    // Identificador del Collect en PlacetoPay. Se guarda en el cargo, en la
    // bitácora y en la respuesta para poder localizar la transacción allá aunque
    // la fila se haya borrado con la reserva.
    const gatewayRequestId = result.requestId || null;

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
          reference,
          reservationCode: reservation.code,
          concept: cleanConcept,
          amount: numericAmount,
          status: result.status,
          authorization: result.authorization,
          requestId: gatewayRequestId,
        },
      },
    });

    // 7. La pasarela no confirmó el cobro: se responde 502 sin tocar el token.
    // Invalidarlo aquí desvincularía la tarjeta del cliente por un fallo de
    // comunicación nuestro, no por un rechazo del emisor.
    if (unconfirmed) {
      // Un error de validación del request no deja cargo en la pasarela: el
      // mensaje se lo dice al administrador para que corrija el dato. En ese caso
      // no hay nada que conciliar, así que el cargo se retira de la lista de
      // pendientes en vez de bloquear la reserva para siempre.
      const validationFailure = result.error === 'Solicitud rechazada por validación de la pasarela';

      await db.depositCharge.update({
        where: { id: chargeRecord.id },
        data: validationFailure
          ? {
              status: 'RECHAZADO',
              resolution: 'NO_EJECUTADO',
              resolutionNote: 'Rechazado por validación de la pasarela: el cobro no se ejecutó.',
              resolvedAt: new Date(),
              p2pStatusMessage: result.message,
            }
          : // Sin veredicto: el cargo sigue PENDIENTE (bloquea el reintento) y solo
            // se guarda el rastro de la pasarela para quien vaya a conciliarlo.
            {
              p2pRequestId: gatewayRequestId,
              p2pStatusMessage: result.message,
            },
      });

      const referenceNote = validationFailure
        ? ''
        : ` El intento quedó registrado con la referencia ${reference}: búscala en el panel de PlacetoPay y ciérralo como ejecutado o no ejecutado en el panel de reservas antes de reintentar.`;

      return Response.json(
        {
          ok: false,
          code: 'UNCONFIRMED_CHARGE',
          error: validationFailure
            ? `${result.message} El cobro no se ejecutó y el token de la tarjeta no se modificó.`
            : `No fue posible confirmar el cobro con la pasarela (${result.message}). El cargo quedó PENDIENTE y bloquea nuevos cobros.${referenceNote} El token de la tarjeta no se modificó.`,
          status: 'PENDING',
          reference,
          requestId: gatewayRequestId,
          chargeId: chargeRecord.id,
          attempts: 0,
          tokenInvalidation: null,
        },
        { status: 502 }
      );
    }

    // 8. Completar el cargo con el veredicto de la pasarela
    const settled = await db.depositCharge.update({
      where: { id: chargeRecord.id },
      data: {
        status: isApproved ? 'APROBADO' : 'RECHAZADO',
        transactionId: result.authorization || result.receipt || null,
        p2pRequestId: gatewayRequestId,
        p2pStatusMessage: result.message,
      },
    });

    // 9. Control de rechazos e invalidación del token (Guía de Suscripción §8)
    // - Rechazos definitivos (robada, perdida, bloqueada, vencida, inválida, uso restringido) → invalidación inmediata.
    // - Cualquier otro rechazo (ej. fondos insuficientes) → máximo 3 intentos consecutivos antes de invalidar.
    let attempts = 1;
    let tokenInvalidation: { applied: boolean; reason: string; message: string } | null = null;

    if (!isApproved && result.status === 'REJECTED') {
      const recentCharges = await db.depositCharge.findMany({
        where: { reservationId: reservation.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { status: true, resolution: true },
      });

      attempts = 0;
      for (const charge of recentCharges) {
        // Un cargo cerrado a mano como NO_EJECUTADO no fue veredicto del emisor:
        // no suma intento ni corta la racha de rechazos reales.
        if (charge.resolution === 'NO_EJECUTADO') continue;
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
        id: settled.id,
        reference: settled.reference,
        amount: settled.amount,
        concept: settled.concept,
        authorization: settled.transactionId,
        requestId: gatewayRequestId,
        createdAt: settled.createdAt,
      },
      attempts: 0,
    });
  } catch (err) {
    console.error('[payment/collect error]:', err);
    return Response.json({ ok: false, error: "Error interno del servidor. Intenta de nuevo." }, { status: 500 });
  }
};

/**
 * Respuesta del cobro cuando el token está vencido (o ya marcado EXPIRADO por
 * la sonda diaria). Es un 400, no un 402: la pasarela no vio la solicitud, no
 * hubo veredicto del emisor y no se consumió ningún intento.
 */
function expiredTokenResponse(tokenValidUntil: string | null) {
  const fecha = String(tokenValidUntil ?? '').trim();
  return Response.json(
    {
      ok: false,
      error: fecha
        ? `El token de la tarjeta venció el ${fecha} y quedó marcado como EXPIRADO. Registra una nueva tarjeta de garantía (re-tokenización) antes de cobrar. No se envió ningún cargo a la pasarela.`
        : 'El token de la tarjeta está marcado como EXPIRADO. Registra una nueva tarjeta de garantía (re-tokenización) antes de cobrar. No se envió ningún cargo a la pasarela.',
      status: 'EXPIRED',
      tokenStatus: 'EXPIRADO',
      retokenizationRequired: true,
    },
    { status: 400 }
  );
}
