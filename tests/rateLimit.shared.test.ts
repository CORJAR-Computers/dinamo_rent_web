import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/lib/server/db.js';
import { checkRateLimit } from '../src/lib/server/rateLimit.js';

/**
 * El contador compartido es la razón de existir de `rate_limit_counters`: si la
 * base no responde, `checkRateLimit` cae a un Map por instancia y el límite deja
 * de ser global (justo el agujero que se cerró). Este test falla en ese caso,
 * para que el CI no pueda dar verde con un Postgres inalcanzable o sin migrar.
 *
 * Cada ejecución usa su propio endpoint para no chocar con contadores previos.
 */
const run = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const endpointKey = `verificacion-compartida-${run}`;
const options = { endpointKey, windowMs: 60_000, maxRequests: 5 };

const filas = () => db.rateLimitCounter.findMany({ where: { endpoint: endpointKey } });

describe('contador compartido de rate limit', () => {
	afterAll(async () => {
		await db.rateLimitCounter.deleteMany({ where: { endpoint: endpointKey } });
	});

	it('persiste el conteo en la tabla y no en memoria', async () => {
		const primera = await checkRateLimit(`ip-${run}`, options);
		expect(primera.allowed).toBe(true);

		const guardadas = await filas();
		expect(
			guardadas,
			'no hay fila en rate_limit_counters: el limitador cayó al respaldo en memoria'
		).toHaveLength(1);
		expect(guardadas[0].count).toBe(1);

		// La segunda petición incrementa la MISMA fila: se lee el estado compartido.
		await checkRateLimit(`ip-${run}`, options);
		const [fila] = await filas();
		expect(fila.count).toBe(2);
	});

	it('reparte conteos únicos aunque las peticiones lleguen en paralelo', async () => {
		const ip = `ip-paralela-${run}`;
		const resultados = await Promise.all(
			Array.from({ length: 4 }, () => checkRateLimit(ip, options))
		);

		const conteos = resultados
			.map((resultado) => options.maxRequests - resultado.remaining)
			.sort((a, b) => a - b);
		expect(conteos).toEqual([1, 2, 3, 4]);

		const guardadas = await filas();
		const paralela = guardadas.find((fila) => fila.count === 4);
		expect(paralela, 'el incremento concurrente perdió peticiones').toBeDefined();
	});

	it('bloquea al superar el máximo de la ventana', async () => {
		const ip = `ip-bloqueo-${run}`;
		const limitado = { ...options, maxRequests: 2 };

		await checkRateLimit(ip, limitado);
		await checkRateLimit(ip, limitado);
		const tercera = await checkRateLimit(ip, limitado);

		expect(tercera.allowed).toBe(false);
		expect(tercera.remaining).toBe(0);
		expect(tercera.retryAfterSeconds).toBeGreaterThan(0);
	});
});
