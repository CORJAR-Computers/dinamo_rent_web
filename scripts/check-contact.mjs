#!/usr/bin/env node
/**
 * Guardia de constantes de contacto.
 *
 * Falla (exit 1) si un teléfono de la empresa o un enlace wa.me hardcodeado
 * aparece fuera de src/lib/data/contact.ts, para que los datos de contacto
 * tengan una única fuente de verdad.
 *
 * Reglas:
 *  1. Ningún archivo (salvo contact.ts) puede contener los
 *     dígitos de los teléfonos de CONTACT_PHONES, en ningún formato: contiguos,
 *     con espacios, guiones o paréntesis, con y sin prefijo internacional,
 *     y también dentro de enlaces wa.me.
 *  2. En src/ no puede existir un enlace wa.me literal con dígitos: todos deben
 *     construirse con whatsappLink()/whatsappLinkFor() de contact.ts
 *     (los wa.me dinámicos tipo wa.me/${...} no cuentan).
 *  3. Los defaults de ubicación (prisma/schema.prisma y la API de reservas)
 *     deben coincidir con PICKUP_LOCATIONS[0] de src/lib/data/fleet.ts.
 *
 * Uso: npm run check:contact   (también corre dentro de npm run check)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTACT_FILE = join('src', 'lib', 'data', 'contact.ts');

const EXTENSIONS = new Set(['.ts', '.svelte', '.js', '.mjs', '.html', '.css', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', '.vercel', '.git', 'mejoras', 'dist', 'build']);
const SKIP_FILES = new Set(['package-lock.json']);

// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      const rel = relative(ROOT, join(dir, entry.name)).split(sep).join('/');
      if (SKIP_FILES.has(rel)) continue;
      if (!EXTENSIONS.has(extname(entry.name))) continue;
      out.push(rel);
    }
  }
  return out;
}

/** Extrae los teléfonos exportados por contact.ts (fuente de verdad). */
function loadCompanyPhones() {
  const src = readFileSync(join(ROOT, CONTACT_FILE), 'utf8');
  const phones = [...src.matchAll(/export const \w*PHONE\w*\s*=\s*'([^']+)'/g)].map((m) => m[1]);
  return phones;
}

/** Regex que casa los dígitos con separadores opcionales entre cada uno. */
function digitsToPattern(digits) {
  const sepClass = '[\\s.()\\-/#]*';
  return new RegExp(digits.split('').join(sepClass), 'g');
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function snippet(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? undefined : end).trim().slice(0, 120);
}

// ---------------------------------------------------------------------------

const phones = loadCompanyPhones();
if (phones.length === 0) {
  console.error(`✗ No se encontraron teléfonos en ${CONTACT_FILE}: revisa el formato de la constante.`);
  process.exit(1);
}

const phonePatterns = phones.map((phone) => {
  const raw = phone.replace(/\D/g, '');
  // Se usa el número nacional (sin prefijo internacional): el formato
  // internacional contiene al nacional como subcadena, así que un único
  // patrón cubre ambas grafías y cualquier separador entre dígitos.
  const national = raw.startsWith('57') && raw.length === 12 ? raw.slice(2) : raw;
  return { phone, regex: digitsToPattern(national) };
});

const WA_LITERAL = /wa\.me\/\d{7,}/g;

const files = walk(ROOT).sort();
const errors = [];
const seen = new Set();
let scanned = 0;

function push(err) {
  const key = `${err.rel}:${err.line}:${err.rule}`;
  if (seen.has(key)) return;
  seen.add(key);
  errors.push(err);
}

