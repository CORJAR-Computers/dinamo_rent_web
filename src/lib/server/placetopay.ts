import crypto from 'node:crypto';
import { normalizeDocType } from '#lib/utils/documentValidation.js';

export interface P2PAuth {
  login: string;
  tranKey: string;
  nonce: string;
  seed: string;
}

export interface P2PSessionRequest {
  reference: string;
  description: string;
  /** Total a cobrar, con IVA incluido. */
  amountCOP: number;
  /** Base gravable (valor sin IVA). Si se envía, se declara el IVA 19% en `payment.amount.taxes`. */
  taxBaseCOP?: number;
  customer: {
    names: string;
    lastnames: string;
    email: string;
    phone: string;
    docType: string;
    docNumber: string;
  };
  returnUrl: string;
  ipAddress?: string;
  userAgent?: string;
  /** Habilita tokenización de tarjeta (suscripción) para garantía de alquiler */
  enableSubscription?: boolean;
}

export interface P2PSessionResult {
  ok: boolean;
  requestId?: string;
  processUrl?: string;
  statusMessage?: string;
  error?: string;
}

export interface P2PStatusResult {
  ok: boolean;
  requestId: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  message: string;
  reference?: string;
  cardBrand?: string;
  cardLast4?: string;
  authorization?: string;
  // Información de suscripción y tokenización de tarjeta para garantía
  token?: string;
  tokenStatus?: string;
  tokenValidUntil?: string;
  tokenFranchise?: string;
  /**
   * Sesión de tokenización sin cobro (suscripción pura): no existe `payment`
   * en la respuesta. Permite guardar el token sin marcar el pago como aprobado.
   */
  subscriptionOnly?: boolean;
}

export interface P2PCollectRequest {
  token: string;
  reference: string;
  description: string;
  amountCOP: number;
  customer: {
    names: string;
    lastnames: string;
    email: string;
    phone: string;
    docType: string;
    docNumber: string;
  };
  ipAddress?: string;
  userAgent?: string;
}

