import crypto from 'crypto';
import { ADMIN_SECRET, NODE_ENV, ADMIN_PASSWORD, DESKTOP_SYNC_TOKEN } from '$app/env/private';
import type { Cookies } from '@sveltejs/kit';

const COOKIE_NAME = 'dinamo_admin_session';

// Fallbacks SOLO para desarrollo local. Están publicadas en el repositorio,
// así que en producción jamás se usan: si falta la variable real, la
// autenticación correspondiente queda desactivada (fail closed) en lugar de
// caer en una credencial conocida por cualquiera que lea el código.
const DEFAULT_PASSWORD = 'DinamoAdmin2026!*';
const DEFAULT_SECRET = 'dinamo-default-secret-salt-2026';
const DEFAULT_SYNC_TOKEN = 'dinamo-desktop-sync-2026-secret-token';

const isProduction = NODE_ENV === 'production';

/** Advertencia única por proceso (evita inundar logs en serverless). */
function warnOnce(already: { done: boolean }, message: string): void {
	if (already.done) return;
	already.done = true;
	console.warn(message);
}
const warned = { secret: { done: false }, password: { done: false }, sync: { done: false } };

function getAdminSecret(): string | null {
	if (ADMIN_SECRET) return ADMIN_SECRET;
	if (!isProduction) return DEFAULT_SECRET;
	warnOnce(
		warned.secret,
		'[SECURITY] ADMIN_SECRET no está configurada: sesiones de administrador desactivadas (fail closed).'
	);
	return null;
}

export function getAdminPassword(): string | null {
	if (ADMIN_PASSWORD) return ADMIN_PASSWORD;
	if (!isProduction) return DEFAULT_PASSWORD;
	warnOnce(
		warned.password,
		'[SECURITY] ADMIN_PASSWORD no está configurada: login de administrador desactivado (fail closed).'
	);
	return null;
}

/**
 * true si el login puede funcionar en este entorno.
 * En producción exige ADMIN_PASSWORD y ADMIN_SECRET; en desarrollo siempre true.
 * El endpoint /api/admin/login responde 503 cuando devuelve false.
 */
export function isAuthConfigured(): boolean {
	if (!isProduction) return true;
	return Boolean(ADMIN_PASSWORD && ADMIN_SECRET);
}

/**
 * Valida la contraseña de administrador usando comparación en tiempo constante (anti-timing attacks).
 */
export function verifyAdminPassword(password: string): boolean {
	if (!password || typeof password !== 'string') return false;
	const expected = getAdminPassword();
	// Fail closed: sin contraseña configurada en producción, nadie entra.
	if (!expected) return false;
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
	const secret = getAdminSecret();
	if (!secret) {
		// Inalcanzable en la práctica: isAuthConfigured() ya bloquea el login antes.
		throw new Error('ADMIN_SECRET no está configurada: no se puede firmar la sesión.');
	}
	const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
	const payload = `admin:${expiresAt}`;
	const signature = crypto
		.createHmac('sha256', secret)
		.update(payload)
		.digest('hex');
	return `${payload}:${signature}`;
}

/**
 * Valida un token de sesión de administrador con verificación segura de longitud
 */
export function verifyAdminSessionToken(token: string | undefined): boolean {
	if (!token) return false;
	const secret = getAdminSecret();
	// Fail closed: sin ADMIN_SECRET no se valida ninguna cookie de sesión,
	// incluidas las firmadas con el secreto por defecto antiguamente publicado.
	if (!secret) return false;
	const parts = token.split(':');
	if (parts.length !== 3) return false;

	const [role, expiresStr, signature] = parts;
	if (role !== 'admin') return false;

	const expiresAt = Number(expiresStr);
	if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

	const payload = `${role}:${expiresStr}`;
	const expectedSignature = crypto
		.createHmac('sha256', secret)
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
	const expectedToken = DESKTOP_SYNC_TOKEN || (!isProduction ? DEFAULT_SYNC_TOKEN : null);
	if (!expectedToken) {
		// Fail closed: sin DESKTOP_SYNC_TOKEN en producción no hay sincronización.
		warnOnce(
			warned.sync,
			'[SECURITY] DESKTOP_SYNC_TOKEN no está configurada: sincronización del mostrador desactivada (fail closed).'
		);
		return false;
	}

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
		secure: NODE_ENV === 'production',
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
