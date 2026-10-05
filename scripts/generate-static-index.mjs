#!/usr/bin/env node
/**
 * Genera index.html (landing estática) a partir de index.template.html.
 *
 * Únicas fuentes de verdad:
 *  - Secciones : src/lib/data/sections.ts → tokens {{FLEET_SECTION.id|label|href}}
 *  - Contacto  : src/lib/data/contact.ts   → tokens {{PRIMARY_PHONE}}, {{WHATSAPP_URL}}
 *  - Ubicaciones: src/lib/data/fleet.ts    → tokens {{LOCATION_OPTIONS}}, {{LOCATION_LIST}}
 *
 * La landing estática comparte así ids y enlaces con la app SvelteKit.
 *
 * Uso: npm run generate:index
 * También lo importa scripts/check-contact.mjs (regla 7) para verificar
 * que index.html no esté desincronizado.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEMPLATE_FILE = join(ROOT, 'index.template.html');
const OUTPUT_FILE = join(ROOT, 'index.html');
const SECTIONS_FILE = join(ROOT, 'src', 'lib', 'data', 'sections.ts');
const CONTACT_FILE = join(ROOT, 'src', 'lib', 'data', 'contact.ts');
const FLEET_FILE = join(ROOT, 'src', 'lib', 'data', 'fleet.ts');

/** Secciones de sections.ts: export const X_SECTION = def('id', 'Label'). */
function loadSections() {
  const src = readFileSync(SECTIONS_FILE, 'utf8');
  const sections = [
    ...src.matchAll(/export const (\w+_SECTION)\s*=\s*def\(\s*'([^']+)',\s*'([^']*)'\s*\)/g)
  ].map((m) => ({ name: m[1], id: m[2], label: m[3], href: `/#${m[2]}` }));
  if (sections.length === 0) {
    throw new Error('No se encontró ninguna def(...) en src/lib/data/sections.ts');
  }
  return sections;
}

/** Contacto: constantes literales de contact.ts + derivadas + WHATSAPP_URL. */
function loadContact() {
  const src = readFileSync(CONTACT_FILE, 'utf8');
  const map = new Map(
    [...src.matchAll(/export const (\w+)\s*=\s*'([^']*)'/g)].map((m) => [m[1], m[2]])
  );
  // Derivadas con .split()[n] (OFFICE_STREET, OFFICE_NEIGHBORHOOD, ...).
  for (const m of src.matchAll(
    /export const (\w+)\s*=\s*(\w+)\.split\(\s*'([^']*)'\s*\)\s*\[\s*(\d+)\s*\]/g
  )) {
    const base = map.get(m[2]);
    if (base !== undefined) map.set(m[1], base.split(m[3])[Number(m[4])] ?? '');
  }
  const phone = map.get('PRIMARY_PHONE');
  if (!phone) throw new Error('No se encontró PRIMARY_PHONE en src/lib/data/contact.ts');
  map.set('WHATSAPP_URL', `https://wa.me/${phone.replace(/\D/g, '')}`);
  return map;
}

/** PICKUP_LOCATIONS de fleet.ts con los ${...} resueltos desde contact.ts. */
function loadPickupLocations() {
  const src = readFileSync(FLEET_FILE, 'utf8');
  const arr = src.match(/export const PICKUP_LOCATIONS\s*=\s*\[([\s\S]*?)\]/);
  if (!arr) throw new Error('No se encontró PICKUP_LOCATIONS en src/lib/data/fleet.ts');
  const items = [
    ...arr[1].matchAll(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g)
  ].map((m) => m[0]);
  if (items.length === 0) throw new Error('PICKUP_LOCATIONS está vacío en src/lib/data/fleet.ts');
  const consts = loadContact();
  return items.map((raw) =>
    raw
      .slice(1, -1)
      .replace(/\$\{(\w+)\}/g, (whole, name) => (consts.has(name) ? consts.get(name) : whole))
  );
}

/** Escapa HTML para texto y atributos de las opciones de ubicación. */
function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** HTML final: template + tokens; lanza si queda algún token sin resolver. */
export function renderIndex() {
  const template = readFileSync(TEMPLATE_FILE, 'utf8');

  const tokens = new Map();
  for (const s of loadSections()) {
    tokens.set(`${s.name}.id`, s.id);
    tokens.set(`${s.name}.label`, s.label);
    tokens.set(`${s.name}.href`, s.href);
  }
  for (const [key, value] of loadContact()) tokens.set(key, value);

  const locations = loadPickupLocations();
  tokens.set(
    'LOCATION_OPTIONS',
    locations
      .map((loc) => `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`)
      .join('\n')
  );
  tokens.set(
    'LOCATION_LIST',
    locations
      .map((loc) => `<li><i class="fa-solid fa-location-dot text-orange"></i> ${escapeHtml(loc)}</li>`)
      .join('\n')
  );

  const out = template.replace(/\{\{([\w.]+)\}\}/g, (whole, name, offset) => {
    if (!tokens.has(name)) {
      throw new Error(`Token sin resolver en index.template.html: {{${name}}}`);
    }
    const value = tokens.get(name);
    if (!value.includes('\n')) return value;
    // Valor multilínea: conserva la indentación de la línea del token.
    const lineStart = template.lastIndexOf('\n', offset) + 1;
    const prefix = template.slice(lineStart, offset);
    if (prefix.trim() !== '') return value;
    return value.split('\n').join('\n' + prefix);
  });
  const leftover = out.match(/\{\{[^}]*\}\}/);
  if (leftover) throw new Error(`Token mal formado en index.template.html: ${leftover[0]}`);
  return out;
}

// Ejecución como script: npm run generate:index
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUTPUT_FILE, renderIndex());
  console.log(`✓ index.html generado desde index.template.html (${loadSections().length} secciones de sections.ts).`);
}
