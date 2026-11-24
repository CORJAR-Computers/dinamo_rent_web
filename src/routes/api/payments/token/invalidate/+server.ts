import { type RequestEvent } from '@sveltejs/kit';
import { db } from '#lib/server/db.js';
import { isUserAdmin } from '#lib/server/adminAuth.js';
import { invalidateToken } from '#lib/server/placetopay.js';

const DEFAULT_REASON = 'Cancelación de suscripción solicitada por administración';

/**
 * Cancelación de la suscripción / invalidación del token de garantía.
 *
 * Guía de Certificación de Suscripción con WebCheckout (§8): el establecimiento
 * debe poder dar de baja el instrumento tokenizado cuando termina el contrato,
 * el cliente lo solicita o la tarjeta deja de ser utilizable. La invalidación se
 * ejecuta en la pasarela y el resultado queda reflejado en el panel (estado
 * CANCELADO) y registrado en SyncLog para auditoría.
 */
export const POST = async ({ request, cookies }: RequestEvent) => {
	if (!isUserAdmin(cookies)) {
		return Response.json(
			{ ok: false, error: 'No autorizado. Se requiere sesión de administrador.' },
			{ status: 401 }
		);
	}

	try {
		const body = await request.json().catch(() => null);
		const reservationId = typeof body?.reservationId === 'string' ? body.reservationId : '';

		if (!reservationId) {
			return Response.json({ ok: false, error: 'reservationId es obligatorio' }, { status: 400 });
		}

		const reservation = await db.reservation.findUnique({
			where: { id: reservationId },
			include: { payment: true },
		});

		if (!reservation) {
			return Response.json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });
		}

		const payment = reservation.payment;
		if (!payment?.token) {
			return Response.json(
				{ ok: false, error: 'Esta reserva no cuenta con una tarjeta tokenizada que cancelar.' },
				{ status: 400 }
			);
		}

		if (payment.tokenStatus === 'CANCELADO') {
			return Response.json(
				{ ok: false, error: 'La suscripción de esta reserva ya fue cancelada previamente.' },
				{ status: 400 }
			);
		}

		const reason =
			(typeof body.reason === 'string' && body.reason.trim().slice(0, 200)) || DEFAULT_REASON;

		const result = await invalidateToken(payment.token, reason);

		if (!result.ok) {
			await db.syncLog.create({
				data: {
					entity: 'PAYMENT',
					entityId: payment.id,
					action: 'UPDATE',
					status: 'FAILED',
					message: `[Token] Falló la cancelación de la suscripción de la reserva ${reservation.code}: ${result.message}`,
					payload: {
						reservationCode: reservation.code,
						reason,
						invalidated: false,
						gatewayMessage: result.message,
					},
				},
			});

			return Response.json(
				{ ok: false, error: `La pasarela no confirmó la cancelación: ${result.message}` },
				{ status: 502 }
			);
		}

		await db.$transaction([
			db.payment.update({
				where: { id: payment.id },
				data: {
					tokenStatus: 'CANCELADO',
					p2pStatusMessage: `Token invalidado: ${reason}`,
				},
			}),
			db.syncLog.create({
				data: {
					entity: 'PAYMENT',
					entityId: payment.id,
					action: 'UPDATE',
					status: 'PENDING',
					message: `[Token] Suscripción cancelada y token invalidado para la reserva ${reservation.code}: ${reason}`,
					payload: {
						reservationCode: reservation.code,
						reason,
						invalidated: true,
						gatewayMessage: result.message,
					},
				},
			}),
		]);

		return Response.json({
			ok: true,
			message: `Suscripción cancelada y token invalidado. ${result.message}`,
			tokenStatus: 'CANCELADO',
		});
	} catch (err) {
		console.error('[payment/token/invalidate error]:', err);
		return Response.json(
			{ ok: false, error: 'Error interno del servidor. Intenta de nuevo.' },
			{ status: 500 }
		);
	}
};
