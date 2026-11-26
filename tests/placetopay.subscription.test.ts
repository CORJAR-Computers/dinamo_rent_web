import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sesión de suscripción pura (sin `payment`) y clasificación de errores del
 * Collect. Evertec reportó un error de validación en `description` al cobrar
 * con token: un fallo así no puede contar como rechazo de la tarjeta.
 */

const {
	createSubscriptionSession,
	queryPaymentSession,
	collectPaymentWithToken,
	classifyTokenRejection,
	sanitizeGatewayText
} = await import('../src/lib/server/placetopay.js');

/** `SyncLog` de la revocación: sustituye a Prisma en las pruebas de re-tokenización. */
const dbLog = vi.hoisted(() => ({ entries: [] as unknown[] }));

vi.mock('#lib/server/db.js', () => ({
	db: {
		syncLog: {
			create: async (args: unknown) => {
				dbLog.entries.push(args);
				return args;
			}
		}
	}
}));

const { revokeReplacedToken } = await import('../src/lib/server/tokenReplacement.js');

const customer = {
	names: 'Ana',
	lastnames: 'Pérez',
	email: 'ana@example.com',
	phone: '3001234567',
	docType: 'CC',
	docNumber: '1234567890'
};

function productionEnv(): void {
	vi.stubEnv('NODE_ENV', 'production');
	vi.stubEnv('P2P_ENV', 'prod');
	vi.stubEnv('P2P_LOGIN', 'comercio-real');
	vi.stubEnv('P2P_TRAN_KEY', 'clave-transaccional-real');
	vi.stubEnv('P2P_MOCK', 'false');
}

beforeEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('sanitizeGatewayText', () => {
	it('convierte guiones largos y tildes, y descarta caracteres no permitidos', () => {
		const salida = sanitizeGatewayText('Daño — “espejo” izquierdo\nAcción #1');
		expect(salida).toBe('Dano - espejo izquierdo Accion 1');
		expect(salida).toMatch(/^[A-Za-z0-9 .,()_:/+-]+$/);
	});

	it('acota la longitud y colapsa espacios', () => {
		const salida = sanitizeGatewayText(`  ${'a'.repeat(500)}  `, 200);
		expect(salida).toHaveLength(200);
	});
});

describe('createSubscriptionSession', () => {
	it('envía el bloque subscription sin payment y con description ASCII', async () => {
		productionEnv();
		let enviado: Record<string, unknown> | null = null;

		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				enviado = JSON.parse(String(init.body)) as Record<string, unknown>;
				return new Response(
					JSON.stringify({
						requestId: 555,
						processUrl: 'https://checkout-test.placetopay.com/session/555',
						status: { status: 'OK', message: 'Sesión creada' }
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			})
		);

		const result = await createSubscriptionSession({
			reference: 'DIN-2026-0001',
			description: 'Tokenización — tarjeta “de prueba”',
			customer,
			returnUrl: 'https://dinamo-rent-a-car.vercel.app/api/payments/token/resubscribe/return?reservationId=res_1'
		});

		expect(result.ok).toBe(true);
		expect(result.processUrl).toContain('/session/555');

		const payload = enviado as unknown as {
			payment?: unknown;
			subscription: { reference: string; description: string };
			buyer: { document: string };
		};
		expect(payload.payment).toBeUndefined();
		expect(payload.subscription.reference).toBe('DIN-2026-0001');
		expect(payload.subscription.description).toMatch(/^[\x20-\x7E]+$/);
		expect(payload.subscription.description).not.toContain('—');
		expect(payload.buyer.document).toBe('1234567890');
	});

	it('falla cerrado sin credenciales en producción y no llama a la pasarela', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('P2P_ENV', 'prod');
		vi.stubEnv('P2P_LOGIN', '');
		vi.stubEnv('P2P_TRAN_KEY', '');
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const result = await createSubscriptionSession({
			reference: 'DIN-2026-0001',
			description: 'Tokenizacion',
			customer,
			returnUrl: 'https://example.com/return'
		});

		expect(result.ok).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe('queryPaymentSession — tokenización sin cobro', () => {
	it('marca subscriptionOnly cuando la respuesta no trae payment', async () => {
		productionEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							status: { status: 'APPROVED', message: 'Aprobada' },
							payment: [],
							subscription: {
								status: { status: 'APPROVED' },
								instrument: [
									{ keyword: 'token', value: 'tok_nuevo_12345678' },
									{ keyword: 'franchise', value: 'visa' },
									{ keyword: 'lastDigits', value: '0008' },
									{ keyword: 'validUntil', value: '2030-12-31' }
								]
							}
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
			)
		);

		const result = await queryPaymentSession('555');

		expect(result.ok).toBe(true);
		expect(result.subscriptionOnly).toBe(true);
		expect(result.token).toBe('tok_nuevo_12345678');
		expect(result.tokenStatus).toBe('ACTIVO');
		// Regresión: la pasarela usa camelCase; antes se guardaba 0000.
		expect(result.cardLast4).toBe('0008');
		expect(result.tokenValidUntil).toBe('2030-12-31');
	});
});

describe('queryPaymentSession — pago sin suscripción', () => {
	it('toma los últimos 4 de processorFields cuando no hay instrumento', async () => {
		productionEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							status: { status: 'APPROVED', message: 'Pago aprobado' },
							payment: [
								{
									reference: 'DIN-2026-0002',
									status: { status: 'APPROVED' },
									processorFields: [{ keyword: 'lastDigits', value: '1111' }]
								}
							]
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
			)
		);

		const result = await queryPaymentSession('888');

		expect(result.ok).toBe(true);
		expect(result.token).toBeUndefined();
		expect(result.cardLast4).toBe('1111');
	});

	it('cae en 0000 si la pasarela no informa los últimos 4', async () => {
		productionEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ status: { status: 'PENDING', message: 'Pendiente' } }),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
			)
		);

		const result = await queryPaymentSession('999');

		expect(result.ok).toBe(true);
		expect(result.cardLast4).toBe('0000');
	});
});

