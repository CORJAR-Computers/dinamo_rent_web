import { type RequestEvent } from '@sveltejs/kit';
import { db } from '#lib/server/db.js';
import { isUserAdmin } from '#lib/server/adminAuth.js';
import { currentTermsConsent } from '#lib/server/termsConsent.js';
import { requestIp } from '#lib/server/clientIp.js';
import { MANUAL_CONSENT_MIN } from '#lib/data/terms.js';

/**
 * Registro auditado del consentimiento de una reserva anterior al control.
 *
 * `/api/payments/collect` exige evidencia de aceptación de términos; esta ruta
 * es la única forma de dársela a una reserva que no la tiene. La versión y el
 * hash salen del servidor, el consentimiento ya registrado nunca se sobrescribe
 * y cada registro deja una entrada en `SyncLog` con responsable y soporte.
 *
 * `termsAcceptedIp` guarda la IP de quien registra la aceptación: el cliente en
 * el checkout, el administrador aquí. `termsAcceptedBy` (nulo en el checkout)
 * distingue ambos casos.
 */
export const POST = async ({ params, request, cookies, getClientAddress }: RequestEvent) => {
  if (!isUserAdmin(cookies)) {
    return Response.json(
      { ok: false, error: 'No autorizado. Se requiere sesión de administrador.' },
      { status: 401 }
    );
  }

  const id = String(params.id || '').trim();
  if (!id) {
    return Response.json({ ok: false, error: 'Identificador de reserva requerido' }, { status: 400 });
  }

  let payload: { registeredBy?: unknown; note?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
  }

  const registeredBy = cleanText(payload?.registeredBy, 80);
  const note = cleanText(payload?.note, 300);

  if (registeredBy.length < MANUAL_CONSENT_MIN.registeredBy) {
    return Response.json(
      {
        ok: false,
        error: 'Indica quién registra el consentimiento (nombre o usuario del administrador).',
      },
      { status: 400 }
    );
  }

  if (note.length < MANUAL_CONSENT_MIN.note) {
    return Response.json(
      {
        ok: false,
        error: `Describe el soporte del consentimiento (contrato firmado, mensaje del cliente, acta de entrega…). Mínimo ${MANUAL_CONSENT_MIN.note} caracteres.`,
      },
      { status: 400 }
    );
  }

  const consent = currentTermsConsent();
  const acceptedAt = new Date();
  const ip = requestIp({ request, getClientAddress });

  try {
    const reservation = await db.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        customerName: true,
        termsVersion: true,
        termsHash: true,
        termsAcceptedAt: true,
        termsAcceptedIp: true,
        termsAcceptedBy: true,
      },
    });

    if (!reservation) {
      return Response.json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    if (reservation.termsHash || reservation.termsAcceptedAt) {
      return alreadyRecorded(
        'La reserva ya tiene un consentimiento registrado y no se puede sobrescribir. Si la evidencia es errónea, déjalo constancia en las notas de la reserva.',
        {
          version: reservation.termsVersion,
          hash: reservation.termsHash,
          acceptedAt: reservation.termsAcceptedAt,
          ip: reservation.termsAcceptedIp,
          registeredBy: reservation.termsAcceptedBy,
        }
      );
    }

    // La condición viaja en la misma escritura: si dos administradores registran
    // a la vez, solo el primero deja evidencia y el otro recibe 409.
    const written = await db.reservation.updateMany({
      where: { id: reservation.id, termsHash: null, termsAcceptedAt: null },
      data: {
        termsVersion: consent.version,
        termsHash: consent.hash,
        termsAcceptedAt: acceptedAt,
        termsAcceptedIp: ip,
        termsAcceptedBy: registeredBy,
        termsAcceptanceNote: note,
      },
    });

    if (written.count === 0) {
      return alreadyRecorded(
        'Otro registro completó el consentimiento de esta reserva mientras se procesaba.'
      );
    }

    const log = await db.syncLog.create({
      data: {
        entity: 'RESERVATION',
        entityId: reservation.id,
        action: 'UPDATE',
        status: 'PENDING',
        message: `[Consentimiento] Registro manual de Términos v${consent.version} para reserva ${reservation.code} (${reservation.customerName}): ${registeredBy} — ${note}`,
        payload: {
          reservationCode: reservation.code,
          registeredBy,
          note,
          version: consent.version,
          hash: consent.hash,
          acceptedAt: acceptedAt.toISOString(),
          ip,
          previous: {
            termsVersion: reservation.termsVersion,
            termsHash: reservation.termsHash,
            termsAcceptedAt: reservation.termsAcceptedAt,
          },
        },
      },
    });

    return Response.json({
      ok: true,
      message: `Consentimiento v${consent.version} registrado para la reserva ${reservation.code}. La reserva ya admite cobros con token.`,
      consent: {
        version: consent.version,
        hash: consent.hash,
        acceptedAt,
        ip,
        registeredBy,
        note,
        syncLogId: log.id,
      },
    });
  } catch (err) {
    console.error('[reservations/:id/terms-consent error]:', err);
    return Response.json(
      { ok: false, error: 'Error interno del servidor. Intenta de nuevo.' },
      { status: 500 }
    );
  }
};

/** El consentimiento ya existe y es inmutable, sea previo o simultáneo. */
function alreadyRecorded(error: string, consent?: Record<string, unknown>): Response {
  return Response.json(
    { ok: false, code: 'CONSENT_ALREADY_RECORDED', error, ...(consent ? { consent } : {}) },
    { status: 409 }
  );
}

/** Texto de auditoría: sin saltos de línea, recortado y con longitud acotada. */
function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