export interface P2PSubscriptionRequest {
  reference: string;
  description: string;
  customer: {
    names: string;
    lastnames: string;
    email: string;
    phone: string;
    docType: string;
    docNumber: string;
  };
  returnUrl: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface P2PInvalidateResult {
  ok: boolean;
  message: string;
}

export interface P2PCollectResult {
  ok: boolean;
  /**
   * `PENDING` = la pasarela no emitió veredicto (timeout, error de red o
   * configuración incompleta): no es un rechazo del emisor y no debe contar
   * como intento fallido para la invalidación automática del token.
   */
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  message: string;
  reference: string;
  amountCOP: number;
  authorization?: string;
  receipt?: string;
  franchise?: string;
  lastDigits?: string;
  requestId?: string;
  error?: string;
}

interface P2PEnvConfig {
  login: string;
  tranKey: string;
  baseUrl: string;
  collectUrl: string;
  invalidateUrl: string;
}

/**
 * Configuración de la pasarela.
 *
 * En producción (`P2P_ENV=prod`) no hay credenciales por defecto: si falta
 * `P2P_LOGIN` o `P2P_TRAN_KEY` se devuelve `{ error }` para que cada llamador
 * falle cerrado, en lugar de enviar peticiones con credenciales de sandbox.
 */
function getEnvConfig(): P2PEnvConfig | { error: string } {
  const isProd = (process.env.P2P_ENV || 'test') === 'prod';

  let login = process.env.P2P_LOGIN;
  let tranKey = process.env.P2P_TRAN_KEY;

  if (isProd) {
    if (!login || !tranKey) {
      return {
        error:
          'Configuración de pasarela incompleta: P2P_LOGIN y P2P_TRAN_KEY son obligatorias cuando P2P_ENV=prod',
      };
    }
  } else {
    login = login || 'dinamo_rent_sandbox';
    tranKey = tranKey || 'dinamo_secret_test_key';
  }

  const host = isProd
    ? 'https://checkout.placetopay.com'
    : 'https://checkout-test.placetopay.com';

  return {
    login,
    tranKey,
    baseUrl: `${host}/api/session`,
    collectUrl: `${host}/api/collect`,
    invalidateUrl: `${host}/api/instrument/invalidate`,
  };
}

/**
 * Simulador local de la pasarela.
 *
 * Se habilita únicamente en desarrollo o test y con el flag explícito
 * `P2P_MOCK=true`. En producción jamás se activa, ni siquiera si el flag
 * viaja por error: un fallo de Evertec no puede convertirse en un pago
 * aprobado ficticio. Un `NODE_ENV` ausente se trata como producción.
 */
export function isMockEnabled(): boolean {
  const env = process.env.NODE_ENV || 'production';
  return (env === 'development' || env === 'test') && process.env.P2P_MOCK === 'true';
}

// La vigencia del token se evalúa en `$lib/utils/tokenValidity` para que el
// panel de administración aplique exactamente el mismo criterio. Se reexporta
// aquí porque es la puerta de entrada histórica del resto del servidor.
export { isTokenExpired } from '#lib/utils/tokenValidity.js';

/**
 * Genera la autenticación de Place to Pay (Evertec) según su especificación:
 * SHA256(rawNonce + seed + tranKey) codificado en Base64.
 */
function generateAuth(login: string, secretKey: string): P2PAuth {
  const seed = new Date().toISOString();
  const rawNonce = crypto.randomBytes(16);
  const nonce = rawNonce.toString('base64');

  const hash = crypto.createHash('sha256');
  hash.update(rawNonce);
  hash.update(seed);
  hash.update(secretKey);
  const tranKey = hash.digest('base64');

  return { login, tranKey, nonce, seed };
}

/**
 * Helper para extraer valores del array de instrumentos devuelto por Evertec
 * Ejemplo: [{ keyword: "token", value: "abc..." }, { keyword: "last_digits", value: "4242" }]
 */
function extractInstrumentValue(
  instruments: Array<{ keyword?: string; value?: string }> | Record<string, unknown> | undefined,
  targetKeyword: string
): string | undefined {
  if (!instruments) return undefined;
  if (Array.isArray(instruments)) {
    const item = instruments.find(
      (i) => i.keyword?.toLowerCase() === targetKeyword.toLowerCase()
    );
    return item?.value;
  }
  if (typeof instruments === 'object' && targetKeyword in instruments) {
    return String((instruments as Record<string, unknown>)[targetKeyword]);
  }
  return undefined;
}

/**
 * Limpia nombres y apellidos según los requisitos de certificación de Evertec:
 * solo letras, espacios, tildes y Ñ.
 */
function sanitizeName(val: string): string {
  return val.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').trim();
}

/** Móvil/teléfono: solo dígitos (máx. 10 dígitos locales de Colombia). */
function sanitizePhone(val: string): string {
  return val.replace(/\D/g, '').slice(-10);
}

/**
 * Normaliza el texto que viaja a la pasarela en `*.description`.
 *
 * PlacetoPay valida `description` con un conjunto restringido de caracteres y
 * una longitud máxima. El guion largo (—), las comillas tipográficas, los
 * saltos de línea o las tildes pueden provocar un error de validación en
 * `/api/collect` (el campo viajaba antes tal cual desde el panel de
 * administración). Aquí se convierte a ASCII imprimible, se colapsan espacios
 * y se acota la longitud. La versión saneada es la que se envía y la que se
 * persiste en `deposit_charges.description` para auditoría del cargo: el texto
 * original del panel no se guarda en ningún campo.
 */
export function sanitizeGatewayText(val: unknown, maxLength = 200): string {
  return String(val ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^\x20-\x7e]/g, ' ')
    // Solo caracteres conservadores. PlacetoPay documentó soporte para #, %,
    // &, @, [] y otros en `*.description` de /api/session, pero no garantiza lo
    // mismo en /api/collect: se excluyen para no reintroducir el error.
    .replace(/[^A-Za-z0-9 .,()_:/+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

/**
 * Crea una sesión de pago con tokenización en Place to Pay (Evertec).
 * La suscripción se pide con `payment.subscribe: true` (no con el bloque raíz
 * `subscription`, que la pasarela rechaza cuando hay cobro y suscripción a la vez).
 */
export async function createPaymentSession(
  req: P2PSessionRequest
): Promise<P2PSessionResult> {
  // Simulador local: solo en desarrollo/test con P2P_MOCK=true (ver isMockEnabled).
  if (isMockEnabled()) {
    const mockRequestId = `P2P-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const returnUrlWithParams = new URL(req.returnUrl);
    returnUrlWithParams.searchParams.set('requestId', mockRequestId);
    returnUrlWithParams.searchParams.set('reference', req.reference);

    return {
      ok: true,
      requestId: mockRequestId,
      processUrl: returnUrlWithParams.toString(),
      statusMessage: 'Sesión generada en modo Sandbox Dinamo Rent (Pago + Suscripción Tokenizada)',
    };
  }

  const config = getEnvConfig();
  if ('error' in config) {
    return { ok: false, error: config.error };
  }
  const { login, tranKey, baseUrl } = config;

  const auth = generateAuth(login, tranKey);
  // Según guía de certificación Webcheckout Evertec (pág. 3):
  // El tiempo de expiración debe estar parametrizado entre 10 a 30 minutos.
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + 25); // 25 minutos de vigencia

  const cleanNames = sanitizeName(req.customer.names) || 'Cliente';
  const cleanLastnames = sanitizeName(req.customer.lastnames) || 'Dinamo';
  const cleanPhone = sanitizePhone(req.customer.phone) || '3000000000';
  const cleanDescription =
    sanitizeGatewayText(req.description, 200) || 'Alquiler de vehiculo Dinamo Rent';

  // IVA 19%: se declara solo si la base es válida y menor que el total. Así una reserva
  // antigua (creada antes de sumar IVA, donde base = total) no envía un impuesto en cero.
  const taxBase =
    typeof req.taxBaseCOP === 'number' &&
    req.taxBaseCOP > 0 &&
    req.taxBaseCOP < req.amountCOP
      ? req.taxBaseCOP
      : undefined;

  // En Evertec PlacetoPay: cuando se procesa un pago con tokenización de tarjeta simultánea,
  // la directiva oficial es `payment.subscribe: true`. No se debe enviar el bloque raíz `subscription`
  // al mismo tiempo para evitar el conflicto "No se puede realizar un pago y una subscripción al mismo tiempo".
  const shouldSubscribe = req.enableSubscription !== false;

  const payload: Record<string, unknown> = {
    auth,
    locale: 'es_CO',
    buyer: {
      name: cleanNames,
      surname: cleanLastnames,
      email: req.customer.email.trim(),
      mobile: cleanPhone,
      documentType: normalizeDocType(req.customer.docType),
      document: req.customer.docNumber.trim(),
    },
    payment: {
      reference: req.reference,
      description: cleanDescription,
      amount: {
        currency: 'COP',
        total: req.amountCOP,
        // Desglose de impuestos exigido por Evertec: IVA 19% sobre la base gravable.
        ...(taxBase !== undefined
          ? {
              taxes: [
                {
                  kind: 'valueAddedTax',
                  base: taxBase,
                  amount: req.amountCOP - taxBase,
                },
              ],
            }
          : {}),
      },
      subscribe: shouldSubscribe,
    },
    expiration: expiration.toISOString(),
    returnUrl: req.returnUrl,
    ipAddress: req.ipAddress || '127.0.0.1',
    userAgent: req.userAgent || 'Mozilla/5.0 DinamoRent/1.0',
  };

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data?.status?.status === 'OK' && data.processUrl) {
      return {
        ok: true,
        requestId: String(data.requestId),
        processUrl: data.processUrl,
        statusMessage: data.status.message,
      };
    }

    console.error('[PlaceToPay] Respuesta no exitosa de pasarela:', data?.status?.message);
    // Sin simulador de contingencia: un fallo de la pasarela se informa como fallo.
    return {
      ok: false,
      statusMessage: data?.status?.message,
      error: data?.status?.message || 'La pasarela no pudo crear la sesión de pago',
    };
  } catch (err) {
    console.error('[PlaceToPay] Error conectando a pasarela:', err);
    return {
      ok: false,
      error: (err as Error).message || 'Error de conexión con la pasarela de pagos',
    };
  }
}

/**
 * Crea una sesión de tokenización SIN cobro (suscripción pura).
 *
 * Se envía el bloque raíz `subscription` y ningún objeto `payment`, tal como
 * documenta PlacetoPay en «Crear Sesión». Así el administrador puede registrar
 * o reemplazar la tarjeta de garantía sin que el token dependa de un pago
 * aprobado, lo que permite reproducir de forma controlada los escenarios de
 * rechazo recuperable y no recuperable de la certificación.
 */
export async function createSubscriptionSession(
  req: P2PSubscriptionRequest
): Promise<P2PSessionResult> {
  // Simulador local: solo en desarrollo/test con P2P_MOCK=true (ver isMockEnabled).
  if (isMockEnabled()) {
    const mockRequestId = `P2P-TOK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const returnUrlWithParams = new URL(req.returnUrl);
    returnUrlWithParams.searchParams.set('requestId', mockRequestId);
    returnUrlWithParams.searchParams.set('reference', req.reference);

    return {
      ok: true,
      requestId: mockRequestId,
      processUrl: returnUrlWithParams.toString(),
      statusMessage: 'Sesión de tokenización generada en modo Sandbox Dinamo Rent',
    };
  }

  const config = getEnvConfig();
  if ('error' in config) {
    return { ok: false, error: config.error };
  }
  const { login, tranKey, baseUrl } = config;

  const auth = generateAuth(login, tranKey);
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + 25);

  const cleanNames = sanitizeName(req.customer.names) || 'Cliente';
  const cleanLastnames = sanitizeName(req.customer.lastnames) || 'Dinamo';
  const cleanPhone = sanitizePhone(req.customer.phone) || '3000000000';

  const payload = {
    auth,
    locale: 'es_CO',
    buyer: {
      name: cleanNames,
      surname: cleanLastnames,
      email: req.customer.email.trim(),
      mobile: cleanPhone,
      documentType: normalizeDocType(req.customer.docType),
      document: req.customer.docNumber.trim(),
    },
    // Suscripción pura: sin objeto `payment`, no se ejecuta ningún cobro.
    subscription: {
      reference: sanitizeGatewayText(req.reference, 50) || req.reference,
      description:
        sanitizeGatewayText(req.description, 200) ||
        'Tokenizacion tarjeta de garantia Dinamo Rent',
    },
    expiration: expiration.toISOString(),
    returnUrl: req.returnUrl,
    ipAddress: req.ipAddress || '127.0.0.1',
    userAgent: req.userAgent || 'Mozilla/5.0 DinamoRent/1.0 Admin-Tokenization',
  };

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data?.status?.status === 'OK' && data.processUrl) {
      return {
        ok: true,
        requestId: String(data.requestId),
        processUrl: data.processUrl,
        statusMessage: data.status.message,
      };
    }

    console.error(
      '[PlaceToPay] Respuesta no exitosa al crear sesión de tokenización:',
      data?.status?.message
    );
    return {
      ok: false,
      statusMessage: data?.status?.message,
      error: data?.status?.message || 'La pasarela no pudo crear la sesión de tokenización',
    };
  } catch (err) {
    console.error('[PlaceToPay] Error conectando a pasarela (tokenización):', err);
    return {
      ok: false,
      error: (err as Error).message || 'Error de conexión con la pasarela de pagos',
    };
  }
}

