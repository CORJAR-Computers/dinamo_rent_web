# Acta de certificación Evertec / PlacetoPay — Dinamo Rent a Car

Plantilla para la sesión asistida con el analista de Evertec. Se deriva de la
tabla de §5 del `RUNBOOK_SESION_CERTIFICACION.md`; el runbook dice **cómo** se
ejecuta cada escenario y este acta recoge **qué se vio**. Se completa en vivo, o
inmediatamente después, con las capturas y los `requestId` delante.

Regla que gobierna todo el documento: **si no está en pantalla o en un
`requestId` verificable, no existe para el acta.** No se rellena de memoria, no
se completa después «por lo que debió pasar» y no se corrige una captura.

Estados admitidos en cada ficha:

| Estado | Significado |
|---|---|
| `CUMPLE` | El comportamiento observado es el esperado y hay captura + `requestId`. |
| `NO CUMPLE` | El comportamiento difiere de lo esperado. Se documenta el hallazgo, no se repite hasta que salga. |
| `PENDIENTE` | No se pudo ejecutar u observar en la sesión; queda en §8 con responsable y fecha. |
| `NO EJECUTADO` | Se decidió no ejecutarlo (tiempo, alcance). Se explica por qué. |

---

## 1. Datos de la sesión

| Campo | Valor |
|---|---|
| Fecha | |
| Hora de inicio / fin (zona) | |
| Modalidad | Videollamada / presencial |
| Analista de Evertec | |
| Conductor (Dinamo) | |
| Escriba | |
| Comercio | DINAMO RENTA CAR S.A.S. — NIT 900694866-3 |
| Entorno | `checkout-test.placetopay.com` (sandbox, «No habrá afectación monetaria») |
| URL del comercio | `https://dinamorentacar.com` |
| Build certificado (`sha` completo) | |
| Deployment de Production (`sha` corto) | |
| `P2P_ENV` en el despliegue | `test` |
| Paquete de evidencia | `capturas-evidencia-evertec.zip` |
| SHA-256 del ZIP | |
| Acta firmada por | |

Comprobaciones de arranque (marcar con hora; si alguna falla, no se empieza):

- [ ] Build desplegado = build certificado (leído de Vercel, no de memoria): ____
- [ ] Home responde `200`: ____
- [ ] Login admin `200` + cookie `dinamo_admin_session`: ____
- [ ] Checkout en sandbox (host `checkout-test.placetopay.com`): ____
- [ ] Webhook rechaza firma inválida con `401`: ____
- [ ] Panel sin reservas PENDIENTES ajenas a la sesión: ____

---

## 2. Tabla maestra de la sesión

Orden recomendado: **1 → 2 → 4a → 4b → 5 → 3**. El escenario 3 se deja al final
porque quema la tarjeta bloqueada. Una fila por ejecución, en el orden real en
que ocurrió (no en el orden del guion, si se alteró).

| Hora | # | Reserva | `requestId` | Collect / valor | Resultado | Captura |
|---|---|---|---|---|---|---|
| | 1 | | | — | | |
| | 2 | | | | | |
| | 4a | | | | | |
| | 4b | | | — | | |
| | 5 | | — | — | 400 local | |
| | 3 | | | | | |

Si un escenario se repite (por un fallo previo o a petición del analista), se
añade una fila nueva; nunca se sobrescribe la anterior.

---

## 3. Fichas por escenario

Cada ficha tiene los mismos campos. Los `requestId` de la corrida del 26-nov se
incluyen solo como **referencia** para que Evertec consulte sus registros; el
`requestId` que certifica es el de la sesión.

### Escenario 1 — Tokenizar sin cobro

| Campo | Valor |
|---|---|
| Objetivo | Guardar el instrumento sin ejecutar ningún cobro y sin alterar el estado del pago. |
| Reserva | |
| Tarjeta | `4110 7600 0000 0008` (aprobada) |
| Acción realizada | Escudo → «Registrar tarjeta de garantía» → checkout de tokenización pura → *Volver al comercio* |
| `requestId` (sesión de tokenización) | |
| `requestId` de referencia (26-nov) | `3971301` |
| Respuesta observada | HTTP ___ · token `ACTIVO` · vigencia ___ |
| Estado del pago / reserva | Sin cambio: ___ |
| Aviso en pantalla | «Medio de pago actualizado para la reserva …»: sí / no |
| Captura(s) | `escenario-1-modal-token.png`, `escenario-1-aviso-retorno.png`, `escenario-1-fila-activa.png` |
| Estado | `CUMPLE` / `NO CUMPLE` / `PENDIENTE` / `NO EJECUTADO` |
| Observaciones | |

### Escenario 2 — Dos rechazos recuperables

