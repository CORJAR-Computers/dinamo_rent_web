/**
 * rateLimit.ts — Limitador de tasa en memoria (Token Bucket / Sliding Window)
 * 
 * Protege endpoints críticos de pagos y reservas contra:
 * - Ataques de prueba de tarjetas (Card Testing / BIN attacks)
 * - Creación automatizada masiva de reservas (DoS / Spam de inventario)
 * - Fuerza bruta en consultas
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipMap = new Map<string, RateLimitRecord>();

// Limpieza periódica cada 10 minutos para evitar fugas de memoria
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of ipMap.entries()) {
      if (now > record.resetAt) {
        ipMap.delete(key);
      }
    }
  }, 10 * 60 * 1000).unref?.();
}

export interface RateLimitOptions {
  windowMs: number; // Ventana de tiempo en milisegundos (ej: 10 * 60 * 1000)
  maxRequests: number; // Máximo de peticiones permitidas en la ventana
  endpointKey: string; // Identificador del endpoint para separar límites
}

/**
 * Verifica si una IP ha excedido el límite de peticiones.
 * Retorna { allowed: true } o { allowed: false, retryAfterSeconds }.
 */
export function checkRateLimit(
  ip: string,
  options: RateLimitOptions
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const key = `${options.endpointKey}:${ip || 'unknown'}`;
  const record = ipMap.get(key);

  if (!record || now > record.resetAt) {
    ipMap.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  if (record.count >= options.maxRequests) {
    const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  record.count++;
  return {
    allowed: true,
    remaining: options.maxRequests - record.count,
    retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}
