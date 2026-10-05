/**
 * Secciones de la home: única fuente de verdad para el menú (Navbar),
 * los enlaces rápidos del footer, el scrollspy y las anclas `<section id>`.
 *
 * - Renombrar una sección: cambia el `id` (y/o `label`) en su `def(...)` de aquí;
 *   la `href` se deriva sola y menú, footer, scrollspy y anclas siguen correctos.
 * - Añadir una sección: crea un `def(...)`, añádelo a `SECTIONS` y renderiza su
 *   `<section id={MI_SECCION.id}>` en la home.
 */
export interface Section {
  /** Ancla: id del elemento de la home. */
  id: string;
  /** Etiqueta visible en el menú. */
  label: string;
  /** Ruta absoluta con ancla: funciona desde cualquier ruta, no solo la home. */
  href: string;
}

/** Crea una sección derivando la href del id (renombrar el id basta). */
function def(id: string, label: string): Section {
  return { id, label, href: `/#${id}` };
}

export const FLEET_SECTION = def('flota', 'Nuestra Flota');
export const PROCESS_SECTION = def('proceso', '¿Cómo Funciona?');
export const GUARANTEES_SECTION = def('garantias', 'Garantías & Coberturas');
export const CONTACT_SECTION = def('contacto', 'Contacto');
export const LOCATIONS_SECTION = def('ubicaciones', 'Ubicaciones');

/** En orden de aparición en la página (el scrollspy del menú depende de él). */
export const SECTIONS: readonly Section[] = [
  FLEET_SECTION,
  PROCESS_SECTION,
  GUARANTEES_SECTION,
  CONTACT_SECTION,
  LOCATIONS_SECTION
];

/** ids en orden de página, p.ej. para recorrer el DOM. */
export const SECTION_IDS: readonly string[] = SECTIONS.map((s) => s.id);