/**
 * Consulta el estado de una sesión en Place to Pay (Evertec).
 * Extrae tanto la confirmación del pago del canon como los datos de tokenización
 * (suscripción) de la tarjeta para la garantía.
 */
export async function queryPaymentSession(
  requestId: string
): Promise<P2PStatusResult> {
  // Un requestId inventado por el simulador no existe en Evertec: fuera de desarrollo es un error.
  if (requestId.startsWith('P2P-')) {
    if (!isMockEnabled()) {
      return {
        ok: false,
        requestId,
        status: 'PENDING',
        message: 'Sesión de pago simulada no válida en este entorno',
      };
    }
    const mockToken = `tok_dnm_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    return {
      ok: true,
      requestId,
      status: 'APPROVED',
      message: 'Transacción y tokenización aprobadas (Modo Sandbox de Pruebas)',
      cardBrand: 'VISA',
      cardLast4: '4242',
      authorization: `AUTH-${Math.floor(100000 + Math.random() * 900000)}`,
      token: mockToken,
      tokenStatus: 'ACTIVO',
      tokenValidUntil: '2029-12-31',
      tokenFranchise: 'VISA',
    };
  }

  const config = getEnvConfig();
  if ('error' in config) {
    return { ok: false, requestId, status: 'PENDING', message: config.error };
  }
  const { login, tranKey, baseUrl } = config;

  const auth = generateAuth(login, tranKey);
  try {
    const res = await fetch(`${baseUrl}/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth }),
    });

    const data = await res.json();
    const p2pStatus = data?.status?.status;
    let status: 'APPROVED' | 'REJECTED' | 'PENDING' = 'PENDING';
    if (p2pStatus === 'APPROVED') status = 'APPROVED';
    else if (p2pStatus === 'REJECTED') status = 'REJECTED';

    const firstPayment = data?.payment?.[0];
    // Sesión de tokenización pura: hay `subscription` pero ningún pago asociado.
    const subscriptionOnly =
      Boolean(data?.subscription) &&
      (!Array.isArray(data?.payment) || data.payment.length === 0);

    // Extraer datos de la suscripción (Tokenización de tarjeta para garantía)
    let token: string | undefined;
    let tokenStatus: string | undefined;
    let tokenValidUntil: string | undefined;
    let tokenFranchise: string | undefined;

    if (data?.subscription) {
      const subStatus = data.subscription.status?.status;
      tokenStatus = subStatus === 'APPROVED' ? 'ACTIVO' : subStatus;
      const instruments = data.subscription.instrument;

      token =
        extractInstrumentValue(instruments, 'token') ||
        data.subscription.instrument?.token?.token;
      tokenValidUntil = extractInstrumentValue(instruments, 'valid_until');
      tokenFranchise =
        extractInstrumentValue(instruments, 'franchise') ||
        firstPayment?.franchise;
    }

    const cardBrand =
      tokenFranchise || firstPayment?.paymentMethodName || firstPayment?.franchise || 'TARJETA';
    const lastDigitsProcessor = extractInstrumentValue(firstPayment?.processorFields, 'lastDigits');
    const cardLast4 =
      extractInstrumentValue(data?.subscription?.instrument, 'last_digits') ||
      firstPayment?.lastDigits ||
      lastDigitsProcessor ||
      '0000';

    return {
      ok: true,
      requestId,
      status,
      message: data?.status?.message || 'Estado consultado',
      reference: firstPayment?.reference || data?.request?.payment?.reference,
      cardBrand,
      cardLast4,
      authorization: firstPayment?.authorization,
      token,
      tokenStatus,
      tokenValidUntil,
      tokenFranchise,
      subscriptionOnly,
    };
  } catch (err) {
    return {
      ok: false,
      requestId,
      status: 'PENDING',
      message: (err as Error).message,
    };
  }
}

