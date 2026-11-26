import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cron diario (`/api/cron/p2p-check-pending`): además de sondear los pagos
 * PENDIENTE, marca EXPIRADO todo token cuya `tokenValidUntil` ya pasó, con su
 * SyncLog, para que el estado no dependa de que alguien intente cobrar.
 *
 * `isTokenExpired` es la implementación real; solo se sustituyen la base de
 * datos y la llamada HTTP a la pasarela.
 */

type Obj = Record<string, unknown>;

const state = vi.hoisted(() => ({
	candidates: [] as Obj[],
	findManyArgs: [] as Obj[],
	paymentUpdates: [] as Obj[],
	syncLogs: [] as Obj[],
	queryCalls: [] as string[]
}));

vi.mock('#lib/server/placetopay.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/placetopay.js')>();
	return {
		...actual,
		queryPaymentSession: async (requestId: string) => {
			state.queryCalls.push(requestId);
			return { ok: true, requestId, status: 'PENDING', message: 'Sin veredicto' };
		}
	};
});

vi.mock('#lib/server/db.js', () => ({
	db: {
		payment: {
			findMany: async (args: Obj) => {
				state.findManyArgs.push(args);
				// La primera consulta del cron es la de vigencia de tokens; la
				// segunda, los pagos PENDIENTE (que aquí quedan vacíos).
				const where = args.where as Obj;
				return where.tokenValidUntil ? state.candidates : [];
			},
			update: async (args: Obj) => {
				state.paymentUpdates.push(args);
				return { id: 'pay_1', ...(args.data as Obj) };
			}
		},
		syncLog: {
			create: async (args: Obj) => {
				state.syncLogs.push(args);
				return { id: 'log_1', ...(args.data as Obj) };
			}
		},
		$transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops)
	}
}));

const { GET: cron } = (await import(
	'../src/routes/api/cron/p2p-check-pending/+server.js'
)) as unknown as {
	GET: (ctx: { request: Request; url: URL }) => Promise<Response>;
};

function run(query = '?test=true', init?: RequestInit): Promise<Response> {
	const url = new URL(`http://localhost/api/cron/p2p-check-pending${query}`);
	return cron({ request: new Request(url, init), url });
}

function bearer(secret: string): RequestInit {
	return { headers: { authorization: `Bearer ${secret}` } };
}

function payment(overrides: Obj): Obj {
	return {
		id: 'pay_1',
		token: 'tok_real_9f8e7d6c',
		tokenStatus: 'ACTIVO',
		tokenValidUntil: '2999-12-31',
		reservation: { code: 'DIN-2026-0001' },
		...overrides
	};
}

describe('cron diario — vigencia de tokens de garantía', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		// Entorno no productivo: `?test=true` es el atajo de prueba local.
		vi.stubEnv('NODE_ENV', 'test');
		state.candidates = [];
		state.findManyArgs = [];
		state.paymentUpdates = [];
		state.syncLogs = [];
		state.queryCalls = [];
	});

	it('marca EXPIRADO un token vencido y registra el SyncLog sin llamar a la pasarela', async () => {
		state.candidates = [
			payment({ tokenValidUntil: '2020-01-31' }),
			payment({ id: 'pay_2', tokenValidUntil: '2999-12-31' })
		];

		const res = await run();
		const body = (await res.json()) as Obj;

		expect(res.status).toBe(200);
		expect(body.expiredTokenCount).toBe(1);
		expect(body.expiredTokens).toEqual([
			{ code: 'DIN-2026-0001', tokenValidUntil: '2020-01-31' }
		]);

		// Solo el vencido cambia; el vigente se queda como está.
		expect(state.paymentUpdates).toHaveLength(1);
		expect(state.paymentUpdates[0]).toMatchObject({
			where: { id: 'pay_1' },
			data: { tokenStatus: 'EXPIRADO' }
		});

		const log = state.syncLogs[0].data as Obj;
		expect(log).toMatchObject({ entity: 'PAYMENT', action: 'UPDATE', status: 'PENDING' });
		expect(String(log.message)).toContain('EXPIRADO');
		expect(String(log.message)).toContain('DIN-2026-0001');
		expect(log.payload).toMatchObject({
			purpose: 'EXPIRACION',
			source: 'CRON',
			gatewayCalled: false,
			tokenValidUntil: '2020-01-31'
		});

		// Nada sale hacia PlacetoPay: la vigencia no es un veredicto del emisor.
		expect(state.queryCalls).toHaveLength(0);
	});

	it('no toca tokens ya EXPIRADO o CANCELADO (quedan fuera de la consulta)', async () => {
		state.candidates = [];

		const res = await run();

		expect(res.status).toBe(200);
		const where = state.findManyArgs[0].where as Obj;
		expect(where.NOT).toEqual({ tokenStatus: { in: ['EXPIRADO', 'CANCELADO'] } });
		expect(where.token).toEqual({ not: null });
		expect(where.tokenValidUntil).toEqual({ not: null });
		expect(state.paymentUpdates).toHaveLength(0);
		expect(state.syncLogs).toHaveLength(0);
	});

	it('una fecha ausente o ilegible no marca el token (fallo abierto)', async () => {
		state.candidates = [
			payment({ id: 'pay_1', tokenValidUntil: 'sin fecha' }),
			payment({ id: 'pay_2', tokenValidUntil: null })
		];

		const res = await run();
		const body = (await res.json()) as Obj;

		expect(res.status).toBe(200);
		expect(body.expiredTokenCount).toBe(0);
		expect(state.paymentUpdates).toHaveLength(0);
	});
});

describe('cron diario — autorización de la sonda', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		state.candidates = [];
		state.findManyArgs = [];
		state.paymentUpdates = [];
		state.syncLogs = [];
		state.queryCalls = [];
	});

	it('en producción exige autorización aunque llegue ?test=true', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('CRON_SECRET', 'secreto-real');

		const res = await run('?test=true');

		expect(res.status).toBe(401);
		// No se tocó la base: la petición muere antes de la sonda.
		expect(state.findManyArgs).toHaveLength(0);
	});

	it('no acepta el token por defecto ni ?token= en la URL', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('CRON_SECRET', 'secreto-real');

		const porQuery = await run('?token=dinamo-cert-2026');
		expect(porQuery.status).toBe(401);

		const porHeader = await run('', bearer('dinamo-cert-2026'));
		expect(porHeader.status).toBe(401);
	});

	it('no autoriza por el User-Agent de Vercel Cron', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('CRON_SECRET', 'secreto-real');

		const res = await run('', { headers: { 'user-agent': 'vercel-cron/1.0' } });

		expect(res.status).toBe(401);
	});

	it('sin CRON_SECRET en producción no autoriza ningún bearer', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('CRON_SECRET', '');

		const res = await run('', bearer('dinamo-cert-2026'));

		expect(res.status).toBe(401);
	});

	it('autoriza con el bearer correcto', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('CRON_SECRET', 'secreto-real');

		const res = await run('', bearer('secreto-real'));

		expect(res.status).toBe(200);
	});

	it('acepta ?test=true fuera de producción', async () => {
		vi.stubEnv('NODE_ENV', 'test');
		vi.stubEnv('CRON_SECRET', '');

		const res = await run('?test=true');

		expect(res.status).toBe(200);
	});

	it('fuera de producción, sin atajo, también exige autorización', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		vi.stubEnv('CRON_SECRET', '');

		const res = await run('');

		expect(res.status).toBe(401);
	});
});