describe('queryPaymentSession — veredicto del emisor', () => {
	it('usa el motivo de payment[].status en lugar del global XN', async () => {
		// Respuesta real de checkout-test con la tarjeta bloqueada de Evertec: el
		// status global solo dice «Se ha rechazado la petición» y el webhook, la
		// sonda y el SyncLog guardaban ese texto genérico en vez del motivo (37).
		productionEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							requestId: 3971780,
							status: {
								status: 'REJECTED',
								reason: 'XN',
								message: 'Se ha rechazado la petición'
							},
							payment: [
								{
									reference: 'DIN-2026-6438',
									status: {
										status: 'REJECTED',
										reason: '37',
										message: 'Negada, Tarjtea bloqueada retener/capturar'
									}
								}
							]
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
			)
		);

		const result = await queryPaymentSession('3971780');

		expect(result.status).toBe('REJECTED');
		expect(result.message).toBe('Negada, Tarjtea bloqueada retener/capturar');
		expect(classifyTokenRejection(result.message)).toMatchObject({ immediate: true });
	});
});

describe('queryPaymentSession — sesión normal de pago con suscripción', () => {
	it('no marca subscriptionOnly cuando la sesión trae payment y subscription', async () => {
		productionEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							status: { status: 'APPROVED', message: 'Pago aprobado' },
							payment: [
								{
									reference: 'DIN-2026-0001',
									authorization: 'AUTH-123456',
									status: { status: 'APPROVED' },
									paymentMethodName: 'VISA',
									lastDigits: '4242'
								}
							],
							subscription: {
								status: { status: 'APPROVED' },
								instrument: [
									{ keyword: 'token', value: 'tok_garantia_12345678' },
									{ keyword: 'lastDigits', value: '4242' },
									{ keyword: 'validUntil', value: '2030-12-31' },
									{ keyword: 'franchise', value: 'VISA' }
								]
							}
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
			)
		);

		const result = await queryPaymentSession('777');

		// Regresión: la compra normal con suscripción de garantía trae `payment`
		// y `subscription` a la vez. Si el discriminante la marcara como
		// tokenización pura, el webhook dejaría de marcar la reserva como PAGADA.
		expect(result.ok).toBe(true);
		expect(result.subscriptionOnly).toBe(false);
		expect(result.status).toBe('APPROVED');
		expect(result.reference).toBe('DIN-2026-0001');
		expect(result.authorization).toBe('AUTH-123456');
		expect(result.token).toBe('tok_garantia_12345678');
		expect(result.tokenStatus).toBe('ACTIVO');
		expect(result.cardBrand).toBe('VISA');
		expect(result.cardLast4).toBe('4242');
		expect(result.tokenValidUntil).toBe('2030-12-31');
	});
});

