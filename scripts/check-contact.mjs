#!/usr/bin/env node
/**
 * Guardia de constantes de contacto.
 *
 * Falla (exit 1) si un teléfono de la empresa o un enlace wa.me hardcodeado
 * aparece fuera de src/lib/data/contact.ts, para que los datos de contacto
 * tengan una única fuente de verdad.
 *
 * Reglas:
 *  1. Ningún archivo (salvo contact.ts y el index.html generado por
 *     generate:index) puede contener los
 *     dígitos de los teléfonos de CONTACT_PHONES, en ningún formato: contiguos,
 *     con espacios, guiones o paréntesis, con y sin prefijo internacional,
 *     y también dentro de enlaces wa.me.
 *  2. En src/ no puede existir un enlace wa.me literal con dígitos: todos deben
 *     construirse con whatsappLink()/whatsappLinkFor() de contact.ts
 *     (los wa.me dinámicos tipo wa.me/${...} no cuentan).
 *  3. Los defaults de ubicación (prisma/schema.prisma y la API de reservas)
 *     deben coincidir con PICKUP_LOCATIONS[0] de src/lib/data/fleet.ts.
 *  4. Los defaults de horario pickupTime/returnTime (prisma/schema.prisma y la
 *     API de reservas) deben ser opciones de TIME_OPTIONS de
 *     src/lib/components/HeroSearch.svelte.
 *  5. PICKUP_LOCATIONS debe ser íntegro: sin duplicados (según la misma
 *     normalización que locationKey()), sin vacíos, y cada <select> de lugar
 *     del buscador debe mostrar exactamente sus elementos (sin opciones
 *     hardcodeadas ni each de otra lista).
 *  6. En src/ no puede haber ids ni enlaces de sección hardcodeados: los
 *     href ancla (/#... o #...) y los ids (id="...", getElementById(...),
 *     '#...') deben salir de src/lib/data/sections.ts. Los <section>/<footer>
 *     solo pueden llevar id={SECCION.id}, incluso si el id literal no está
 *     registrado (así no se cuela ninguna sección fuera de sections.ts).
 *  7. index.html (landing estática) debe ser idéntico al que produce
 *     index.template.html + sections.ts + contact.ts; si cambia cualquier
 *     fuente → npm run generate:index.
 *  8. Los literales de la dirección "Carrera 3" y "70-200" solo pueden
 *     aparecer en contact.ts y en el index.html generado; en ningún otro
 *     archivo recorrido (este propio archivo se salta: sus literales son
 *     los patrones que los vigilan).
 *  9. La migración de normalización debe seguir a PICKUP_LOCATIONS: cada
 *     valor canónico del CTE legacy ∈ lista y los literales DEFAULT de los
 *     coalesce = PICKUP_LOCATIONS[0].
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

// Regla 8: dirección de la oficina solo en contact.ts e index.html (el bucle
// salta ambos: contact.ts por su continue y index.html por la regla 7).
const ADDRESS_LITERALS = [
  { label: 'Carrera 3', re: /carrera\s*3/gi },
  { label: '70-200', re: /70[\s\-–—]+200/g }
];

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

// Regla 6: en src/ ningún id ni enlace de sección puede estar hardcodeado:
// deben salir de src/lib/data/sections.ts.
const SECTIONS_FILE = join('src', 'lib', 'data', 'sections.ts');
const SECTIONS_REL = SECTIONS_FILE.split(sep).join('/');

/** ids declarados en sections.ts: def('id', ...) o id: 'id'. */
function sectionIds() {
  const src = readFileSync(join(ROOT, SECTIONS_FILE), 'utf8');
  return [
    ...[...src.matchAll(/def\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...src.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
  ];
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SECTION_PATTERNS = [
  // href ancla en markup: href="/​#x" o href="#x" (con llaves o sin ellas)
  { rule: 'enlace de sección hardcodeado', re: /href\s*=\s*\{?\s*["']\/?#[^"']*["']/g },
  // literal '/#x' en JS (hash, history, constantes…)
  { rule: 'enlace de sección hardcodeado', re: /["']\/#[^"']*["']/g },
  // <section>/<footer> con id literal (registrado o no): debe ser id={SECCION.id}
  { rule: 'id de sección hardcodeado', re: /<(?:section|footer)\s[^>]*\bid\s*=\s*\{?\s*["'][^"']+["']/g }
];

try {
  const ids = [...new Set(sectionIds())];
  if (ids.length === 0) {
    throw new Error('No se encontró ningún def(...) ni id: en src/lib/data/sections.ts');
  }
  const alt = ids.map(escapeRe).join('|');
  SECTION_PATTERNS.push(
    // id="x" / id={'x'} en elementos y asignaciones .id = 'x'
    { rule: 'id de sección hardcodeado', re: new RegExp(`\\bid\\s*=\\s*\\{?\\s*["'](?:${alt})["']`, 'g') },
    // document.getElementById('x')
    { rule: 'id de sección hardcodeado', re: new RegExp(`getElementById\\(\\s*["'](?:${alt})["']`, 'g') },
    // literales '#x': querySelector('#x'), location.hash, etc.
    { rule: 'id de sección hardcodeado', re: new RegExp(`["']#(?:${alt})["']`, 'g') }
  );
} catch (err) {
  push({
    rel: SECTIONS_REL,
    line: 1,
    rule: 'sections.ts ilegible',
    detail: err.message
  });
}

for (const rel of files) {
  if (rel === CONTACT_FILE.split(sep).join('/')) continue;
  // index.html lo genera scripts/generate-static-index.mjs desde
  // contact.ts/sections.ts: su contenido se valida con la regla 7.
  if (rel === 'index.html') continue;

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

  // El propio guardia nombra los literales que vigila (doc y patrones):
  // solo se salta a sí mismo para esta regla, el resto de reglas lo cubren.
  if (rel !== 'scripts/check-contact.mjs') {
    for (const { label, re } of ADDRESS_LITERALS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        push({
          rel,
          line: lineOf(text, m.index),
          rule: `dirección "${label}" fuera de contact.ts`,
          detail: snippet(text, m.index)
        });
      }
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

    if (rel !== SECTIONS_REL) {
      for (const { rule, re } of SECTION_PATTERNS) {
        re.lastIndex = 0;
        let s;
        while ((s = re.exec(text)) !== null) {
          push({ rel, line: lineOf(text, s.index), rule, detail: snippet(text, s.index) });
        }
      }
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

// Regla 4: los defaults de horario deben ser opciones del buscador (TIME_OPTIONS).
const HERO_FILE = join('src', 'lib', 'components', 'HeroSearch.svelte');

/** Opciones de hora del buscador (fuente de verdad de los horarios). */
function timeOptions() {
  const src = readFileSync(join(ROOT, HERO_FILE), 'utf8');
  const arr = src.match(/const TIME_OPTIONS\s*=\s*\[([\s\S]*?)\]/);
  if (!arr) return null;
  const times = [...arr[1].matchAll(/['"](\d{2}:\d{2})['"]/g)].map((m) => m[1]);
  return times.length > 0 ? times : null;
}

try {
  const times = timeOptions();
  if (!times) {
    push({
      rel: rel(HERO_FILE),
      line: 1,
      rule: 'TIME_OPTIONS ilegible',
      detail: 'No se encontró el array TIME_OPTIONS en src/lib/components/HeroSearch.svelte'
    });
  } else {
    const allowed = new Set(times);
    const found = [];
    for (const [file, re] of [
      [SCHEMA_FILE, /(pickupTime|returnTime)\s+String\s+@default\("([^"]*)"\)/g],
      [API_FILE, /(pickupTime|returnTime)\s*=\s*'([^']+)'/g]
    ]) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      for (const m of text.matchAll(re)) {
        found.push({ rel: rel(file), line: lineOf(text, m.index), name: m[1], value: m[2] });
      }
    }

    for (const file of [SCHEMA_FILE, API_FILE]) {
      for (const name of ['pickupTime', 'returnTime']) {
        if (!found.some((d) => d.rel === rel(file) && d.name === name)) {
          push({
            rel: rel(file),
            line: 1,
            rule: `default de ${name} ausente`,
            detail: `No se encontró un default de ${name} en ${rel(file)}`
          });
        }
      }
    }

    for (const d of found) {
      if (!allowed.has(d.value)) {
        push({
          rel: d.rel,
          line: d.line,
          rule: `default de ${d.name} ∉ TIME_OPTIONS`,
          detail: `default: "${d.value}" | TIME_OPTIONS: ${times.join(' ')}`
        });
      }
    }
  }
} catch (err) {
  push({
    rel: rel(HERO_FILE),
    line: 1,
    rule: 'regla 4 ilegible',
    detail: err.message
  });
}

// Regla 5: integridad de PICKUP_LOCATIONS (sin duplicados, sin vacíos y con
// cada <select> de lugar del buscador mostrando exactamente esos elementos).

/** Constantes literales de contact.ts, incluidas las derivadas con .split()[n]. */
function contactConstants() {
  const src = readFileSync(join(ROOT, CONTACT_FILE), 'utf8');
  const map = new Map();
  for (const m of src.matchAll(/export const (\w+)\s*=\s*['"]([^'"]*)['"]/g)) {
    map.set(m[1], m[2]);
  }
  for (const m of src.matchAll(/export const (\w+)\s*=\s*(\w+)\.split\(\s*['"]([^'"]*)['"]\s*\)\s*\[\s*(\d+)\s*\]/g)) {
    const base = map.get(m[2]);
    if (base !== undefined) map.set(m[1], base.split(m[3])[Number(m[4])] ?? '');
  }
  return map;
}

/** Valor real de un elemento de la lista: quita las comillas y resuelve ${CONST}. */
function elementValue(raw, consts) {
  const quote = raw[0];
  let value = raw;
  if (raw.length >= 2 && (quote === "'" || quote === '"' || quote === '`') && raw.endsWith(quote)) {
    value = raw.slice(1, -1);
  }
  return value.replace(/\$\{(\w+)\}/g, (whole, name) => (consts.has(name) ? consts.get(name) : whole));
}

/** Misma normalización que locationKey() de src/lib/data/fleet.ts. */
function locationKey(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

try {
  const fleetSrc = readFileSync(join(ROOT, FLEET_FILE), 'utf8');
  const arrIdx = fleetSrc.search(/export const PICKUP_LOCATIONS\s*=\s*\[/);
  const arr =
    arrIdx >= 0
      ? fleetSrc.slice(arrIdx).match(/export const PICKUP_LOCATIONS\s*=\s*\[([\s\S]*?)\]/)
      : null;
  const items = arr
    ? [...arr[1].matchAll(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0])
    : null;

  // Si el array no se puede leer, la regla 3 ya reporta "PICKUP_LOCATIONS
  // ilegible"; aquí se omite para no encadenar errores derivados.
  if (items && items.length > 0) {
    const consts = contactConstants();
    const byKey = new Map();
    let cursor = arrIdx;

    items.forEach((raw, index) => {
      const at = fleetSrc.indexOf(raw, cursor);
      const line = at >= 0 ? lineOf(fleetSrc, at) : lineOf(fleetSrc, arrIdx);
      if (at >= 0) cursor = at + raw.length;

      const value = elementValue(raw, consts);
      if (!value.trim()) {
        push({
          rel: rel(FLEET_FILE),
          line,
          rule: 'PICKUP_LOCATIONS con elemento vacío',
          detail: `índice ${index}: ${raw}`
        });
        return;
      }

      const key = locationKey(value);
      const first = byKey.get(key);
      if (first) {
        push({
          rel: rel(FLEET_FILE),
          line,
          rule: 'PICKUP_LOCATIONS con duplicados',
          detail: `"${value}" repite "${first.value}" (índices ${first.index} y ${index}): locationKey() los hace indistinguibles para normalizePickupLocation()`
        });
      } else {
        byKey.set(key, { index, value });
      }
    });

    // Opciones de ubicación que muestra el buscador, por cada select de lugar:
    //   each(PICKUP_LOCATIONS) × N + <option> literales  ===  N
    const heroSrc = readFileSync(join(ROOT, HERO_FILE), 'utf8');
    const selectRe = /<select[^>]*bind:value=\{booking\.(pickupPlace|returnPlace)\}[^>]*>([\s\S]*?)<\/select>/g;
    const selects = new Map();
    for (const m of heroSrc.matchAll(selectRe)) {
      if (!selects.has(m[1])) selects.set(m[1], m);
    }

    for (const name of ['pickupPlace', 'returnPlace']) {
      const sel = selects.get(name);
      if (!sel) {
        push({
          rel: rel(HERO_FILE),
          line: 1,
          rule: `select de ${name} ausente en el buscador`,
          detail: `No se encontró <select bind:value={booking.${name}}> en src/lib/components/HeroSearch.svelte`
        });
        continue;
      }

      const body = sel[2];
      const eachBlocks = (body.match(/\{#each PICKUP_LOCATIONS\s+as\s+\w+/g) || []).length;
      const literalOptions = (body.match(/<option[^>]*value=["'][^"']*["']/g) || []).length;
      const shown = eachBlocks * items.length + literalOptions;
      if (shown !== items.length) {
        push({
          rel: rel(HERO_FILE),
          line: lineOf(heroSrc, sel.index),
          rule: `select de ${name} ≠ PICKUP_LOCATIONS`,
          detail: `muestra ${shown} opciones de lugar y PICKUP_LOCATIONS tiene ${items.length} (each de PICKUP_LOCATIONS: ${eachBlocks}, <option> literales: ${literalOptions})`
        });
      }
    }
  }
} catch (err) {
  push({
    rel: rel(FLEET_FILE),
    line: 1,
    rule: 'regla 5 ilegible',
    detail: err.message
  });
}

// Regla 7: index.html debe ser exactamente lo que genera el template con
// sections.ts + contact.ts (si no, o falta, hay que ejecutar generate:index).
try {
  const { renderIndex } = await import('./generate-static-index.mjs');
  const expected = renderIndex();
  let actual;
  try {
    actual = readFileSync(join(ROOT, 'index.html'), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('index.html no existe → npm run generate:index');
    throw err;
  }
  if (actual !== expected) {
    const a = actual.split('\n');
    const b = expected.split('\n');
    let line = 1;
    while (line < Math.min(a.length, b.length) && a[line - 1] === b[line - 1]) line++;
    push({
      rel: 'index.html',
      line,
      rule: 'index.html desincronizado',
      detail: `primera diferencia en la línea ${line} (index.html: ${a.length} líneas | generado: ${b.length}) → npm run generate:index`
    });
  }
} catch (err) {
  push({
    rel: 'index.template.html',
    line: 1,
    rule: 'index.html ilegible',
    detail: err.message
  });
}

// Regla 9: la migración de normalización debe apuntar a PICKUP_LOCATIONS
// (si la lista cambia de orden o de valores, sus literales quedan obsoletos).
const MIGRATION_FILE = join(
  'prisma',
  'migrations',
  '20261004210000_normalize_pickup_return_locations',
  'migration.sql'
);

try {
  const fleetSrc = readFileSync(join(ROOT, FLEET_FILE), 'utf8');
  const arr = fleetSrc.match(/export const PICKUP_LOCATIONS\s*=\s*\[([\s\S]*?)\]/);
  const consts = contactConstants();
  const list = arr
    ? [...arr[1].matchAll(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map((m) =>
        elementValue(m[0], consts)
      )
    : null;

  if (!list || list.length === 0) {
    push({
      rel: rel(FLEET_FILE),
      line: 1,
      rule: 'PICKUP_LOCATIONS ilegible (regla 9)',
      detail: 'No se pudo leer el array para validar la migración'
    });
  } else {
    const sql = readFileSync(join(ROOT, MIGRATION_FILE), 'utf8');

    // Pares (old, canonical) dentro del CTE legacy de la migración.
    const start = sql.indexOf('WITH legacy');
    const end = sql.indexOf('norm (key, canonical)');
    if (start < 0 || end <= start) {
      throw new Error('No se encontró el CTE legacy(...) en migration.sql');
    }
    const pairs = [...sql.slice(start, end).matchAll(/\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g)];
    if (pairs.length === 0) {
      throw new Error('El CTE legacy de migration.sql no contiene pares (old, canonical)');
    }
    for (const p of pairs) {
      if (!list.includes(p[2])) {
        push({
          rel: rel(MIGRATION_FILE),
          line: lineOf(sql, start + p.index),
          rule: 'migración: canónico fuera de PICKUP_LOCATIONS',
          detail: `"${p[2]}" (destino de "${p[1]}") no es un valor de PICKUP_LOCATIONS`
        });
      }
    }

    // Literales DEFAULT de los dos coalesce(np|nr).canonical.
    const defaults = [...sql.matchAll(/coalesce\(\s*n[pr]\.canonical,\s*'([^']+)'\s*\)/g)];
    if (defaults.length === 0) {
      throw new Error('No se encontró ningún coalesce(n*.canonical, DEFAULT) en migration.sql');
    }
    for (const d of defaults) {
      if (d[1] !== list[0]) {
        push({
          rel: rel(MIGRATION_FILE),
          line: lineOf(sql, d.index),
          rule: 'migración: DEFAULT ≠ primer elemento de PICKUP_LOCATIONS',
          detail: `DEFAULT: "${d[1]}" | PICKUP_LOCATIONS[0]: "${list[0]}"`
        });
      }
    }
  }
} catch (err) {
  push({
    rel: rel(MIGRATION_FILE),
    line: 1,
    rule: 'migración ilegible',
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
  if (errors.some((e) => e.rule.includes('PICKUP_LOCATIONS[0]') || e.rule.includes('default de pickupLocation'))) {
    console.error('Si el error es un default de ubicación, alínialo con PICKUP_LOCATIONS[0] de src/lib/data/fleet.ts.');
  }
  if (errors.some((e) => e.rule.includes('TIME_OPTIONS') || e.rule.includes('Time'))) {
    console.error('Si el error es un default de horario, usa una hora de TIME_OPTIONS de src/lib/components/HeroSearch.svelte.');
  }
  if (errors.some((e) => e.rule.includes('duplic') || e.rule.includes('vacío') || e.rule.includes('select de') || e.rule.includes('PICKUP_LOCATIONS ilegible'))) {
    console.error('Revisa la lista PICKUP_LOCATIONS de src/lib/data/fleet.ts y los <select> de lugar de HeroSearch.svelte.');
  }
  if (errors.some((e) => e.rule.includes('sección'))) {
    console.error('Los enlaces e ids de sección deben salir de src/lib/data/sections.ts (SECTIONS / SECTION.id / SECTION.href).');
  }
  if (errors.some((e) => e.rule.includes('index.html'))) {
    console.error('Regenera la landing estática con: npm run generate:index');
  }
  if (errors.some((e) => e.rule.includes('dirección'))) {
    console.error('La dirección vive en src/lib/data/contact.ts (OFFICE_*); en la landing estática usa {{OFFICE_*}} en index.template.html.');
  }
  if (errors.some((e) => e.rule.includes('migración'))) {
    console.error('Si PICKUP_LOCATIONS cambió, actualiza los pares y el DEFAULT de prisma/migrations/20261004210000_normalize_pickup_return_locations/migration.sql.');
  }
  process.exit(1);
}

console.log(`✓ Guardia de contacto OK: ${scanned} archivos revisados, ${phones.length} teléfonos vigilados en ${CONTACT_FILE}.`);
console.log('  Defaults de ubicación (schema.prisma + API) = PICKUP_LOCATIONS[0].');
console.log('  Defaults de horario (schema.prisma + API) ∈ TIME_OPTIONS del buscador.');
console.log('  PICKUP_LOCATIONS íntegra: sin duplicados ni vacíos y sincronizada con el buscador.');
console.log('  Enlaces e ids de sección → sin literales en src/ fuera de sections.ts.');
console.log('  index.html = index.template.html con secciones de sections.ts y contacto de contact.ts.');
console.log('  Dirección de oficina → solo en contact.ts (e index.html generado).');
console.log('  Migración de normalización → canónicos ∈ PICKUP_LOCATIONS y DEFAULT = [0].');
