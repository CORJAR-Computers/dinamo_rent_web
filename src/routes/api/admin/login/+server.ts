import { json, type RequestHandler } from '@sveltejs/kit';
import { verifyAdminPassword, setAdminSessionCookie } from '$lib/server/adminAuth';

interface AttemptRecord {
	count: number;
	lockoutUntil: number;
}

const loginAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutos de bloqueo

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	let clientIp = '127.0.0.1';
	try {
		clientIp = getClientAddress();
	} catch {
		// Fallback si no está disponible
	}

	const now = Date.now();
	const record = loginAttempts.get(clientIp);

	// Verificar si el IP está bloqueado por fuerza bruta
	if (record && record.lockoutUntil > now) {
		const remainingSecs = Math.ceil((record.lockoutUntil - now) / 1000);
		return json(
			{
				ok: false,
				message: `Demasiados intentos fallidos. Acceso bloqueado temporalmente. Intenta nuevamente en ${remainingSecs} segundos.`
			},
			{ status: 429 }
		);
	}

	try {
		const body = await request.json().catch(() => ({}));
		const { password } = body || {};

		if (!password || typeof password !== 'string') {
			return json({ ok: false, message: 'La contraseña es requerida.' }, { status: 400 });
		}

		const isValid = verifyAdminPassword(password);

		if (!isValid) {
			const current = loginAttempts.get(clientIp) || { count: 0, lockoutUntil: 0 };
			current.count += 1;

			if (current.count >= MAX_ATTEMPTS) {
				current.lockoutUntil = now + LOCKOUT_MS;
				loginAttempts.set(clientIp, current);
				return json(
					{
						ok: false,
						message: 'Demasiados intentos fallidos. Has sido bloqueado por 15 minutos por seguridad.'
					},
					{ status: 429 }
				);
			}

			loginAttempts.set(clientIp, current);
			const remaining = MAX_ATTEMPTS - current.count;
			return json(
				{
					ok: false,
					message: `Contraseña incorrecta. Te quedan ${remaining} ${remaining === 1 ? 'intento' : 'intentos'}.`
				},
				{ status: 401 }
			);
		}

		// Login exitoso: limpiar registro de intentos y asignar cookie
		loginAttempts.delete(clientIp);
		setAdminSessionCookie(cookies);

		return json({
			ok: true,
			message: 'Sesión iniciada correctamente.'
		});
	} catch (err) {
		console.error('Error en /api/admin/login:', err);
		return json({ ok: false, message: 'Error en el servidor.' }, { status: 500 });
	}
};
