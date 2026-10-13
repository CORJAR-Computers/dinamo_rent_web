import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

/**
 * Valores por defecto publicados históricamente en el repositorio.
 * El comportamiento fail-closed exige que en producción se rechacen.
 */
const DEFAULT_PASSWORD = 'DinamoAdmin2026!*';
const DEFAULT_SECRET = 'dinamo-default-secret-salt-2026';
const DEFAULT_SYNC_TOKEN = 'dinamo-desktop-sync-2026-secret-token';

/** Estado mutable que sustituye a `$app/env/private` dentro de los tests. */
const envState = vi.hoisted(() => ({
	NODE_ENV: 'development',
	ADMIN_SECRET: '',
	ADMIN_PASSWORD: '',
	DESKTOP_SYNC_TOKEN: ''
}));

vi.mock('$app/env/private', () => ({
	get NODE_ENV() {
		return envState.NODE_ENV;
	},
	get ADMIN_SECRET() {
		return envState.ADMIN_SECRET;
	},
	get ADMIN_PASSWORD() {
		return envState.ADMIN_PASSWORD;
	},
	get DESKTOP_SYNC_TOKEN() {
		return envState.DESKTOP_SYNC_TOKEN;
	}
}));

type Auth = typeof import('../src/lib/server/adminAuth.js');

/**
 * Recarga el módulo con un entorno dado. Es imprescindible recargar porque
 * `adminAuth` captura `isProduction` al evaluar el módulo.
 */
async function loadAuth(overrides: Partial<typeof envState> = {}): Promise<Auth> {
	Object.assign(
		envState,
		{ NODE_ENV: 'development', ADMIN_SECRET: '', ADMIN_PASSWORD: '', DESKTOP_SYNC_TOKEN: '' },
		overrides
	);
	vi.resetModules();
	return await import('../src/lib/server/adminAuth.js');
}

/** Fabrica una sesión con la estructura `rol:expiración:firma` usando un secreto dado. */
function forgeSession(role: string, expiresAt: number, secret: string): string {
	const payload = `${role}:${expiresAt}`;
	const signature = createHmac('sha256', secret).update(payload).digest('hex');
	return `${payload}:${signature}`;
}

function bearer(token: string): Request {
	return new Request('http://localhost/', { headers: { authorization: `Bearer ${token}` } });
}

function cookiesWith(token: string | undefined): Cookies {
	return { get: () => token } as unknown as Cookies;
}

describe('adminAuth en desarrollo (fallbacks locales)', () => {
	it('la autenticación está configurada y usa la contraseña por defecto', async () => {
		const auth = await loadAuth();
		expect(auth.isAuthConfigured()).toBe(true);
		expect(auth.getAdminPassword()).toBe(DEFAULT_PASSWORD);
		expect(auth.verifyAdminPassword(DEFAULT_PASSWORD)).toBe(true);
		expect(auth.verifyAdminPassword('contraseña-equivocada')).toBe(false);
		expect(auth.verifyAdminPassword('')).toBe(false);
	});

	it('genera sesiones válidas y rechaza tokens alterados, caducados o de otro rol', async () => {
		const auth = await loadAuth();
		const token = auth.generateAdminSessionToken();
		expect(auth.verifyAdminSessionToken(token)).toBe(true);

		const lastChar = token.endsWith('a') ? 'b' : 'a';
		expect(auth.verifyAdminSessionToken(token.slice(0, -1) + lastChar)).toBe(false);
		expect(auth.verifyAdminSessionToken(forgeSession('admin', Date.now() - 1000, DEFAULT_SECRET))).toBe(
			false
		);
		expect(auth.verifyAdminSessionToken(forgeSession('user', Date.now() + 60_000, DEFAULT_SECRET))).toBe(
			false
		);
		expect(auth.verifyAdminSessionToken('token-basura')).toBe(false);
		expect(auth.verifyAdminSessionToken(undefined)).toBe(false);

		expect(auth.isUserAdmin(cookiesWith(token))).toBe(true);
		expect(auth.isUserAdmin(cookiesWith(undefined))).toBe(false);
	});

	it('valida el token de sincronización del mostrador (Bearer y cabecera propia)', async () => {
		const auth = await loadAuth();
		expect(auth.verifySyncToken(bearer(DEFAULT_SYNC_TOKEN))).toBe(true);
		expect(
			auth.verifySyncToken(
				new Request('http://localhost/', { headers: { 'x-sync-token': DEFAULT_SYNC_TOKEN } })
			)
		).toBe(true);
		expect(auth.verifySyncToken(bearer('token-incorrecto'))).toBe(false);
		expect(auth.verifySyncToken(new Request('http://localhost/'))).toBe(false);
	});
});

describe('adminAuth en producción sin variables (fail closed)', () => {
	it('desactiva login, sesiones y sincronización, y advierte en el log', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const auth = await loadAuth({ NODE_ENV: 'production' });

		expect(auth.isAuthConfigured()).toBe(false);
		expect(auth.getAdminPassword()).toBeNull();
		// La contraseña histórica publicada ya no abre nada en producción.
		expect(auth.verifyAdminPassword(DEFAULT_PASSWORD)).toBe(false);
		expect(auth.verifyAdminPassword('cualquier-intento')).toBe(false);

		// No se puede firmar sesiones sin ADMIN_SECRET.
		expect(() => auth.generateAdminSessionToken()).toThrow();

		// Cookie forjada con el secreto antiguamente público → rechazada.
		const forged = forgeSession('admin', Date.now() + 60_000, DEFAULT_SECRET);
		expect(auth.verifyAdminSessionToken(forged)).toBe(false);
		expect(auth.verifyAdminSessionToken(undefined)).toBe(false);
		expect(auth.isUserAdmin(cookiesWith(forged))).toBe(false);

		// El token de sync por defecto queda rechazado.
		expect(auth.verifySyncToken(bearer(DEFAULT_SYNC_TOKEN))).toBe(false);

		expect(warn).toHaveBeenCalledWith(expect.stringContaining('[SECURITY]'));
		warn.mockRestore();
	});
});

describe('adminAuth en producción con variables configuradas', () => {
	it('autentica con las variables reales y sigue rechazando el material por defecto', async () => {
		const auth = await loadAuth({
			NODE_ENV: 'production',
			ADMIN_PASSWORD: 'Contraseña-Privada-2026',
			ADMIN_SECRET: 'secreto-privado-de-sesion-2026',
			DESKTOP_SYNC_TOKEN: 'sync-privado-2026'
		});

		expect(auth.isAuthConfigured()).toBe(true);
		expect(auth.verifyAdminPassword('Contraseña-Privada-2026')).toBe(true);
		expect(auth.verifyAdminPassword(DEFAULT_PASSWORD)).toBe(false);
		expect(auth.verifyAdminPassword('')).toBe(false);

		const token = auth.generateAdminSessionToken();
		expect(auth.verifyAdminSessionToken(token)).toBe(true);
		expect(auth.isUserAdmin(cookiesWith(token))).toBe(true);
		// Sesión firmada con el secreto público antiguo → rechazada.
		expect(auth.verifyAdminSessionToken(forgeSession('admin', Date.now() + 60_000, DEFAULT_SECRET))).toBe(
			false
		);

		expect(auth.verifySyncToken(bearer('sync-privado-2026'))).toBe(true);
		expect(auth.verifySyncToken(bearer(DEFAULT_SYNC_TOKEN))).toBe(false);
	});
});
