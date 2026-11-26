import type { Prisma } from '@prisma/client';
import { db } from '#lib/server/db.js';
import { queryPaymentSession } from '#lib/server/placetopay.js';
import { revokeReplacedToken } from '#lib/server/tokenReplacement.js';

/** Vida de una sesión de PlacetoPay (25 min) más margen para el retorno. */
const RETURN_WINDOW_MS = 40 * 60 * 1000;

/** Marca de los logs que abren una sesión de tokenización (anteriores a `event`). */
const SESSION_START_PREFIX = '[Token] Sesión de nueva tokenización iniciada para reserva ';

interface SessionRef {
  requestId: string;
  createdAt: Date;
}

/**
 * Guarda el token de una sesión de tokenización sin cobro al volver del
 * checkout. No modifica el estado del pago ni de la reserva.
 *
 * El `requestId` no siempre llega: el checkout SPA puede devolver el
 * `returnUrl` sin parámetros. Por eso la reserva viaja en la ruta y, si falta
 * el identificador, se usa la última sesión de tokenización registrada para
 * esa reserva. En ambos casos la sesión se valida contra ese registro: no se
 * acepta un `requestId` ajeno ni el de una tokenización ya terminada.
 *
 * Devuelve la ruta a la que hay que redirigir (nunca lanza `redirect`).
 */
export async function completeResubscribeReturn(input: {
  reservationId: string;
  requestId?: string | null;
}): Promise<string> {
  const reservationId = (input.reservationId || '').trim();
  if (!reservationId) {
    return errorPath('Falta el identificador de la reserva de la tokenización.');
  }

  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: { payment: true },
  });

  if (!reservation) {
    return errorPath('La reserva de la tokenización ya no existe.');
  }

  const requestedId = (input.requestId || '').trim();
  const sessions = await findSessions(reservation.code, requestedId || undefined);

  if (!sessions.length) {
    return errorPath(
      requestedId
        ? 'La sesión de tokenización no corresponde a esta reserva o ya expiró.'
        : 'No se pudo identificar la sesión de tokenización. Vuelve a registrar la tarjeta de garantía.'
    );
  }

  // Sin `requestId` no hay forma de saber de qué pestaña viene el retorno. Con dos
  // sesiones abiertas para la misma reserva, quedarse con la más reciente atribuía
  // el retorno a una tokenización ajena: el falso positivo era un «aún no confirma»
  // con la tarjeta ya guardada, o el instrumento de la otra pestaña. Se falla cerrado.
  if (sessions.length > 1) {
    return errorPath(
      'Hay más de una tokenización reciente para esta reserva y el retorno llegó sin su identificador. Abre de nuevo el panel para verificar el medio de pago; si la tarjeta no aparece actualizada, vuelve a registrarla.'
    );
  }

  const session = sessions[0];

  const query = await querySessionWithRetry(session.requestId);

  if (!query.ok || !query.token) {
    const detail = query.ok
      ? 'La pasarela aún no confirma la tokenización. Recarga en unos segundos.'
      : query.message;
    return errorPath(detail);
  }

  // Un retorno viejo (otra pestaña, un reintento abandonado) no debe revertir
  // la tarjeta que se guardó después de abrir esa sesión.
  const previous = reservation.payment;
  if (
    previous?.token &&
    previous.token !== query.token &&
    previous.updatedAt > session.createdAt
  ) {
    return errorPath(
      'Ya hay una tarjeta más reciente registrada para esta reserva. Abre de nuevo el panel para verificar el medio de pago.'
    );
  }

  const token = query.token;
  const tokenFranchise = query.tokenFranchise || query.cardBrand || null;

  await db.payment.upsert({
    where: { reservationId: reservation.id },
    create: {
      reservationId: reservation.id,
      amount: reservation.totalAmount,
      status: 'PENDIENTE',
      gateway: 'PLACETOPAY',
      p2pStatusMessage:
        'Tarjeta de garantía registrada sin cobro inicial (tokenización administrativa)',
      cardBrand: query.cardBrand || '',
      cardLast4: query.cardLast4 || '',
      token,
      tokenStatus: 'ACTIVO',
      tokenValidUntil: query.tokenValidUntil || null,
      tokenFranchise,
    },
    update: {
      // Solo se reemplaza el instrumento; el estado del pago original no cambia.
      cardBrand: query.cardBrand || undefined,
      cardLast4: query.cardLast4 || undefined,
      token,
      tokenStatus: 'ACTIVO',
      tokenValidUntil: query.tokenValidUntil || undefined,
      tokenFranchise: tokenFranchise ?? undefined,
      p2pStatusMessage: 'Tarjeta de garantía actualizada mediante tokenización sin cobro',
    },
  });

  // Guardar el token nuevo no invalida el anterior en la pasarela: sin esta
  // revocación quedaban dos instrumentos vivos sobre la misma tarjeta. Va
  // después de persistir el nuevo para que un fallo de la pasarela no deje a la
  // reserva sin instrumento utilizable.
  await revokeReplacedToken({
    paymentId: reservation.payment?.id || reservation.id,
    reservationCode: reservation.code,
    previousToken: previous?.token,
    newToken: token,
    source: 'RETORNO',
  });

  await db.syncLog.create({
    data: {
      entity: 'PAYMENT',
      entityId: reservation.payment?.id || reservation.id,
      action: 'UPDATE',
      status: 'PENDING',
      message: `[Token] Tarjeta de garantía actualizada para reserva ${reservation.code}`,
      payload: {
        reservationCode: reservation.code,
        requestId: query.requestId || session.requestId,
        tokenPrefix: token.slice(0, 8),
        tokenFranchise,
        tokenValidUntil: query.tokenValidUntil,
        purpose: 'RETOKENIZACION',
      },
    },
  });

  return `/admin/reservas?token=actualizado&reserva=${encodeURIComponent(reservation.code)}`;
}

