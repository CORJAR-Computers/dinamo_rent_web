/**
 * Datos de contacto de Dinamo Rent a Car.
 * Único punto de edición: cambia los números aquí y todo el sitio se actualiza.
 */

/** Dirección de la oficina (única fuente: no la repitas a mano en ningún archivo). */
export const OFFICE_ADDRESS = 'Carrera 3 #70-200, Crespo';

/** Fragmentos derivados de OFFICE_ADDRESS para textos que los necesiten por separado. */
export const OFFICE_STREET = OFFICE_ADDRESS.split(', ')[0];
export const OFFICE_NEIGHBORHOOD = OFFICE_ADDRESS.split(', ')[1];

/** Dirección con ciudad (textos de contacto, pie de página y título del mapa). */
export const OFFICE_ADDRESS_CITY = `${OFFICE_ADDRESS}, Cartagena`;

/** Dirección completa con país (búsquedas de Google Maps). */
export const OFFICE_ADDRESS_FULL = `${OFFICE_ADDRESS_CITY}, Colombia`;

/** Query de Google Maps con `#` escapado, lista para usar en URLs (`?query=` / `?q=`). */
export const OFFICE_QUERY = OFFICE_ADDRESS_FULL.replace(/#/g, '%23');

/** Teléfono principal (el que recibe WhatsApp). */
export const PRIMARY_PHONE = '+57 301 613 85 30';

/** Teléfono secundario. */
export const SECONDARY_PHONE = '+57 321 839 44 22';

/** Todos los teléfonos mostrados al público, en orden de prioridad. */
export const CONTACT_PHONES = [PRIMARY_PHONE, SECONDARY_PHONE] as const;

/** Número de WhatsApp en formato wa.me (sin '+', sin espacios), derivado del teléfono principal. */
export const WHATSAPP_NUMBER = PRIMARY_PHONE.replace(/\D/g, '');

/** Enlace base de WhatsApp (línea principal). */
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

/** Enlace telefónico directo (`tel:`) para un número de la empresa. */
export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/**
 * Enlace de WhatsApp para un número específico de la empresa.
 * @param phone número en formato `+57 ...` (tomado de CONTACT_PHONES).
 * @param text mensaje ya codificado para URL (ej. `Hola%20Dinamo...`).
 */
export function whatsappLinkFor(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, '');
  return text ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/${digits}`;
}

/**
 * Enlace de WhatsApp a la línea principal con mensaje prellenado.
 * @param text mensaje ya codificado para URL (ej. `Hola%20Dinamo...`).
 */
export function whatsappLink(text?: string): string {
  return whatsappLinkFor(PRIMARY_PHONE, text);
}
