import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

const COOKIE_NAME = 'dinamo_admin_session';
const DEFAULT_PASSWORD = 'DinamoAdmin2026!*';
const DEFAULT_SECRET = 'dinamo-default-secret-salt-2026';

function getAdminSecret(): string {
	const secret = env.ADMIN_SECRET;
	if (!secret) {
		if (env.NODE_ENV === 'production') {
			console.warn('[SECURITY WARNING] ADMIN_SECRET no está configurada en producción. Usando valor temporal.');
		}
		return DEFAULT_SECRET;
	}
	return secret;
}

export function getAdminPassword(): string {
	const pass = env.ADMIN_PASSWORD;
	if (!pass) {
		if (env.NODE_ENV === 'production') {
			console.warn('[SECURITY WARNING] ADMIN_PASSWORD no está configurada en producción. Usando valor temporal.');
		}
		return DEFAULT_PASSWORD;
	}
	return pass;
}

/**
 * Valida la contraseña de administrador usando comparación en tiempo constante (anti-timing attacks).
 */
export function verifyAdminPassword(password: string): boolean {
	if (!password || typeof password !== 'string') return false;
	const expected = getAdminPassword();
	const passBuf = Buffer.from(password, 'utf-8');
	const expBuf = Buffer.from(expected, 'utf-8');

	if (passBuf.length !== expBuf.length) {
		// Ejecuta comparación dummy con el mismo buffer para mitigar análisis de tiempos
		crypto.timingSafeEqual(expBuf, expBuf);
		return false;
	}
	return crypto.timingSafeEqual(passBuf, expBuf);
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
 * Valida un token de sesión de administrador con verificación segura de longitud
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

	try {
		const sigBuf = Buffer.from(signature, 'hex');
		const expBuf = Buffer.from(expectedSignature, 'hex');

		if (sigBuf.length !== expBuf.length || sigBuf.length === 0) {
			return false;
		}

		return crypto.timingSafeEqual(sigBuf, expBuf);
	} catch {
		return false;
	}
}

/**
 * Verifica si las cookies entrantes tienen una sesión de administrador válida
 */
export function isUserAdmin(cookies: Cookies): boolean {
	const sessionToken = cookies.get(COOKIE_NAME);
	return verifyAdminSessionToken(sessionToken);
}

/**
 * Valida el token de sincronización del mostrador (Firebird ERP) contra DESKTOP_SYNC_TOKEN
 */
export function verifySyncToken(request: Request): boolean {
	const expectedToken = env.DESKTOP_SYNC_TOKEN || 'dinamo-desktop-sync-2026-secret-token';
	if (!expectedToken) return false;

	const authHeader = request.headers.get('authorization') || '';
	const customHeader = request.headers.get('x-sync-token') || '';

	let provided = '';
	if (authHeader.startsWith('Bearer ')) {
		provided = authHeader.slice(7).trim();
	} else if (customHeader) {
		provided = customHeader.trim();
	}

	if (!provided) return false;

	const provBuf = Buffer.from(provided, 'utf-8');
	const expBuf = Buffer.from(expectedToken, 'utf-8');

	if (provBuf.length !== expBuf.length) {
		crypto.timingSafeEqual(expBuf, expBuf);
		return false;
	}

	return crypto.timingSafeEqual(provBuf, expBuf);
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
