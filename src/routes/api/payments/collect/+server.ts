import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isUserAdmin } from '$lib/server/adminAuth';
import { collectPaymentWithToken } from '$lib/server/placetopay';

export const POST = async ({ request, cookies, getClientAddress }: RequestEvent) => {
  // 1. Verificación estricta de permisos de administrador (Seguridad RBAC)
  if (!isUserAdmin(cookies)) {
    return json({ ok: false, error: 'No autorizado. Se requiere sesión de administrador.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { reservationId, amount, concept, description } = body || {};

    if (!reservationId) {
      return json({ ok: false, error: 'reservationId es obligatorio' }, { status: 400 });
    }

    const numericAmount = Math.round(Number(amount));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return json({ ok: false, error: 'El monto a cobrar debe ser un valor mayor a cero (COP)' }, { status: 400 });
    }

    if (!concept) {
      return json({ ok: false, error: 'El concepto del cobro es obligatorio (ej. DEDUCIBLE, GASOLINA, DIAS_EXTRA, MULTA)' }, { status: 400 });
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
      return json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    const { payment } = reservation;
    if (!payment || !payment.token) {
      return json(
        {
          ok: false,
          error: 'Esta reserva no cuenta con una tarjeta tokenizada activa para cobros de garantía.',
        },
        { status: 400 }
      );
    }

    if (payment.tokenStatus === 'CANCELADO' || payment.tokenStatus === 'EXPIRADO') {
      return json(
        {
          ok: false,
          error: `El token de la tarjeta no está activo (estado actual: ${payment.tokenStatus}).`,
        },
        { status: 400 }
      );
    }

    // 3. Generar referencia única de cobro para idempotencia (Place to Pay previene duplicados en 24h)
    const reference = `COL-${reservation.code}-${Date.now().toString(36).toUpperCase()}`;
    const cleanConcept = String(concept).toUpperCase().trim();
    const cleanDescription = `Dinamo Rent: ${cleanConcept} — ${description || 'Cargos según contrato'} (Reserva #${reservation.code})`;

    let clientIp = '127.0.0.1';
    try {
      clientIp = getClientAddress();
    } catch {
      // Ignorar si no está disponible en entorno local
    }

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
      userAgent: 'DinamoRentAdmin/1.0 Server-Collect',
    });

    const isApproved = result.ok && result.status === 'APPROVED';

    // 5. Registrar en auditoría de cobros de garantía (DepositCharge)
    const chargeRecord = await db.depositCharge.create({
      data: {
        reservationId: reservation.id,
        amount: numericAmount,
        concept: cleanConcept,
        description: cleanDescription,
        status: isApproved ? 'APROBADO' : 'RECHAZADO',
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

    if (!isApproved) {
      return json(
        {
          ok: false,
          error: result.message || 'La pasarela no aprobó el cobro con la tarjeta registrada.',
          status: result.status,
        },
        { status: 402 }
      );
    }

    return json({
      ok: true,
      message: 'Cobro de garantía procesado exitosamente.',
      charge: {
        id: chargeRecord.id,
        amount: chargeRecord.amount,
        concept: chargeRecord.concept,
        authorization: chargeRecord.transactionId,
        createdAt: chargeRecord.createdAt,
      },
    });
  } catch (err) {
    console.error('[payment/collect error]:', err);
    return json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
};