| Campo | Valor |
|---|---|
| Objetivo | Un rechazo por fondos/cupo no invalida el token; se acumulan intentos. |
| Reserva | |
| Tarjeta | `4110 7600 0000 0016` (rechazos) |
| Acción realizada | Icono de tarjeta → concepto `DEDUCIBLE` → monto ___ → «Confirmar y Cobrar» ×2 |
| `requestId` intento 1 | |
| `requestId` intento 2 | |
| `requestId` de referencia (26-nov) | `3971303`, `3971304` |
| Respuesta observada | HTTP 402 · `attempts: 1` y `attempts: 2` |
| Mensaje del emisor | |
| Estado del token tras el 2.º rechazo | `ACTIVO` (esperado) |
| Captura(s) | `escenario-2-dos-rechazos.png` |
| Estado | |
| Observaciones | |

### Escenario 4a — Invalidación automática al tercer rechazo

| Campo | Valor |
|---|---|
| Objetivo | El tercer rechazo consecutivo desvincula el token sin intervención. |
| Reserva | (la misma del escenario 2) |
| Tarjeta | `4110 7600 0000 0016` |
| Acción realizada | Tercer cobro por ___ desde el icono de tarjeta |
| `requestId` intento 3 | |
| `requestId` de referencia (26-nov) | `3971305` |
| Respuesta observada | HTTP 402 · `attempts: 3` · `tokenInvalidation.applied: true` |
| `tokenInvalidation.reason` | |
| Mensaje en pantalla | «La tarjeta fue desvinculada (3 intentos de cobro rechazados consecutivamente)…»: sí / no |
| Auditoría mostrada | `SyncLog` `[Token] Token invalidado…`: sí / no · hora ___ |
| Captura(s) | `escenario-4a-cancelada.png` |
| Estado | |
| Observaciones | |

### Escenario 4b — Invalidación manual

| Campo | Valor |
|---|---|
| Objetivo | La vía administrativa invalida el token sin tráfico de cobro (cliente cambia de tarjeta). |
| Reserva | |
| Tarjeta | `4110 7600 0000 0008` |
| Acción realizada | Escudo → motivo «___» → «Cancelar suscripción e invalidar token» |
| `requestId` (sesión asociada) | |
| `requestId` de referencia (26-nov) | `3971306` |
| Respuesta observada | HTTP 200 · `{ ok: true, tokenStatus: "CANCELADO" }` |
| Mensaje en pantalla | «Suscripción cancelada y token invalidado…»: sí / no |
| Motivo registrado | |
| Captura(s) | `escenario-4b-invalidacion-manual.png` |
| Estado | |
| Observaciones | |

### Escenario 5 — Un token invalidado no admite cobros

| Campo | Valor |
|---|---|
| Objetivo | La validación es local y previa: no gasta intento ni llega al emisor. |
| Reserva | (la del escenario 4a, token `CANCELADO`) |
| Acción realizada | Vista de gestión del escudo + `POST /api/payments/collect` |
| `requestId` | **Ninguno** (no hay tráfico a la pasarela) |
| Respuesta observada | HTTP 400 · `status: "CANCELLED"` · `tokenStatus: "CANCELADO"` · `retokenizationRequired: true` |
| Mensaje | «El token de la tarjeta fue cancelado y no admite nuevos cobros.» |
| Comprobación en Red | ¿Se creó sesión o `DepositCharge`? No (esperado): ___ |
| Captura(s) | `escenario-5-fila-sin-cobro.png` (+ JSON del 400 en el cuerpo) |
| Estado | |
| Observaciones | |

### Escenario 3 — Rechazo no recuperable (tarjeta bloqueada)

| Campo | Valor |
|---|---|
| Objetivo | El veredicto del emisor (no el global `XN`) invalida el token en el primer intento. |
| Reserva | |
| Tarjeta | `4716 3751 8409 2180` (bloqueada, entregada por Evertec) |
| Acción realizada | Tokenizar sin cobro → un único `Collect` por $87.500 |
| `requestId` tokenización | |
| `requestId` cobro | |
| `requestId` de referencia (26-nov) | tokenización `3971788`, cobro `3971789` |
| Respuesta observada | HTTP 402 · `attempts: 1` · `tokenInvalidation.applied: true` |
| Mensaje del emisor mostrado | Debe ser **37 «Negada, Tarjtea bloqueada retener/capturar»**; «Se ha rechazado la petición» delata un build sin `ef32c55` |
| `tokenInvalidation.reason` | |
| Estado del token | `CANCELADO` (esperado) |
| Captura(s) | `escenario-3-cancelada.png` |
| Estado | |
| Observaciones | |

---

## 4. Notificación entrante real (webhook)

Escenario aparte: no se certifica con capturas del ciclo del token, sino con una
notificación que Evertec envíe a nuestro endpoint. Detalle operativo en el
runbook §4, «Notificación entrante real».

