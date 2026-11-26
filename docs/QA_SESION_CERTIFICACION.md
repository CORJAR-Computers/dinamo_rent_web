# Q&A técnico — sesión de certificación Evertec

Respuestas cortas para la sesión en vivo, cada una anclada al código que las sostiene. Si una
pregunta cae fuera de esta página, la respuesta correcta es «lo verifico y te lo confirmo por
escrito», no improvisar.

---

## 1. ¿Por qué leen `payment[].status` y no el `status` global?

Porque una misma respuesta trae **dos veredictos** y el global es genérico. En un rechazo, el
`status` de la raíz suele venir como `XN` con «Se ha rechazado la petición», mientras que el motivo
del emisor viaja en `payment[].status` (`reason: 37`, «Negada, Tarjtea bloqueada
retener/capturar»).

`queryPaymentSession` (`src/lib/server/placetopay.ts`) toma el detalle y cae al global solo si no
existe:

```ts
const firstPayment = Array.isArray(data?.payment) ? data.payment[0] : data?.payment;
const p2pStatus = firstPayment?.status?.status ?? data?.status?.status;
const message = firstPayment?.status?.message?.trim() || data?.status?.message;
```

`collectPaymentWithToken` hace lo mismo. Consecuencia práctica: sin ese orden, una tarjeta
bloqueada se clasificaba como rechazo **recuperable** y consumía los tres intentos en vez de
desvincularse en el primero — el fallo que destapó el escenario 3 y que corrigen `ef32c55` (cobro) y
`9e4b380` (consulta de la sesión). El fallback al global se usa cuando no hay `payment[]`, que es el
caso de la tokenización pura.

## 2. ¿Cómo garantizan que no se cobre dos veces (idempotencia de la referencia a 24 h)?

En tres capas, y conviene decir cuál es nuestra y cuál es de la pasarela:

1. **Sesión de pago**: la referencia es el código de reserva (`create-session/+server.ts`:
   `reference: reservation.code`). No se crea una segunda sesión si la reserva ya está `PAGADA`
   (400) o si hay un pago `PENDIENTE` con `p2pRequestId` dentro de la ventana (`PENDING_WINDOW_MS`):
   antes de bloquear se consulta la sesión para no impedir un pago que la pasarela ya resolvió.
2. **Cobro con token**: la referencia es única por intento,
   `COL-${reservation.code}-${Date.now().toString(36).toUpperCase()}`
   (`collect/+server.ts`). Un reintento es una referencia nueva, nunca la reutilización de la
   anterior.
3. **Ventana de 24 h**: es la protección de Evertec sobre referencias repetidas. Nos apoyamos en
   ella, no la implementamos; lo que sí es nuestro es que cada intento queda como `DepositCharge`
   con su `p2pRequestId`, así que un duplicado sería visible en la auditoría.

Si preguntan si tenemos deduplicación propia por referencia: **no**, la única guarda local es la del
pago pendiente del punto 1. Decirlo así.

**Riesgo que conviene declarar antes de que lo pregunten.** Si un `Collect` queda sin veredicto
(timeout, error de red), el cargo se guarda `PENDIENTE` y se responde 502: no hubo rechazo, no cuenta
intento y el token no se toca. Pero **no hay sonda que revise ese `DepositCharge`** — el cron solo
consulta `Payment` pendientes y tokens vencidos — y, como cada intento usa una referencia nueva, un
reintento **no** choca con el bloqueo de duplicados de 24 h de la pasarela: si el primer cobro sí se
procesó y solo se perdió la respuesta, el reintento cobra otra vez. La mitigación hoy es humana y está
en el propio mensaje del 502: verificar en el panel de PlacetoPay, por referencia (el `requestId`
puede no existir si no hubo respuesta), antes de reintentar. No afirmar que el sistema lo evita solo.

## 3. ¿Qué pasa si Evertec reintenta el webhook o llega dos veces?

- **Firma obligatoria**: `Hash(requestId + status + date + P2P_TRAN_KEY)`, SHA‑1 (40 hex) o SHA‑256
  (prefijo `sha256:`, 64 hex), comparada con `timingSafeEqual`. Firma ausente o inválida → **401** y
  no se escribe nada.
- **El cuerpo no manda**: el estado se toma **solo** de `QuerySession`. Un aviso con
  `APPROVED` sobre una sesión pendiente no aprueba nada. Si la consulta falla → **502** para que
  Evertec reintente; la sonda diaria también lo recupera.
- **Duplicado de un pago ya aprobado**: si `payment.status === 'APROBADO'`, responde
  `{ duplicate: true }` sin reescribir la reserva ni el pago.
- **Aprobado tardío sobre reserva cancelada**: se registra en el `SyncLog` como ignorado
  (`ignored: 'RESERVA_CANCELADA'`); no resucita la reserva.
- **Tokenización pura**: la rama `subscriptionOnly` solo actualiza el instrumento (nunca marca
  `PAGADA`); repetirla reescribe el mismo token, y desde `9489a39` solo revoca el anterior si es
  distinto.
- **Límite conocido**: las notificaciones `REJECTED` actualizan el pago pero **no** escriben
  `SyncLog`; solo `APROBADO` y «reserva cancelada» dejan línea. Mejor decirlo antes de que lo
  pregunten.

