/**
 * Indica si la vigencia informada por la pasarela (`valid_until`) ya pasó.
 *
 * PlacetoPay devuelve normalmente solo la fecha (p. ej. `2029-12-31`): en ese
 * caso el token vale hasta el final de ese día en UTC. Si llega con hora y sin
 * zona, se interpreta como UTC. Un valor ausente o ilegible **no** se considera
 * vencido: bloquear un cobro legítimo por un formato inesperado es peor que
 * dejar que la pasarela, que sigue siendo la autoridad final, decida.
 *
 * Vive en `$lib/utils` (sin dependencias de Node) porque lo usan tanto el
 * servidor —cobro con token y sonda diaria— como el panel de administración,
 * que así muestra el mismo criterio que aplica el backend.
 */
export function isTokenExpired(
  tokenValidUntil: string | null | undefined,
  now: Date = new Date()
): boolean {
  const raw = String(tokenValidUntil ?? '').trim();
  if (!raw) return false;

  // Sin hora, el token vale hasta el final de ese día. «YYYY-MM-DD» y
  // «YYYY-MM-DD HH:mm:ss» se normalizan a ISO antes de parsear.
  const iso = /[T ]/.test(raw) ? raw.replace(' ', 'T') : `${raw}T23:59:59.999`;
  // Sin zona explícita se asume UTC; con zona se respeta la informada.
  const expiresAt = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);

  return Number.isFinite(expiresAt) && expiresAt < now.getTime();
}
