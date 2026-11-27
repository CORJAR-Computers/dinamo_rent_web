#!/usr/bin/env node
/**
 * Preflight de la sesión de certificación Evertec (docs/RUNBOOK_SESION_CERTIFICACION.md §1).
 *
 * Comprueba, contra el despliegue real:
 *   1. que el SHA desplegado en Production es el que se va a certificar;
 *   2. que la home responde;
 *   3. que el login de administrador funciona (200 + cookie);
 *   4. que el checkout que abre el pago es el de sandbox (host de PlacetoPay);
 *   5. que se puede crear y cancelar una reserva desechable;
 *   6. que el webhook existe y rechaza una firma inválida con 401;
 *   7. que hay una notificación entrante real registrada en `SyncLog`
 *      (`[Webhook Evertec]`), si se pasa `SYNC_TOKEN` para leer `/api/sync`.
 *
 * Uso:
 *   ADMIN_PASSWORD=... SYNC_TOKEN=... node scripts/preflight-certificacion.mjs
 *   node scripts/preflight-certificacion.mjs --base http://127.0.0.1:5173 --expected-sha local
 *
 * Opciones:
 *   --base <url>            Base a probar (por defecto, producción).
 *   --expected-sha <sha>    SHA que debería estar desplegado (por defecto, HEAD local).
 *   --keep                  No cancela la reserva desechable (solo para depurar).
 *
 * Efectos: crea una reserva real (y un `Customer` con documento sintético) y la deja
 * CANCELADA; consume 1 de las 15 reservas/10 min y 1 de las 8 sesiones de pago/10 min.
 * Sin `ADMIN_PASSWORD` no crea nada: no se deja una reserva que no se pueda cancelar.
 * La comprobación del webhook solo envía una firma inválida: se rechaza antes de tocar
 * la base, así que no escribe nada.
 *
 * Código de salida: 0 todo en verde · 1 alguna en rojo · 2 sin rojos pero incompleto
 * (alguna comprobación omitida). No usa dependencias: Node 24 con `fetch` global.
 */

import { execFileSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const BASE = String(args.base || 'https://dinamo-rent-a-car.vercel.app').replace(/\/+$/, '');
const EXPECTED_SHA = String(args['expected-sha'] || localSha() || '');
const KEEP = Boolean(args.keep);
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const SYNC_TOKEN = process.env.SYNC_TOKEN || process.env.DESKTOP_SYNC_TOKEN || '';
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;

const rows = [];
const add = (check, status, detail) => {
  rows.push({ check, status, detail });
  return status;
};

/** Estado de cada comprobación. `OMITIDO` no es un fallo: es algo que aquí no se puede ver. */
const pass = (c, d) => add(c, 'VERDE', d);
const fail = (c, d) => add(c, 'ROJO', d);
const skip = (c, d) => add(c, 'OMITIDO', d);

async function main() {
  await checkDeployment();

  const homeStatus = await httpStatus(`${BASE}/`);
  if (homeStatus === 200) pass('Home responde', 'GET / → 200');
  else fail('Home responde', `GET / → ${homeStatus}`);

  await checkWebhookSignature();
  await checkInboundNotification();

  const cookie = await checkLogin();
  const reservation = cookie ? await checkCheckoutSandbox() : skipCheckout();
  if (cookie) {
    await checkCancel(cookie, reservation);
  } else {
    skip('Reserva desechable', 'sin sesión admin: no se crea lo que no se puede cancelar');
    skip('Cancelación', 'sin sesión admin');
  }

  printReport();
}

/* -------------------------------- 1. SHA -------------------------------- */

async function checkDeployment() {
  const repo = repoSlug();
  if (!repo) {
    skip('SHA desplegado', 'no se pudo leer el remoto de GitHub (git remote)');
    return;
  }
  if (!commandExists('gh')) {
    skip('SHA desplegado', '`gh` no está disponible; compara a mano en Vercel');
    return;
  }

  let sha;
  try {
    sha = execFileSync(
      'gh',
      ['api', `repos/${repo}/deployments?environment=Production&per_page=1`, '--jq', '.[0].sha'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  } catch {
    skip('SHA desplegado', '`gh` sin autenticación o deployment no accesible');
    return;
  }

  if (!sha) {
    skip('SHA desplegado', 'GitHub no devolvió ningún deployment de Production');
    return;
  }

  if (!EXPECTED_SHA) {
    pass('SHA desplegado', `${sha.slice(0, 7)} (sin SHA esperado para comparar)`);
    return;
  }

  if (sha === EXPECTED_SHA) {
    pass('SHA desplegado', `${sha.slice(0, 7)} = esperado`);
    return;
  }

  const ancestor = isAncestor(sha, EXPECTED_SHA);
  fail(
    'SHA desplegado',
    `${sha.slice(0, 7)} ≠ esperado ${EXPECTED_SHA.slice(0, 7)}${
      ancestor ? ' (el desplegado es anterior: falta desplegar)' : ''
    }`
  );
}

/* --------------------- 1.b Webhook y notificación entrante --------------------- */

/**
 * El endpoint es público, pero debe rechazar cualquier notificación sin firma
 * válida. Un 401 prueba que la ruta está desplegada y que `P2P_TRAN_KEY` existe;
 * un 500 delata la variable ausente y un 200 sería un agujero.
 */
async function checkWebhookSignature() {
  const res = await request('/api/webhooks/placetopay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: `preflight-${Date.now()}`,
      status: { status: 'APPROVED', date: new Date().toISOString() },
      signature: '0'.repeat(40),
    }),
  });

  if (res.status === 401) {
    pass('Webhook exige firma', '401 con firma inválida (ruta pública y P2P_TRAN_KEY presente)');
  } else if (res.status === 500) {
    fail('Webhook exige firma', '500: falta P2P_TRAN_KEY en el despliegue');
  } else {
    fail('Webhook exige firma', `${res.status}: no rechazó una firma inválida — no se empieza así`);
  }
}

/**
 * Evidencia de una notificación REAL de Evertec: una línea `[Webhook Evertec]` en
 * `SyncLog`. Se lee por `/api/sync` (últimas 10 líneas) con el token del mostrador,
 * porque el preflight no tiene acceso a la base. Si no hay token o no hay línea, se
 * omite con la instrucción exacta: eso no es un fallo del script.
 */
async function checkInboundNotification() {
  if (!SYNC_TOKEN) {
    skip(
      'Notificación entrante',
      'define SYNC_TOKEN (o DESKTOP_SYNC_TOKEN) para leer /api/sync; ver runbook §4, «Notificación entrante real»'
    );
    return;
  }

  const res = await request('/api/sync', { headers: { Authorization: `Bearer ${SYNC_TOKEN}` } });
  const recent = Array.isArray(res.json?.recent) ? res.json.recent : null;

  if (res.status !== 200 || !recent) {
    skip('Notificación entrante', `/api/sync respondió ${res.status}: no se pudo leer SyncLog`);
    return;
  }

  const webhooks = recent.filter((row) => String(row?.message || '').startsWith('[Webhook Evertec]'));
  if (!webhooks.length) {
    skip(
      'Notificación entrante',
      'ninguna en los últimos 10 SyncLog: paga una sesión nueva o pide reenvío (runbook §4, «Notificación entrante real»)'
    );
    return;
  }

  const latest = webhooks[0];
  const when = new Date(latest.createdAt);
  const ageMin = Number.isFinite(when.getTime())
    ? Math.round((Date.now() - when.getTime()) / 60000)
    : null;
  const requestId = latest.payload?.requestId || 'sin requestId';

  pass(
    'Notificación entrante',
    `«${latest.message}» · ${requestId}${ageMin === null ? '' : ` · hace ${ageMin} min`}`
  );
}

/* ------------------------------- 2. Login ------------------------------- */

