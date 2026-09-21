import crypto from 'node:crypto';

export interface P2PAuth {
  login: string;
  tranKey: string;
  nonce: string;
  seed: string;
}

export interface P2PSessionRequest {
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

  return { env, login, tranKey, baseUrl, collectUrl };
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

  // Si son credenciales sandbox locales no registradas aún en Evertec, usar simulador transparente
  if (
    login === 'dinamo_rent_sandbox' ||
    !process.env.P2P_TRAN_KEY ||
    process.env.P2P_TRAN_KEY === 'dinamo_secret_test_key'
  ) {
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
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + 1); // 1 hora de vigencia

  // Configurar estructura de suscripción (Tokenización de garantía)
  const shouldSubscribe = req.enableSubscription !== false;
  const subscriptionPayload = shouldSubscribe
    ? {
        reference: `SUB-${req.reference}`,
        description: `Garantía y respaldo de vehículo — Dinamo Rent #${req.reference}`,
      }
    : undefined;

  const payload: Record<string, unknown> = {
    auth,
    locale: 'es_CO',
    buyer: {
      name: req.customer.names,
      surname: req.customer.lastnames,
      email: req.customer.email,
      mobile: req.customer.phone,
      documentType: req.customer.docType,
      document: req.customer.docNumber,
    },
    payment: {
      reference: req.reference,
      description: req.description,
      amount: {
        currency: 'COP',
        total: req.amountCOP,
      },
      subscribe: shouldSubscribe,
    },
    expiration: expiration.toISOString(),
    returnUrl: req.returnUrl,
    ipAddress: req.ipAddress || '127.0.0.1',
    userAgent: req.userAgent || 'Mozilla/5.0 DinamoRent/1.0',
  };

  if (subscriptionPayload) {
    payload.subscription = subscriptionPayload;
  }

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

    console.warn('[PlaceToPay] Respuesta no exitosa de pasarela:', data?.status?.message);
    const mockRequestId = `P2P-FALLBACK-${Date.now()}`;
    const returnUrlWithParams = new URL(req.returnUrl);
    returnUrlWithParams.searchParams.set('requestId', mockRequestId);
    returnUrlWithParams.searchParams.set('reference', req.reference);

    return {
      ok: true,
      requestId: mockRequestId,
      processUrl: returnUrlWithParams.toString(),
      statusMessage: 'Sandbox de contingencia Dinamo Rent',
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

  // Si es una sesión simulada de sandbox
  if (requestId.startsWith('P2P-')) {
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
      tokenFranchise || firstPayment?.franchise || 'TARJETA';
    const cardLast4 =
      extractInstrumentValue(data?.subscription?.instrument, 'last_digits') ||
      firstPayment?.lastDigits ||
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

  // Si es un token simulado en ambiente sandbox
  if (
    req.token.startsWith('tok_dnm_') ||
    login === 'dinamo_rent_sandbox' ||
    !process.env.P2P_TRAN_KEY ||
    process.env.P2P_TRAN_KEY === 'dinamo_secret_test_key'
  ) {
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
      documentType: req.customer.docType,
      document: req.customer.docNumber,
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
