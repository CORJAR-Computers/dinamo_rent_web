import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

const DEFAULT_PASSWORD = 'DinamoAdmin2026!*';

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

type PostCtx = {
	request: Request;
	cookies: Cookies;
	getClientAddress: () => string;
};

/** El route handler solo necesita estos tres campos; el resto del contexto no se usa. */
type PostHandler = (ctx: PostCtx) => Promise<Response>;
type LoginRoute = { POST: PostHandler };

async function loadLogin(overrides: Partial<typeof envState> = {}): Promise<LoginRoute & Auth> {
	Object.assign(
		envState,
		{ NODE_ENV: 'development', ADMIN_SECRET: '', ADMIN_PASSWORD: '', DESKTOP_SYNC_TOKEN: '' },
		overrides
	);
	vi.resetModules();
	const mod = (await import('../src/routes/api/admin/login/+server.js')) as unknown as LoginRoute;
	const auth = await import('../src/lib/server/adminAuth.js');
	return { POST: mod.POST, ...auth };
}

function post(route: LoginRoute, password?: string, ip = '10.0.0.1'): Promise<Response> {
	const request = new Request('http://localhost/api/admin/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(password === undefined ? {} : { password })
	});
	const cookies = { set: vi.fn(), get: vi.fn(), delete: vi.fn() } as unknown as Cookies;
	return route.POST({
		request,
		cookies,
		getClientAddress: () => ip
	});
}

/** Igual que `post` pero también devuelve la referencia a cookies para asertarla. */
function postWithCookies(
	route: LoginRoute,
	password?: string,
	ip = '10.0.0.1'
): { response: Promise<Response>; cookies: ReturnType<typeof vi.fn> } {
	const request = new Request('http://localhost/api/admin/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(password === undefined ? {} : { password })
	});
	const set = vi.fn();
	const cookies = { set, get: vi.fn(), delete: vi.fn() } as unknown as Cookies;
	const response = route.POST({ request, cookies, getClientAddress: () => ip });
	return { response, cookies: set as unknown as ReturnType<typeof vi.fn> };
}

describe('POST /api/admin/login', () => {
	it('responde 503 en producción sin ADMIN_PASSWORD/ADMIN_SECRET (fail closed)', async () => {
		const route = await loadLogin({ NODE_ENV: 'production' });
		// Ni siquiera con la contraseña histórica correcta se autentica.
		const res = await post(route, DEFAULT_PASSWORD);
		expect(res.status).toBe(503);
		const body = (await res.json()) as { ok: boolean; message: string };
		expect(body.ok).toBe(false);
		expect(body.message).toContain('no configurada');
	});

	it('responde 400 si falta la contraseña', async () => {
		const route = await loadLogin();
		const res = await post(route);
		expect(res.status).toBe(400);
	});

	it('responde 401 con la contraseña incorrecta', async () => {
		const route = await loadLogin({ ADMIN_PASSWORD: 'clave-correcta' });
		const res = await post(route, 'clave-mala', '10.0.0.2');
		expect(res.status).toBe(401);
		const body = (await res.json()) as { ok: boolean; message: string };
		expect(body.ok).toBe(false);
		expect(body.message).toContain('Contraseña incorrecta');
		expect(body.message).toContain('quedan');
	});

	it('responde 200 y establece la cookie de sesión con la contraseña correcta', async () => {
		const route = await loadLogin({ ADMIN_PASSWORD: 'clave-correcta', ADMIN_SECRET: 'secreto-sesion' });
		const { response, cookies } = postWithCookies(route, 'clave-correcta', '10.0.0.3');
		const res = await response;

		expect(res.status).toBe(200);
		expect(cookies).toHaveBeenCalledTimes(1);
		const [name, token, options] = (cookies as unknown as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string, string, Record<string, unknown>];
		expect(name).toBe('dinamo_admin_session');
		expect(typeof token).toBe('string');
		expect(options).toMatchObject({ httpOnly: true, path: '/', sameSite: 'lax' });

		// La cookie emitida valida como sesión de administrador con el mismo entorno.
		expect(route.verifyAdminSessionToken(token)).toBe(true);
	});

	it('bloquea 15 minutos tras 5 intentos fallidos, incluso con la contraseña correcta', async () => {
		const route = await loadLogin({ ADMIN_PASSWORD: 'clave-correcta', ADMIN_SECRET: 'secreto-sesion' });
		const ip = '10.9.9.9';

		for (let i = 1; i <= 4; i++) {
			const res = await post(route, 'clave-mala', ip);
			expect(res.status).toBe(401);
		}

		const quinto = await post(route, 'clave-mala', ip);
		expect(quinto.status).toBe(429);

		// Con la contraseña correcta pero dentro de la ventana de bloqueo → sigue 429.
		const bloqueado = await post(route, 'clave-correcta', ip);
		expect(bloqueado.status).toBe(429);
		const body = (await bloqueado.json()) as { message: string };
		expect(body.message).toContain('bloqueado');

		// Otra IP no está afectada por el bloqueo de esta.
		const otraIp = await post(route, 'clave-correcta', '10.8.8.8');
		expect(otraIp.status).toBe(200);
	});

	it('limpia el registro de intentos tras un login exitoso', async () => {
		const route = await loadLogin({ ADMIN_PASSWORD: 'clave-correcta', ADMIN_SECRET: 'secreto-sesion' });
		const ip = '10.7.7.7';

		await post(route, 'clave-mala', ip);
		await post(route, 'clave-mala', ip);
		const ok = await post(route, 'clave-correcta', ip);
		expect(ok.status).toBe(200);

		// Dos fallos más tras el éxito: vuelven a contar desde cero (401, no 429).
		const fallo1 = await post(route, 'clave-mala', ip);
		expect(fallo1.status).toBe(401);
		const fallo2 = await post(route, 'clave-mala', ip);
		expect(fallo2.status).toBe(401);
	});
});
