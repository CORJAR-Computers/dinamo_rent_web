import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

const COOKIE_NAME = 'dinamo_admin_session';
const DEFAULT_PASSWORD = 'DinamoAdmin2026!*';
const DEFAULT_SECRET = 'dinamo-default-secret-salt-2026';

function getAdminSecret(): string {
	return env.ADMIN_SECRET || DEFAULT_SECRET;
}

export function getAdminPassword(): string {
	return env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
}

/**
 * Genera un token firmado con expiración (24 horas)
 */
export function generateAdminSessionToken(): string {
	const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
	const payload = `admin:${expiresAt}`;
	const signature = crypto
		.createHmac('sha256', getAdminSecret())
		.update(payload)
		.digest('hex');
	return `${payload}:${signature}`;
}

/**
 * Valida un token de sesión de administrador
 */
export function verifyAdminSessionToken(token: string | undefined): boolean {
	if (!token) return false;
	const parts = token.split(':');
	if (parts.length !== 3) return false;

	const [role, expiresStr, signature] = parts;
	if (role !== 'admin') return false;

	const expiresAt = Number(expiresStr);
	if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

	const payload = `${role}:${expiresStr}`;
	const expectedSignature = crypto
		.createHmac('sha256', getAdminSecret())
		.update(payload)
		.digest('hex');

	return crypto.timingSafeEqual(
		Buffer.from(signature, 'hex'),
		Buffer.from(expectedSignature, 'hex')
	);
}

/**
 * Verifica si las cookies entrantes tienen una sesión de administrador válida
 */
export function isUserAdmin(cookies: Cookies): boolean {
	const sessionToken = cookies.get(COOKIE_NAME);
	return verifyAdminSessionToken(sessionToken);
}

/**
 * Establece la cookie de sesión de administrador
 */
export function setAdminSessionCookie(cookies: Cookies): void {
	const token = generateAdminSessionToken();
	cookies.set(COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: env.NODE_ENV === 'production',
		maxAge: 24 * 60 * 60 // 1 día
	});
}

/**
 * Elimina la cookie de sesión de administrador
 */
export function clearAdminSessionCookie(cookies: Cookies): void {
	cookies.delete(COOKIE_NAME, {
		path: '/'
	});
}
