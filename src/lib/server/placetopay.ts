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

export interface P2PInvalidateResult {
  ok: boolean;
  message: string;
}

export interface P2PCollectResult {
  ok: boolean;
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

function getEnvConfig() {
  const env = process.env.P2P_ENV || 'test';
  const login = process.env.P2P_LOGIN || 'dinamo_rent_sandbox';
  const tranKey = process.env.P2P_TRAN_KEY || 'dinamo_secret_test_key';
  const baseUrl =
    env === 'prod'
      ? 'https://checkout.placetopay.com/api/session'
      : 'https://checkout-test.placetopay.com/api/session';
  const collectUrl =
    env === 'prod'
      ? 'https://checkout.placetopay.com/api/collect'
      : 'https://checkout-test.placetopay.com/api/collect';
  const invalidateUrl =
    env === 'prod'
      ? 'https://checkout.placetopay.com/api/instrument/invalidate'
      : 'https://checkout-test.placetopay.com/api/instrument/invalidate';

  return { env, login, tranKey, baseUrl, collectUrl, invalidateUrl };
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
 * Crea una sesión de pago y/o suscripción en Place to Pay (Evertec).
 * Por defecto incluye la estructura `subscription` para tokenizar la tarjeta
 * y usarla como garantía del depósito del vehículo sin cobro inicial.
 */
export async function createPaymentSession(
  req: P2PSessionRequest
): Promise<P2PSessionResult> {
  const { login, tranKey, baseUrl } = getEnvConfig();

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

  const auth = generateAuth(login, tranKey);
  // Según guía de certificación Webcheckout Evertec (pág. 3):
  // El tiempo de expiración debe estar parametrizado entre 10 a 30 minutos.
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + 25); // 25 minutos de vigencia

  // Limpiar campos según requisitos de certificación de Evertec:
  // - Nombres y apellidos: solo letras, espacios, tildes y Ñ
  const sanitizeName = (val: string) => val.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').trim();
  // - Móvil/Teléfono: solo dígitos numéricos (máx 10 dígitos locales de Colombia)
  const sanitizePhone = (val: string) => val.replace(/\D/g, '').slice(-10);
  // - Descripción: texto limpio alfanumérico y espacios estándar
  const sanitizeDescription = (val: string) => val.replace(/[^\w\s\-.,()]/gi, '').slice(0, 250);

  const cleanNames = sanitizeName(req.customer.names) || 'Cliente';
  const cleanLastnames = sanitizeName(req.customer.lastnames) || 'Dinamo';
  const cleanPhone = sanitizePhone(req.customer.phone) || '3000000000';
  const cleanDescription = sanitizeDescription(req.description) || 'Alquiler de vehiculo Dinamo Rent';

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
 * Consulta el estado de una sesión en Place to Pay (Evertec).
 * Extrae tanto la confirmación del pago del canon como los datos de tokenización
 * (suscripción) de la tarjeta para la garantía.
 */
export async function queryPaymentSession(
  requestId: string
): Promise<P2PStatusResult> {
  const { login, tranKey, baseUrl } = getEnvConfig();

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
  const { login, tranKey, collectUrl } = getEnvConfig();

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
      reference: req.reference,
      description: req.description,
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

    const data = await res.json();
    const p2pStatus = data?.status?.status;
    let status: 'APPROVED' | 'REJECTED' | 'PENDING' = 'PENDING';
    if (p2pStatus === 'APPROVED') status = 'APPROVED';
    else if (p2pStatus === 'REJECTED') status = 'REJECTED';

    const paymentInfo = data?.payment;

    return {
      ok: status === 'APPROVED',
      status,
      message: data?.status?.message || 'Procesado por pasarela',
      reference: req.reference,
      amountCOP: req.amountCOP,
      authorization: paymentInfo?.authorization,
      receipt: paymentInfo?.receipt,
      franchise: paymentInfo?.franchise,
      lastDigits: paymentInfo?.lastDigits,
      requestId: data?.requestId ? String(data.requestId) : undefined,
      error: status === 'REJECTED' ? data?.status?.message : undefined,
    };
  } catch (err) {
    console.error('[PlaceToPay Collect] Error ejecutando cobro con token:', err);
    return {
      ok: false,
      status: 'REJECTED',
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
export function classifyTokenRejection(message?: string): { immediate: boolean; reason?: string } {
  if (!message) return { immediate: false };

  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

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

  const { login, tranKey, invalidateUrl } = getEnvConfig();

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