/**
 * Ejecuta un cobro posterior utilizando el token de la tarjeta previamente suscrita.
 * Servicio Server-to-Server `/api/collect` de Place to Pay (Evertec).
 * Utilizado por mostrador/administración para cobrar deducibles, combustible,
 * días extra o penalidades justificadas en el contrato de alquiler.
 */
export async function collectPaymentWithToken(
  req: P2PCollectRequest
): Promise<P2PCollectResult> {
  // Validación de seguridad previa
  if (!req.token) {
    return {
      ok: false,
      status: 'REJECTED',
      message: 'Token de tarjeta no proporcionado o inexistente',
      reference: req.reference,
      amountCOP: req.amountCOP,
      error: 'Token requerido',
    };
  }

  // Un token del simulador no existe en Evertec: fuera de desarrollo se rechaza sin llamar a la pasarela.
  if (req.token.startsWith('tok_dnm_') && !isMockEnabled()) {
    return {
      ok: false,
      status: 'REJECTED',
      message: 'Token de tarjeta simulado no válido en este entorno',
      reference: req.reference,
      amountCOP: req.amountCOP,
      error: 'Token simulado',
    };
  }

  // Simulador local: solo en desarrollo/test con P2P_MOCK=true.
  if (isMockEnabled()) {
    const mockAuth = `AUTH-COL-${Math.floor(100000 + Math.random() * 900000)}`;
    return {
      ok: true,
      status: 'APPROVED',
      message: 'Cobro de garantía aprobado (Modo Sandbox de Pruebas)',
      reference: req.reference,
      amountCOP: req.amountCOP,
      authorization: mockAuth,
      receipt: `REC-${Date.now()}`,
      franchise: 'VISA',
      lastDigits: '4242',
      requestId: `P2P-COL-${Date.now()}`,
    };
  }

  const config = getEnvConfig();
  if ('error' in config) {
    // Sin credenciales no hay veredicto del emisor: es un fallo nuestro, no un
    // rechazo de la tarjeta. Marcarlo como tal evita que cuente para la
    // invalidación automática por intentos.
    return {
      ok: false,
      status: 'PENDING',
      message: config.error,
      reference: req.reference,
      amountCOP: req.amountCOP,
      error: 'Configuración de pasarela incompleta',
    };
  }
  const { login, tranKey, collectUrl } = config;

  const auth = generateAuth(login, tranKey);

  const payload = {
    auth,
    payer: {
      name: req.customer.names,
      surname: req.customer.lastnames,
      email: req.customer.email,
      documentType: normalizeDocType(req.customer.docType),
      document: req.customer.docNumber.trim(),
      mobile: req.customer.phone,
    },
    payment: {
      reference: sanitizeGatewayText(req.reference, 50) || req.reference,
      // El `description` viaja siempre en ASCII imprimible y acotado: es el
      // campo que la pasarela validaba como error en el cobro con token.
      description: sanitizeGatewayText(req.description, 200) || 'Cobro de garantia Dinamo Rent',
      amount: {
        currency: 'COP',
        total: req.amountCOP,
      },
    },
    instrument: {
      token: {
        token: req.token,
      },
    },
    ipAddress: req.ipAddress || '127.0.0.1',
    userAgent: req.userAgent || 'Mozilla/5.0 DinamoRent/1.0 Server-Collect',
  };

  try {
    const res = await fetch(collectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const rawBody = await res.text();
    let data: {
      status?: { status?: string; message?: string; reason?: string };
      payment?: {
        authorization?: string;
        receipt?: string;
        franchise?: string;
        lastDigits?: string;
      };
      requestId?: string | number;
    } | null = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      data = null;
    }

    // HTTP distinto de 2xx = la solicitud no fue procesada (validación,
    // autenticación o indisponibilidad). No es veredicto del emisor: se trata
    // como PENDING para no contar intentos ni invalidar la tarjeta.
    if (!res.ok) {
      console.error(`[PlaceToPay Collect] HTTP ${res.status}:`, rawBody.slice(0, 500));
      return {
        ok: false,
        status: 'PENDING',
        message: `La pasarela rechazó la solicitud (HTTP ${res.status}): ${
          data?.status?.message || 'sin detalle'
        }. No es un rechazo del emisor; el token no se modifica.`,
        reference: req.reference,
        amountCOP: req.amountCOP,
        requestId: data?.requestId ? String(data.requestId) : undefined,
        error: 'Solicitud rechazada por la pasarela',
      };
    }

    const p2pStatus = data?.status?.status;
    let status: 'APPROVED' | 'REJECTED' | 'PENDING' = 'PENDING';
    if (p2pStatus === 'APPROVED') status = 'APPROVED';
    else if (p2pStatus === 'REJECTED') status = 'REJECTED';

    const message = data?.status?.message || 'Procesado por pasarela';

    // Un error de validación del request (por ejemplo el antiguo `description`)
    // tampoco es un rechazo de la tarjeta: no debe consumir intentos.
    if (status === 'REJECTED' && isGatewayValidationFailure(message)) {
      console.error('[PlaceToPay Collect] Validación rechazada por la pasarela:', message);
      return {
        ok: false,
        status: 'PENDING',
        message: `La pasarela no procesó la solicitud por validación: ${message}. No es un rechazo del emisor; el token no se modifica.`,
        reference: req.reference,
        amountCOP: req.amountCOP,
        requestId: data?.requestId ? String(data.requestId) : undefined,
        error: 'Solicitud rechazada por validación de la pasarela',
      };
    }

    const paymentInfo = data?.payment;

    return {
      ok: status === 'APPROVED',
      status,
      message,
      reference: req.reference,
      amountCOP: req.amountCOP,
      authorization: paymentInfo?.authorization,
      receipt: paymentInfo?.receipt,
      franchise: paymentInfo?.franchise,
      lastDigits: paymentInfo?.lastDigits,
      requestId: data?.requestId ? String(data.requestId) : undefined,
      error: status === 'REJECTED' ? message : undefined,
    };
  } catch (err) {
    console.error('[PlaceToPay Collect] Error ejecutando cobro con token:', err);
    // Timeout o error de red: el cobro pudo o no haberse ejecutado en la pasarela
    // y no hubo veredicto del emisor. `PENDING` lo distingue de un rechazo real.
    return {
      ok: false,
      status: 'PENDING',
      message: (err as Error).message || 'Error de comunicación con pasarela',
      reference: req.reference,
      amountCOP: req.amountCOP,
      error: (err as Error).message,
    };
  }
}

