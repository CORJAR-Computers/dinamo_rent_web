/**
 * rateLimit.ts — Limitador de tasa con contador compartido en PostgreSQL
 *
 * Un `Map` en memoria no sirve en serverless: cada instancia arranca con su
 * propio contador y basta con que Vercel enrute la petición a una instancia
 * nueva para reiniciar el límite. Por eso el contador vive en la tabla
 * `rate_limit_counters` y se incrementa con un único `INSERT ... ON CONFLICT
 * ... RETURNING`, que es atómico aunque lleguen peticiones simultáneas.
 *
 * Protege endpoints críticos contra:
 * - Enumeración de códigos de reserva (`DIN-AAAA-NNNN`).
 * - Fuerza bruta en el login de administrador.
 * - Card testing / BIN attacks en la creación de sesión de pago.
 */

import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { db } from '#lib/server/db.js';

export interface RateLimitOptions {
  windowMs: number; // Ventana de tiempo en milisegundos (ej: 10 * 60 * 1000)
  maxRequests: number; // Máximo de peticiones permitidas en la ventana
  endpointKey: string; // Identificador del endpoint para separar límites
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Clave del contador: hash de endpoint + IP. Se guarda el hash y no la IP para
 * no acumular direcciones personales en la base de datos.
 */
function counterKey(endpointKey: string, ip: string): string {
  return crypto
    .createHash('sha256')
    .update(`${endpointKey}:${ip || 'unknown'}`)
    .digest('hex');
}

/** Respaldo por instancia: solo se usa si la base de datos no responde. */
const memoryCounters = new Map<string, { count: number; resetAt: number }>();
let warnedFallback = false;

function checkInMemory(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();

  // Poda barata para que el respaldo no crezca sin control.
  if (memoryCounters.size > 1000) {
    for (const [k, record] of memoryCounters.entries()) {
      if (now > record.resetAt) memoryCounters.delete(k);
    }
  }

  const record = memoryCounters.get(key);
  if (!record || now > record.resetAt) {
    memoryCounters.set(key, { count: 1, resetAt: now + options.windowMs });
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  if (record.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  }

  record.count++;
  return {
    allowed: true,
    remaining: options.maxRequests - record.count,
    retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
  };
}

/**
 * Registra una petición y devuelve si está permitida.
 *
 * Cuenta siempre, incluidas las que ya están bloqueadas: así el contador no se
 * reinicia golpeando el endpoint, y `resetAt` se mantiene fijo durante la
 * ventana (la ventana no se extiende con cada intento).
 */
export async function checkRateLimit(
  ip: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const key = counterKey(options.endpointKey, ip);
  const windowSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));

  try {
    const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>(Prisma.sql`
      INSERT INTO "rate_limit_counters" ("key", "endpoint", "count", "resetAt", "updatedAt")
      VALUES (
        ${key},
        ${options.endpointKey},
        1,
        NOW() + (${windowSeconds}::int * INTERVAL '1 second'),
        NOW()
      )
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limit_counters"."resetAt" <= NOW() THEN 1
          ELSE "rate_limit_counters"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "rate_limit_counters"."resetAt" <= NOW()
            THEN NOW() + (${windowSeconds}::int * INTERVAL '1 second')
          ELSE "rate_limit_counters"."resetAt"
        END,
        "updatedAt" = NOW()
      RETURNING "count", "resetAt"
    `);

    // Limpieza oportunista de contadores vencidos (1 de cada ~200 peticiones).
    if (Math.random() < 0.005) {
      void db
        .$executeRaw(
          Prisma.sql`DELETE FROM "rate_limit_counters" WHERE "resetAt" < NOW() - INTERVAL '1 day'`
        )
        .catch(() => {});
    }

    const row = rows[0];
    if (!row) return checkInMemory(key, options);

    const count = Number(row.count);
    const resetAt =
      row.resetAt instanceof Date ? row.resetAt.getTime() : new Date(row.resetAt).getTime();
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

    if (count > options.maxRequests) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    return {
      allowed: true,
      remaining: Math.max(0, options.maxRequests - count),
      retryAfterSeconds,
    };
  } catch (e) {
    // Sin base de datos el límite no puede ser compartido, pero se mantiene el
    // respaldo por instancia en lugar de dejar pasar todo (fail soft).
    if (!warnedFallback) {
      warnedFallback = true;
      console.error(
        '[rateLimit] Contador compartido no disponible; usando respaldo en memoria por instancia. ' +
          'Verifica que la migración 20261124130000_shared_rate_limit_counters esté aplicada.',
        e
      );
    }
    return checkInMemory(key, options);
  }
}

/**
 * Borra el contador (p. ej. tras un login correcto), para que un inicio de
 * sesión legítimo no consuma el cupo de intentos fallidos.
 */
export async function resetRateLimit(ip: string, options: RateLimitOptions): Promise<void> {
  const key = counterKey(options.endpointKey, ip);
  memoryCounters.delete(key);
  try {
    await db.$executeRaw(
      Prisma.sql`DELETE FROM "rate_limit_counters" WHERE "key" = ${key}`
    );
  } catch {
    // Si falla, el contador caduca solo al terminar la ventana.
  }
}