## 4. ¿Cuánto vive un token y cómo se da de baja?

- **Vigencia**: se guarda la fecha que informa la pasarela (`validUntil` → `tokenValidUntil`).
  `isTokenExpired` (`src/lib/utils/tokenValidity.ts`) trata `YYYY-MM-DD` como válida **hasta el final
  de ese día en UTC**; una fecha ausente o ilegible **no** se marca vencida, porque la pasarela sigue
  siendo la autoridad.
- **Al cobrar**: si el token venció, `collect` responde **400** `status: "EXPIRED"` **sin llamar a
  la pasarela**, no consume intento, no crea `DepositCharge` y lo deja `EXPIRADO` con `SyncLog`.
- **Barrido diario**: el cron marca `EXPIRADO` los tokens vencidos (excluye `CANCELADO`/`EXPIRADO`),
  no llama a la pasarela y devuelve `expiredTokenCount`.
- **Baja**: `POST /api/payments/token/invalidate` → `/api/instrument/invalidate`, deja el token
  `CANCELADO` y escribe `SyncLog`; 400 si no hay token o ya estaba cancelado, 502 si la pasarela no
  confirma. Con el token cancelado, `collect` responde **400** `status: "CANCELLED"` +
  `retokenizationRequired: true` **antes** de la pasarela, y el panel deja de ofrecer el cobro.
- **Bajas automáticas**: rechazo definitivo (primero) o tercer rechazo consecutivo; y al
  re-tokenizar se revoca el token anterior (`9489a39`).

## 5. ¿Cuál es su alcance PCI-DSS? ¿Guardan datos de tarjeta?

La tarjeta se digita **en el checkout de PlacetoPay**, no en nuestro dominio: el servidor crea la
sesión y redirige al `processUrl`; nunca recibe el número.

Lo que se persiste (`payments`): `token` (opaco), `tokenStatus`, `tokenValidUntil`,
`tokenFranchise`, `cardBrand`, `cardLast4`, `p2pRequestId`, `transactionId`. En `deposit_charges`:
concepto, monto, estado, `p2pRequestId` y el mensaje de la pasarela. **No** hay PAN, CVV ni banda
magnética en el esquema, y los `console.error` del servidor registran mensajes de error, no datos de
tarjeta. La columna `cardHolder` existe en el esquema con valor por defecto vacío y **ningún código
la escribe** (búsqueda en `src/`: cero referencias).

Matiz honesto: sí guardamos últimos 4 y la vigencia informada del instrumento. No son datos de
autenticación, pero tampoco es cierto decir «no guardamos nada de la tarjeta».

## 6. ¿Por qué invalidan la tarjeta a los 3 intentos?

Porque el código separa dos clases de rechazo (`classifyTokenRejection`,
`src/lib/server/placetopay.ts`):

- **Definitivos** (robada, perdida, bloqueada/cancelada, vencida, inválida, uso restringido, tipo de
  tarjeta, orden de retención): invalidan **en el primer rechazo**.
- **Transitorios** (fondos insuficientes, cupo, límite): **no** invalidan; cuentan intentos hasta 3.

El conteo no es un contador en memoria: se recalcula desde `deposit_charges`, contando rechazos
**consecutivos** hacia atrás y cortando en el primer cargo que no sea `RECHAZADO`
(`collect/+server.ts`). Así sobrevive a reinicios y a instancias distintas. Al llegar a
`attempts >= 3` se invalida y el motivo queda como «3 intentos de cobro rechazados
consecutivamente».

Por qué 3: es la política publicada en `/terminos` («como máximo tres (3) intentos antes de
invalidarlo») y la que exige la Guía de Suscripción (§8, citada en el propio código). El criterio es
que un tercer rechazo consecutivo ya no es transitorio para este comercio.

Detalle que suele preguntarse: un **`PENDING` no cuenta**. Si la pasarela no responde, el cobro
queda `PENDIENTE`, se responde 502, `attempts: 0` y el token no se toca — no hubo veredicto del
emisor.

---

## Frases que no conviene decir

- «Nosotros aplicamos la ventana de 24 h» → es de Evertec; nosotros generamos referencias únicas.
- «El token no vence» → vence con la fecha que informa la pasarela y el sistema la respeta.
- «No guardamos ningún dato de la tarjeta» → guardamos token, últimos 4 y vigencia.
- «El webhook aprueba el pago» → el webhook solo dispara; el estado sale de `QuerySession`.

## Dónde está cada cosa

| Tema | Archivo |
|---|---|
| Doble veredicto (`payment[].status`) | `src/lib/server/placetopay.ts` — `queryPaymentSession`, `collectPaymentWithToken` |
| Clasificación de rechazos | `src/lib/server/placetopay.ts` — `classifyTokenRejection` |
| Referencias y conteo de intentos | `src/routes/api/payments/collect/+server.ts` |
| Webhook (firma, duplicados) | `src/routes/api/webhooks/placetopay/+server.ts` |
| Vigencia del token | `src/lib/utils/tokenValidity.ts` |
| Baja del token | `src/routes/api/payments/token/invalidate/+server.ts`, `tokenReplacement.ts` |