/**
 * Motivos de rechazo que obligan a invalidar el token de inmediato
 * (Guía de Certificación de Suscripción con WebCheckout, sección 8).
 * Se comparan sobre el mensaje normalizado (sin tildes ni mayúsculas).
 */
const IMMEDIATE_INVALIDATION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Tarjeta robada', pattern: /\brobad[ao]\b/ },
  { label: 'Tarjeta perdida', pattern: /\bperdid[ao]\b/ },
  { label: 'Tarjeta bloqueada o cancelada', pattern: /bloquead[ao]|cancelad[ao]/ },
  { label: 'Tarjeta vencida', pattern: /vencid[ao]|expirad[ao]/ },
  { label: 'Tarjeta inválida', pattern: /invalid[ao]/ },
  { label: 'Tarjeta de uso restringido', pattern: /uso\s+restringido/ },
  { label: 'Tipo de tarjeta inválida', pattern: /tipo\s+de\s+tarjeta/ },
  { label: 'Orden de retención', pattern: /orden\s+de\s+retencion|con\s+orden\s+de\s+retencion/ },
];

/**
 * Clasifica el mensaje de un rechazo de cobro con token.
 * - `immediate: true` → tarjeta robada, perdida, bloqueada, vencida, inválida o de uso restringido.
 * - `immediate: false` → rechazos transitorios (fondos insuficientes, límites, etc.),
 *   sujetos a la regla de máximo 3 intentos antes de invalidar.
 */
