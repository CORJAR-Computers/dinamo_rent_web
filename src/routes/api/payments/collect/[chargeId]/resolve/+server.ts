import { type RequestEvent } from '@sveltejs/kit';
import { db } from '#lib/server/db.js';
import { isUserAdmin } from '#lib/server/adminAuth.js';
import { sanitizeGatewayText } from '#lib/server/placetopay.js';

/**
 * Cierre manual de un cobro de garantía que quedó PENDIENTE.
 *
 * El cargo se persiste antes de llamar a la pasarela, así que un timeout o un
 * corte de red deja una fila PENDIENTE sin veredicto. Esa fila bloquea nuevos
 * cobros de la reserva (`/api/payments/collect`) hasta que una persona mire la
 * referencia en el panel de PlacetoPay y decida:
 *
 *  - `EJECUTADO`: el dinero sí salió. Exige el código de autorización del
 *    movimiento, que es la prueba consultable del cobro; el cargo pasa a
 *    APROBADO.
 *  - `NO_EJECUTADO`: el movimiento no existe. Exige el motivo y el cargo pasa a
 *    RECHAZADO con `resolution = NO_EJECUTADO`, de modo que no cuenta como
 *    rechazo del emisor para la regla de tres intentos.
 *
 * Cerrar no ejecuta ni revierte nada en la pasarela: solo registra la decisión,
 * que queda auditada en `SyncLog` con la referencia original.
 */

const RESOLUTIONS = ['EJECUTADO', 'NO_EJECUTADO'] as const;

type Resolution = (typeof RESOLUTIONS)[number];

export const POST = async ({ params, request, cookies }: RequestEvent) => {
  if (!isUserAdmin(cookies)) {
    return Response.json({ ok: false, error: 'No autorizado. Se requiere sesión de administrador.' }, { status: 401 });
  }

  const chargeId = String(params.chargeId || '').trim();
  if (!chargeId) {
    return Response.json({ ok: false, error: 'chargeId es obligatorio' }, { status: 400 });
  }

  let payload: { resolution?: unknown; authorization?: unknown; note?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
  }

  const resolution = String(payload?.resolution || '').trim().toUpperCase();
  if (!RESOLUTIONS.includes(resolution as Resolution)) {
    return Response.json(
      { ok: false, error: `resolution debe ser ${RESOLUTIONS.join(' o ')}` },
      { status: 400 }
    );
  }

  // La autorización es la evidencia de que el dinero salió: sin ella no se
  // puede cerrar como ejecutado. El motivo es obligatorio para lo contrario,
  // porque es lo que explica después por qué la reserva siguió sin cobro.
  const authorization = sanitizeGatewayText(payload?.authorization, 40);
  const note = sanitizeGatewayText(payload?.note, 300);

  if (resolution === 'EJECUTADO' && !authorization) {
    return Response.json(
      {
        ok: false,
        error: 'Indica el código de autorización del movimiento en PlacetoPay para cerrar el cobro como ejecutado.',
      },
      { status: 400 }
    );
  }

  if (resolution === 'NO_EJECUTADO' && note.length < 5) {
    return Response.json(
      { ok: false, error: 'Indica el motivo por el que el cobro no se ejecutó.' },
      { status: 400 }
    );
  }

  try {
    const charge = await db.depositCharge.findUnique({
      where: { id: chargeId },
      include: { reservation: { select: { code: true } } },
    });

    if (!charge) {
      return Response.json({ ok: false, error: 'Cargo no encontrado' }, { status: 404 });
    }

    if (charge.status !== 'PENDIENTE' || charge.resolution) {
      return Response.json(
        {
          ok: false,
          error: `El cargo ya está cerrado (${charge.status}${charge.resolution ? ` / ${charge.resolution}` : ''}).`,
          charge: {
            id: charge.id,
            status: charge.status,
            resolution: charge.resolution,
            resolvedAt: charge.resolvedAt,
          },
        },
        { status: 409 }
      );
    }

    const resolvedAt = new Date();
    const updated = await db.depositCharge.update({
      where: { id: charge.id },
      data: {
        status: resolution === 'EJECUTADO' ? 'APROBADO' : 'RECHAZADO',
        resolution,
        resolutionNote: note || null,
        resolvedAt,
        ...(authorization ? { transactionId: authorization } : {}),
      },
    });

    await db.syncLog.create({
      data: {
        entity: 'PAYMENT',
        entityId: charge.id,
        action: 'UPDATE',
        status: 'PENDING',
        message:
          resolution === 'EJECUTADO'
            ? `[Cobro] Cobro ${charge.reference ?? charge.id} cerrado como EJECUTADO para reserva ${charge.reservation?.code ?? charge.reservationId}: autorización ${authorization}`
            : `[Cobro] Cobro ${charge.reference ?? charge.id} cerrado como NO_EJECUTADO para reserva ${charge.reservation?.code ?? charge.reservationId}: ${note}`,
        payload: {
          chargeId: charge.id,
          reference: charge.reference,
          reservationCode: charge.reservation?.code,
          amount: charge.amount,
          concept: charge.concept,
          resolution,
          authorization: authorization || null,
          note: note || null,
          previousStatus: 'PENDIENTE',
        },
      },
    });

    return Response.json({
      ok: true,
      message:
        resolution === 'EJECUTADO'
          ? 'Cobro cerrado como ejecutado. La reserva queda habilitada para nuevos cargos.'
          : 'Cobro cerrado como no ejecutado. La reserva queda habilitada para un nuevo intento.',
      charge: {
        id: updated.id,
        reference: updated.reference,
        status: updated.status,
        resolution: updated.resolution,
        resolutionNote: updated.resolutionNote,
        resolvedAt: updated.resolvedAt,
        authorization: updated.transactionId,
      },
    });
  } catch (err) {
    console.error('[payment/collect resolve error]:', err);
    return Response.json({ ok: false, error: 'Error interno del servidor. Intenta de nuevo.' }, { status: 500 });
  }
};
