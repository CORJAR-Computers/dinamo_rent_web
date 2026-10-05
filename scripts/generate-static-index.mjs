#!/usr/bin/env node
/**
 * Genera index.html (landing estática) a partir de index.template.html.
 *
 * Únicas fuentes de verdad:
 *  - Secciones: src/lib/data/sections.ts → tokens {{FLEET_SECTION.id|label|href}}
 *  - Contacto : src/lib/data/contact.ts  → tokens {{PRIMARY_PHONE}}, {{WHATSAPP_URL}}
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

/** Contacto: constantes literales de contact.ts + WHATSAPP_URL derivado. */
function loadContact() {
  const src = readFileSync(CONTACT_FILE, 'utf8');
  const map = new Map(
    [...src.matchAll(/export const (\w+)\s*=\s*'([^']*)'/g)].map((m) => [m[1], m[2]])
  );
  const phone = map.get('PRIMARY_PHONE');
  if (!phone) throw new Error('No se encontró PRIMARY_PHONE en src/lib/data/contact.ts');
  map.set('WHATSAPP_URL', `https://wa.me/${phone.replace(/\D/g, '')}`);
  return map;
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

  const out = template.replace(/\{\{([\w.]+)\}\}/g, (whole, name) => {
    if (!tokens.has(name)) {
      throw new Error(`Token sin resolver en index.template.html: {{${name}}}`);
    }
    return tokens.get(name);
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