/** Normaliza un mensaje de la pasarela para compararlo sin tildes ni mayúsculas. */
function normalizeGatewayMessage(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * true si el mensaje corresponde a un problema de la solicitud (campo, formato,
 * longitud) y no a un rechazo del emisor. Evita clasificar como «tarjeta
 * inválida» un error de validación del `description`.
 */
function isGatewayValidationFailure(message?: string): boolean {
  if (!message) return false;
  const normalized = normalizeGatewayMessage(message);
  return /descripcion|description|\bcampo\b|\bfield\b|requerid|required|formato|format|longitud|length|parametro/.test(
    normalized
  );
}

export function classifyTokenRejection(message?: string): { immediate: boolean; reason?: string } {
  if (!message) return { immediate: false };

  const normalized = normalizeGatewayMessage(message);

  // Los rechazos por fondos, cupo o límites NO invalidan el token: solo cuentan intentos.
  if (/fondos|insuficiente|cupo|limite|excede/.test(normalized)) {
    return { immediate: false };
  }

  const hit = IMMEDIATE_INVALIDATION_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  return hit ? { immediate: true, reason: hit.label } : { immediate: false };
}

/**
 * Invalida un token almacenado para que no pueda volver a usarse
 * (POST /api/instrument/invalidate).
 */
export async function invalidateToken(
  token: string,
  reason?: string
): Promise<P2PInvalidateResult> {
  if (!token) return { ok: false, message: 'Token no proporcionado' };

  // Tokens simulados del sandbox local: no existen en Evertec.
  if (token.startsWith('tok_dnm_') && !isMockEnabled()) {
    return { ok: false, message: 'Token de tarjeta simulado no válido en este entorno' };
  }

  // Simulador local: solo en desarrollo/test con P2P_MOCK=true.
  if (isMockEnabled()) {
    return {
      ok: true,
      message: `Token invalidado en modo Sandbox Dinamo Rent${reason ? ` (${reason})` : ''}`,
    };
  }

  const config = getEnvConfig();
  if ('error' in config) {
    return { ok: false, message: config.error };
  }
  const { login, tranKey, invalidateUrl } = config;

  const auth = generateAuth(login, tranKey);

  try {
    const res = await fetch(invalidateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locale: 'es_CO',
        auth,
        instrument: { token: { token } },
      }),
    });

    const data = await res.json();
    const status = data?.status?.status;
    const ok = status === 'APPROVED' || status === 'OK';

    return {
      ok,
      message:
        data?.status?.message ||
        (ok ? 'Token invalidado correctamente' : 'La pasarela no confirmó la invalidación del token'),
    };
  } catch (err) {
    console.error('[PlaceToPay Invalidate] Error invalidando token:', err);
    return { ok: false, message: (err as Error).message || 'Error de comunicación con pasarela' };
  }
}