async function checkLogin() {
  if (!PASSWORD) {
    skip('Login admin', 'ADMIN_PASSWORD no está en el entorno de este proceso');
    return null;
  }

  const res = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });

  if (res.status === 200) {
    const cookie = res.cookies.find((c) => c.startsWith('dinamo_admin_session='));
    if (!cookie) {
      fail('Login admin', '200 pero sin cookie dinamo_admin_session');
      return null;
    }
    pass('Login admin', '200 + cookie dinamo_admin_session');
    return cookie.split(';')[0];
  }

  if (res.status === 401) fail('Login admin', '401: contraseña incorrecta (consume 1 de 5 intentos)');
  else if (res.status === 429) fail('Login admin', `429: IP bloqueada, reintentar en ${res.headers['retry-after'] || '?'} s`);
  else if (res.status === 503) fail('Login admin', '503: el servidor no tiene ADMIN_PASSWORD/ADMIN_SECRET');
  else fail('Login admin', `${res.status}: ${res.text.slice(0, 120)}`);

  return null;
}

/* --------------------- 3. Reserva, checkout y cancelación --------------------- */

function skipCheckout() {
  skip('Checkout en sandbox', 'sin sesión admin');
  return null;
}

async function checkCheckoutSandbox() {
  const vehicles = await request('/api/vehicles');
  const vehicle = vehicles.json?.vehicles?.[0];
  if (!vehicle) {
    skip('Checkout en sandbox', 'no se pudo leer un vehículo disponible');
    return null;
  }

  // Fechas lejanas: no bloquean unidades de una reserva real y el solapamiento se
  // resuelve con `available` + el error 409 del endpoint.
  const pickup = isoDate(addDays(new Date(), 200));
  const ret = isoDate(addDays(new Date(), 203));
  const doc = `9${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;

  const created = await request('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vehicleId: vehicle.id,
      pickupDate: pickup,
      returnDate: ret,
      pickupTime: '10:00',
      returnTime: '10:00',
      customerName: 'PREFLIGHT',
      customerLastname: 'Certificacion',
      customerEmail: `preflight+${Date.now()}@dinamo.test`,
      customerPhone: '3000000000',
      customerIdType: 'CC',
      customerIdNumber: doc,
      insurancePlan: 'TOTAL',
      extras: {},
      notes: 'Reserva desechable del preflight de certificación; se cancela en el acto.',
    }),
  });

  if (created.status !== 200 || !created.json?.ok) {
    fail('Reserva desechable', `${created.status}: ${created.json?.error || created.text.slice(0, 120)}`);
    return null;
  }

  const reservation = created.json.reservation;
  pass('Reserva desechable', `${reservation.code} (${pickup} → ${ret})`);

  const session = await request('/api/payments/create-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservationId: reservation.id }),
  });

  const processUrl = session.json?.processUrl;
  if (!processUrl) {
    fail('Checkout en sandbox', `${session.status}: sin processUrl (${JSON.stringify(session.json).slice(0, 120)})`);
    return reservation;
  }

  let host = '';
  try {
    host = new URL(processUrl).host;
  } catch {
    /* host queda vacío */
  }

  if (host === 'checkout-test.placetopay.com') {
    pass('Checkout en sandbox', `processUrl en ${host}`);
  } else if (host === 'checkout.placetopay.com') {
    fail('Checkout en sandbox', `processUrl en ${host} — P2P_ENV=prod: NO es una sesión de pruebas`);
  } else {
    fail('Checkout en sandbox', `host inesperado: ${host || processUrl}`);
  }

  // El aviso «Modo de pruebas / No habrá afectación monetaria» lo pinta el checkout
  // de PlacetoPay. Si es una SPA, el HTML servido no lo trae: eso es OMITIDO, no ROJO.
  const checkout = await request(processUrl, {}, 20000);
  if (checkout.status !== 200) {
    skip('Aviso de pruebas en checkout', `el checkout respondió ${checkout.status}; ábrelo a mano`);
  } else if (/afectaci[oó]n monetaria|modo de pruebas/i.test(checkout.text)) {
    pass('Aviso de pruebas en checkout', 'texto de sandbox presente en el HTML');
  } else {
    skip('Aviso de pruebas en checkout', 'no aparece en el HTML: lo renderiza el checkout SPA, ábrelo a mano');
  }

  return reservation;
}

async function checkCancel(cookie, reservation) {
  if (!reservation) return;

  if (KEEP) {
    skip('Cancelación', `--keep: la reserva ${reservation.code} queda viva a propósito`);
    return;
  }

  const deleted = await request(`/api/reservations/${reservation.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie, Origin: BASE },
  });

  if (deleted.status !== 200) {
    fail('Cancelación', `${deleted.status}: cancela a mano ${reservation.code}`);
    return;
  }

  const check = await request(`/api/reservations/${reservation.id}`, { headers: { Cookie: cookie } });
  const status = check.json?.reservation?.status;

  if (status === 'CANCELADA') pass('Cancelación', `${reservation.code} quedó CANCELADA`);
  else fail('Cancelación', `${reservation.code} sigue en ${status || 'estado desconocido'}`);
}