/** Ruta de error del panel, con el detalle ya codificado. */
function errorPath(detail: string): string {
  return `/admin/reservas?token=error&detalle=${encodeURIComponent(detail)}`;
}

/**
 * Sesiones de tokenización de la reserva dentro de la ventana de retorno, la más
 * reciente primero. Solo cuentan los logs de **creación** de sesión: los de cierre
 * también guardan un `requestId` y reutilizarlos reescribiría una tarjeta anterior.
 *
 * Si llega un `requestId`, además tiene que coincidir con el de esa reserva y se
 * pide una sola fila. Sin él se piden dos: sirven para detectar que el retorno es
 * ambiguo en lugar de elegir a ciegas la sesión más nueva.
 */
async function findSessions(
  reservationCode: string,
  requestId?: string
): Promise<SessionRef[]> {
  const filters: Prisma.SyncLogWhereInput[] = [
    {
      OR: [
        { message: { startsWith: SESSION_START_PREFIX } },
        { payload: { path: ['event'], equals: 'SESSION_CREATED' } },
      ],
    },
    { payload: { path: ['purpose'], equals: 'RETOKENIZACION' } },
    { payload: { path: ['reservationCode'], equals: reservationCode } },
  ];

  if (requestId) {
    filters.push({ payload: { path: ['requestId'], equals: requestId } });
  }

  const logs = await db.syncLog.findMany({
    where: {
      entity: 'PAYMENT',
      createdAt: { gte: new Date(Date.now() - RETURN_WINDOW_MS) },
      AND: filters,
    },
    orderBy: { createdAt: 'desc' },
    take: requestId ? 1 : 2,
  });

  return logs.flatMap((log) => {
    const payload = log.payload as { requestId?: unknown } | null;
    const recordedId = typeof payload?.requestId === 'string' ? payload.requestId.trim() : '';
    return recordedId ? [{ requestId: recordedId, createdAt: log.createdAt }] : [];
  });
}

/**
 * La consulta inmediata puede llegar antes de que la pasarela consolide el
 * instrumento: se reintenta en la misma petición antes de rendirse.
 */
async function querySessionWithRetry(requestId: string) {
  let query = await queryPaymentSession(requestId);

  for (let attempt = 0; attempt < 2 && query.ok && !query.token; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    query = await queryPaymentSession(requestId);
  }

  return query;
}
