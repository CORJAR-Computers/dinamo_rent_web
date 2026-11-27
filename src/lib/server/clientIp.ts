import type { RequestEvent } from '@sveltejs/kit';

/**
 * IP de quien origina la petición, para la evidencia de auditoría.
 *
 * `getClientAddress` es la fuente fiable que expone SvelteKit (la rellena el
 * adaptador, no el cliente); `x-forwarded-for` solo cubre el caso en que no esté
 * disponible. Una única copia evita que dos endpoints guarden IP distintas para
 * el mismo hecho.
 */
export function requestIp({
  request,
  getClientAddress,
}: Pick<RequestEvent, 'request' | 'getClientAddress'>): string {
  try {
    return getClientAddress();
  } catch {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  }
}