for (const rel of files) {
  if (rel === CONTACT_FILE.split(sep).join('/')) continue;

  scanned++;
  const text = readFileSync(join(ROOT, rel), 'utf8');

  for (const { phone, regex } of phonePatterns) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      push({
        rel,
        line: lineOf(text, m.index),
        rule: `teléfono ${phone}`,
        detail: snippet(text, m.index)
      });
    }
  }

  if (rel.startsWith('src/')) {
    WA_LITERAL.lastIndex = 0;
    let m;
    while ((m = WA_LITERAL.exec(text)) !== null) {
      push({
        rel,
        line: lineOf(text, m.index),
        rule: 'enlace wa.me hardcodeado',
        detail: snippet(text, m.index)
      });
    }
  }
}

// Regla 3: los defaults de ubicación deben ser PICKUP_LOCATIONS[0].
const FLEET_FILE = join('src', 'lib', 'data', 'fleet.ts');
const SCHEMA_FILE = join('prisma', 'schema.prisma');
const API_FILE = join('src', 'routes', 'api', 'reservations', '+server.ts');
const rel = (p) => p.split(sep).join('/');

/** Primer elemento de PICKUP_LOCATIONS (fuente de verdad de las ubicaciones). */
function firstPickupLocation() {
  const src = readFileSync(join(ROOT, FLEET_FILE), 'utf8');
  const arr = src.match(/export const PICKUP_LOCATIONS\s*=\s*\[([\s\S]*?)\]/);
  if (!arr) return null;
  const first = arr[1].match(/['"]([^'"]+)['"]/);
  return first ? first[1] : null;
}

try {
  const expected = firstPickupLocation();
  if (!expected) {
    push({
      rel: rel(FLEET_FILE),
      line: 1,
      rule: 'PICKUP_LOCATIONS ilegible',
      detail: 'No se encontró el array exportado en src/lib/data/fleet.ts'
    });
  } else {
    const found = [];
    for (const [file, re] of [
      [SCHEMA_FILE, /(pickupLocation|returnLocation)\s+String\s+@default\("([^"]*)"\)/g],
      [API_FILE, /(pickupLocation|returnLocation)\s*=\s*'([^']+)'/g]
    ]) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      for (const m of text.matchAll(re)) {
        found.push({ rel: rel(file), line: lineOf(text, m.index), name: m[1], value: m[2] });
      }
    }

    if (!found.some((d) => d.rel === rel(SCHEMA_FILE) && d.name === 'pickupLocation')) {
      push({
        rel: rel(SCHEMA_FILE),
        line: 1,
        rule: 'default de pickupLocation ausente',
        detail: 'No se encontró `pickupLocation String @default(...)` en prisma/schema.prisma'
      });
    }

    for (const d of found) {
      if (d.value !== expected) {
        push({
          rel: d.rel,
          line: d.line,
          rule: `default de ${d.name} ≠ PICKUP_LOCATIONS[0]`,
          detail: `default: "${d.value}" | PICKUP_LOCATIONS[0]: "${expected}"`
        });
      }
    }
  }
} catch (err) {
  push({
    rel: rel(SCHEMA_FILE),
    line: 1,
    rule: 'regla 3 ilegible',
    detail: err.message
  });
}

if (errors.length > 0) {
  console.error('✗ Guardia de contacto fallida:\n');
  for (const e of errors) {
    console.error(`  ${e.rel}:${e.line}  [${e.rule}]`);
    console.error(`      ${e.detail}\n`);
  }
  if (errors.some((e) => e.rule.includes('teléfono') || e.rule.includes('wa.me'))) {
    console.error('Mueve el número a src/lib/data/contact.ts y usa telLink()/whatsappLink()/whatsappLinkFor().');
  }
  if (errors.some((e) => e.rule.includes('default') || e.rule.includes('PICKUP_LOCATIONS'))) {
    console.error('Si el error es un default de ubicación, alínialo con PICKUP_LOCATIONS[0] de src/lib/data/fleet.ts.');
  }
  process.exit(1);
}

console.log(`✓ Guardia de contacto OK: ${scanned} archivos revisados, ${phones.length} teléfonos vigilados en ${CONTACT_FILE}.`);
console.log('  Defaults de ubicación (schema.prisma + API) = PICKUP_LOCATIONS[0].');