| Campo | Valor |
|---|---|
| Reserva pagada | |
| `requestId` de la sesión pagada | |
| Mensaje en `SyncLog` | `[Webhook Evertec] Pago APROBADO para reserva <CÓDIGO>` |
| Hora del `SyncLog` (`createdAt`) | |
| `payload.authorization` / `payload.hasToken` | |
| Log de Vercel | `POST /api/webhooks/placetopay ___` a las ___ |
| Estado del pago / reserva tras la notificación | `APROBADO` / `PAGADA` |
| Captura(s) | `notificacion-webhook-<requestId>.png` |
| Estado | |
| Si no llegó | Código observado (`401` firma / `502` consulta / `200 duplicate`): ___ · reenvío pedido: sí / no |

No se sustituye por un `curl` firmado con nuestra propia llave: eso prueba que
el endpoint responde, no que Evertec notifique.

---

## 5. Índice de capturas

Toda captura va a pantalla completa, con datos personales ficticios difuminados
igual que en el paquete del 26-nov, y con el código de reserva visible.

| Archivo | Escenario | `requestId` visible | Tomada (hora) | Verificada |
|---|---|---|---|---|
| | | | | |
| | | | | |

Nombres esperados: `escenario-N-<estado>.png` y `notificacion-webhook-<requestId>.png`.

---

## 6. Resumen de resultados

| Escenario | Estado | `requestId` | Captura |
|---|---|---|---|
| 1 · Tokenizar sin cobro | | | |
| 2 · Dos rechazos recuperables | | | |
| 4a · Invalidación automática | | | |
| 4b · Invalidación manual | | | |
| 5 · Token invalidado sin cobros | | | |
| 3 · Rechazo no recuperable | | | |
| Notificación entrante (webhook) | | | |

Declaración: de los siete puntos anteriores, ___ `CUMPLE`, ___ `NO CUMPLE`,
___ `PENDIENTE`, ___ `NO EJECUTADO`.

---

## 7. Hallazgos

Un hallazgo no es un fallo de la sesión si se documenta. Se anota lo observado,
sin interpretar y sin arreglarlo en caliente.

| # | Escenario | Qué se observó | Evidencia (`requestId` / captura) | Impacto | Estado |
|---|---|---|---|---|---|
| 1 | | | | | Abierto / Cerrado |

---

## 8. Pendientes

**Esta sección no se puede dejar vacía.** Lo que no se ejecutó, lo que quedó en
rojo y lo que depende de un tercero se declara aquí, con responsable y fecha. Un
acta sin pendientes y sin evidencia de algún escenario es un acta incompleta, no
un acta limpia.

| # | Pendiente | Por qué quedó abierto | Responsable | Fecha límite | Estado |
|---|---|---|---|---|---|
| 1 | Evidencia de notificación entrante de Evertec | Requiere la URL registrada en la cuenta sandbox y una sesión pagada | | | Abierto |
| 2 | Confirmación del registro de `…/api/webhooks/placetopay` en la cuenta sandbox | Depende de Evertec | | | Abierto |
| 3 | Confirmación de que `P2P_TRAN_KEY` es del mismo comercio | Depende de Evertec | | | Abierto |
| 4 | `CRON_SECRET` configurado en Vercel (sonda `200` con bearer, `401` sin él) | Verificación de entorno | | | Abierto |
| 5 | Criterio de cierre formal (acta firmada, correo de aprobación o habilitación en producción) | Depende de Evertec | | | Abierto |
| 6 | Rotación de `ADMIN_PASSWORD`, `SYNC_TOKEN` y `P2P_TRAN_KEY` tras la sesión | Higiene de credenciales | | | Abierto |
| 7 | Limpieza de reservas y tokenizaciones de prueba | Dejar el panel como se encontró | | | Abierto |

Añadir una fila por cada `PENDIENTE` o `NO CUMPLE` de §3 y §4.

---

## 9. Cierre

- [ ] Tabla de §2 completa, con hora y `requestId` de cada ejecución.
- [ ] Cada ficha de §3 y §4 con estado explícito; ninguna en blanco.
- [ ] Capturas en el ZIP y `SHA-256` anotado en §1.
- [ ] `docs/evidencia/README.md` actualizado con los `requestId` de la sesión.
- [ ] §8 con responsable y fecha en todas las filas.
- [ ] Reservas de la sesión conservadas en el sandbox hasta que Evertec confirme
      (no se borran: se cancelan con `DELETE /api/reservations/:id` → `CANCELADA`).

| Firma | Nombre | Cargo | Fecha |
|---|---|---|---|
| Por Dinamo | | | |
| Por Evertec | | | |

---

## Anexo — Qué no cubre esta acta

No certifica por sí sola: la tokenización en producción (`P2P_ENV=prod`), los
cobros posteriores sobre tarjetas reales, cuotas o diferidos, anulaciones y
reversos, ni la disponibilidad del servicio. Si Evertec los incluye en su lista
de comprobación, se ejecutan y se añaden como fichas nuevas en §3.