describe('collectPaymentWithToken — errores de validación', () => {
	const pedido = {
		token: 'tok_real_9f8e7d6c',
		reference: 'COL-DIN-2026-0001-ABC',
		description: 'Cobro de garantia',
		amountCOP: 50000,
		customer
	};

	it('un HTTP 400 queda PENDING: no es un rechazo del emisor', async () => {
		productionEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							status: { status: 'REJECTED', message: 'El campo description es inválido' }
						}),
						{ status: 400, headers: { 'content-type': 'application/json' } }
					)
			)
		);

		const result = await collectPaymentWithToken(pedido);

		expect(result.status).toBe('PENDING');
		expect(result.error).toContain('pasarela');
	});

	it('un REJECTED por el campo description no se clasifica como rechazo de tarjeta', async () => {
		productionEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							status: { status: 'REJECTED', message: 'El campo description es inválido' }
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
			)
		);

		const result = await collectPaymentWithToken(pedido);

		expect(result.status).toBe('PENDING');
		expect(result.error).toBe('Solicitud rechazada por validación de la pasarela');
	});

	it('usa el veredicto del emisor en payment[].status, no el global XN', async () => {
		// Respuesta real de checkout-test con la tarjeta bloqueada de Evertec:
		// el status global solo dice «Se ha rechazado la petición»; el motivo
		// definitivo (37) viene en el pago.
		productionEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							status: { status: 'REJECTED', reason: 'XN', message: 'Se ha rechazado la petición' },
							payment: [
								{
									reference: 'COL-DIN-2026-0001-ABC',
									status: {
										status: 'REJECTED',
										reason: '37',
										message: 'Negada, Tarjtea bloqueada retener/capturar'
									}
								}
							],
							requestId: 3971780
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
			)
		);

		const result = await collectPaymentWithToken(pedido);

		expect(result.status).toBe('REJECTED');
		expect(result.message).toBe('Negada, Tarjtea bloqueada retener/capturar');
		expect(classifyTokenRejection(result.message)).toMatchObject({ immediate: true });
	});
});

describe('revokeReplacedToken — el token reemplazado no puede quedar vivo', () => {
	// Regresión: la re-tokenización guardaba el token nuevo sin invalidar el
	// anterior, así que quedaban dos instrumentos vivos sobre la misma tarjeta.
	const pago = {
		paymentId: 'pay_1',
		reservationCode: 'DIN-2026-0001',
		source: 'RETORNO' as const
	};

	beforeEach(() => {
		dbLog.entries.length = 0;
	});

	it('invalida en la pasarela el token que se reemplaza', async () => {
		productionEnv();
		let enviado: Record<string, unknown> | null = null;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				enviado = JSON.parse(String(init.body)) as Record<string, unknown>;
				return new Response(
					JSON.stringify({ status: { status: 'APPROVED', message: 'Token invalidado' } }),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			})
		);

		const outcome = await revokeReplacedToken({
			...pago,
			previousToken: 'tok_anterior_12345678',
			newToken: 'tok_nuevo_12345678'
		});

		expect(outcome).toBe('REVOKED');
		const cuerpo = enviado as unknown as { instrument?: { token?: { token?: string } } };
		expect(cuerpo.instrument?.token?.token).toBe('tok_anterior_12345678');

		const log = (dbLog.entries[0] as { data?: Record<string, unknown> })?.data as {
			status?: string;
			message?: string;
			payload?: Record<string, unknown>;
		};
		expect(log.status).toBe('PENDING');
		expect(String(log.message)).toContain('Token anterior invalidado');
		expect(log.payload).toMatchObject({
			event: 'PREVIOUS_TOKEN_REVOKED',
			invalidated: true,
			source: 'RETORNO',
			previousTokenPrefix: 'tok_ante'
		});
	});

	it('no toca la pasarela si no había token previo o es el mismo', async () => {
		productionEnv();
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		await expect(
			revokeReplacedToken({ ...pago, previousToken: null, newToken: 'tok_nuevo_12345678' })
		).resolves.toBe('SKIPPED');
		await expect(
			revokeReplacedToken({
				...pago,
				previousToken: 'tok_nuevo_12345678',
				newToken: 'tok_nuevo_12345678'
			})
		).resolves.toBe('SKIPPED');

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(dbLog.entries).toHaveLength(0);
	});

	it('si la pasarela no confirma, lo registra como fallo sin romper el retorno', async () => {
		productionEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ status: { status: 'REJECTED', message: 'No autorizado' } }),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
			)
		);

		const outcome = await revokeReplacedToken({
			...pago,
			previousToken: 'tok_anterior_12345678',
			newToken: 'tok_nuevo_12345678'
		});

		expect(outcome).toBe('FAILED');
		const log = (dbLog.entries[0] as { data?: Record<string, unknown> })?.data as {
			status?: string;
			message?: string;
		};
		expect(log.status).toBe('FAILED');
		expect(String(log.message)).toContain('No fue posible invalidar el token anterior');
	});
});