/* -------------------------------- helpers -------------------------------- */

async function request(path, init = {}, timeoutMs = 15000) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'dinamo-preflight/1.0', ...(init.headers || {}) },
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* respuesta no JSON */
    }
    const headers = Object.fromEntries(res.headers.entries());
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    return { status: res.status, text, json, headers, cookies };
  } catch (err) {
    return { status: 0, text: (err && err.message) || 'error de red', json: null, headers: {}, cookies: [] };
  }
}

function httpStatus(url) {
  return request(url).then((r) => r.status);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function repoSlug() {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
    return match ? `${match[1]}/${match[2]}` : '';
  } catch {
    return '';
  }
}

function localSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function commandExists(cmd) {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const STATUS_WIDTH = 7;

function padStatus(status) {
  const text = status.padEnd(STATUS_WIDTH);
  if (!COLOR) return text;
  const code = status === 'VERDE' ? 32 : status === 'ROJO' ? 31 : 33;
  return `\x1b[${code}m${text}\x1b[0m`;
}

function printReport() {
  const checkWidth = Math.max(...rows.map((r) => r.check.length), 'Comprobación'.length);

  console.log(`\nPreflight de certificación — ${BASE}`);
  console.log(`${'Comprobación'.padEnd(checkWidth)}  ${'Estado'.padEnd(STATUS_WIDTH)}  Detalle`);
  console.log(`${'-'.repeat(checkWidth)}  ${'-'.repeat(STATUS_WIDTH)}  ${'-'.repeat(40)}`);
  for (const row of rows) {
    console.log(`${row.check.padEnd(checkWidth)}  ${padStatus(row.status)}  ${row.detail}`);
  }

  const red = rows.filter((r) => r.status === 'ROJO').length;
  const skipped = rows.filter((r) => r.status === 'OMITIDO').length;
  console.log(
    `\n${rows.length - red - skipped} en verde, ${red} en rojo, ${skipped} omitidas.` +
      (red
        ? ' No se empieza la sesión con un rojo.'
        : skipped
          ? ' Preflight incompleto: las omitidas hay que mirarlas a mano.'
          : '')
  );
  console.log(
    '\nNo verifica: el contenido del checkout (si es SPA), la tokenización ni los cinco\n' +
      'escenarios, que la URL esté registrada en la cuenta de Evertec ni que la\n' +
      'notificación venga de ellos (solo rechaza firmas inválidas y lee lo que ya haya\n' +
      'en `/api/sync`), los límites por IP del analista, ni que el build sea el\n' +
      'certificado cuando no hay `gh` autenticado para leer el deployment.'
  );

  process.exitCode = red ? 1 : skipped ? 2 : 0;
}

main().catch((err) => {
  console.error('Preflight interrumpido:', err);
  process.exitCode = 1;
});
