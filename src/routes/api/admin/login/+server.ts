import { type RequestHandler } from '@sveltejs/kit';
import { verifyAdminPassword, setAdminSessionCookie, isAuthConfigured } from '#lib/server/adminAuth.js';
import { checkRateLimit, resetRateLimit } from '#lib/server/rateLimit.js';

// Intentos por IP contados en la base de datos: 5 intentos por ventana de 15
// minutos. Antes era un Map en memoria que se reiniciaba con cada instancia
// serverless nueva, así que en producción el bloqueo era evitable.
const LOGIN_RATE_LIMIT = {
	endpointKey: 'admin-login',
	windowMs: 15 * 60 * 1000,
	maxRequests: 5
};

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	// Fail closed: en producción sin ADMIN_PASSWORD/ADMIN_SECRET no se intenta
	// verificar ninguna contraseña (evita además contar intentos de un despliegue
	// mal configurado). Ver adminAuth.isAuthConfigured().
	if (!isAuthConfigured()) {
		return Response.json(
			{
				ok: false,
				message: 'Autenticación no configurada en el servidor. Contacta al administrador.'
			},
			{ status: 503 }
		);
	}

	let clientIp = '127.0.0.1';
	try {
		clientIp = getClientAddress();
	} catch {
		// Fallback si no está disponible
	}

	// Cada intento (acertado o no) consume cupo; el acierto lo borra más abajo.
	const rateLimit = await checkRateLimit(clientIp, LOGIN_RATE_LIMIT);

	// Verificar si el IP está bloqueado por fuerza bruta
	if (!rateLimit.allowed) {
		return Response.json(
			{
				ok: false,
				message: `Demasiados intentos fallidos. Acceso bloqueado temporalmente. Intenta nuevamente en ${rateLimit.retryAfterSeconds} segundos.`
			},
			{
				status: 429,
				headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) }
			}
		);
	}

	try {
		const body = await request.json().catch(() => ({}));
		const { password } = body || {};

		if (!password || typeof password !== 'string') {
			return Response.json({ ok: false, message: 'La contraseña es requerida.' }, { status: 400 });
		}

		const isValid = verifyAdminPassword(password);

		if (!isValid) {
			if (rateLimit.remaining <= 0) {
				return Response.json(
					{
						ok: false,
						message: 'Demasiados intentos fallidos. Has sido bloqueado por 15 minutos por seguridad.'
					},
					{
						status: 429,
						headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) }
					}
				);
			}

			const remaining = rateLimit.remaining;
			return Response.json(
				{
					ok: false,
					message: `Contraseña incorrecta. Te quedan ${remaining} ${remaining === 1 ? 'intento' : 'intentos'}.`
				},
				{ status: 401 }
			);
		}

		// Login exitoso: limpiar el contador de intentos y asignar cookie
		await resetRateLimit(clientIp, LOGIN_RATE_LIMIT);
		setAdminSessionCookie(cookies);

		return Response.json({
			ok: true,
			message: 'Sesión iniciada correctamente.'
		});
	} catch (err) {
		console.error('Error en /api/admin/login:', err);
		return Response.json({ ok: false, message: 'Error en el servidor.' }, { status: 500 });
	}
};
