# Runbook — sesión de certificación Evertec / PlacetoPay

Guion de la sesión en vivo con el analista de Evertec sobre el entorno desplegado
(`https://dinamorentacar.com`, `P2P_ENV=test`, checkout en
`checkout-test.placetopay.com`, banner «No habrá afectación monetaria»).

Los cinco escenarios ya se ejecutaron y evidenciaron el **26-nov-2026**; este
documento es el guion para repetirlos frente al analista y para responder si algo
falla en directo. Los `requestId` de esa corrida quedan como referencia para que
Evertec consulte sus registros en el sandbox.

---

## 1. Antes de la sesión (10 minutos)

| # | Verificación | Cómo | Criterio |
|---|---|---|---|
| 1 | Build desplegado | `gh api "repos/CORJAR-Computers/dinamo_rent_web/deployments?per_page=1" --jq '.[0].sha[0:7]'` | Debe ser `455c0cb` o posterior de `main`. Comprobar con `git merge-base --is-ancestor ef32c55 <sha>` (parser) y `… c2a1456 <sha>` (handoff) |
| 2 | Login admin | `POST /api/admin/login` o `/admin` | 200 y cookie `dinamo_admin_session`; nunca 503 |
| 3 | Sandbox real | Banner del checkout | «Modo de pruebas. No habrá afectación monetaria» |
| 4 | Panel limpio | `/admin/reservas` | Las reservas de la sesión son las únicas PENDIENTES recientes |
| 5 | Capturas listas | Carpeta `docs/evidencia/` y ZIP del 26-nov a mano | `capturas-evidencia-evertec.zip` (8 PNG) |
| 6 | Credenciales | Clave admin temporal, `P2P_TRAN_KEY` y `CRON_SECRET` en el gestor, no en el repo | Se rotan al cierre |
| 7 | Sonda autenticada | `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $CRON_SECRET" https://dinamorentacar.com/api/cron/p2p-check-pending` | **200**; sin cabecera responde **401** — en producción `?test=true` ya no autoriza |
| 8 | Webhook y notificación | `SYNC_TOKEN=... node scripts/preflight-certificacion.mjs` | «Webhook exige firma» en verde y, si ya hay evidencia, «Notificación entrante» con una línea `[Webhook Evertec]`; si no, la produce §4, «Notificación entrante real» |

Límites del entorno que condicionan el ritmo (contador compartido en base de
datos, ventana fija desde el primer intento): **8 sesiones de pago por IP cada 10
min** (la novena responde **429**), **15 reservas por IP cada 10 min** (la
decimosexta, **429**) y **5 intentos de login por IP cada 15 min** (el sexto,
**429**). Las tres respuestas incluyen la cabecera `Retry-After` en segundos.
Cinco escenarios con dos sesiones cada uno caben, pero no se reintenta a lo loco.

---

## 2. Quién conduce

| Rol | Quién | Qué hace |
|---|---|---|
| **Conductor** | Administrador de Dinamo (tú), con pantalla compartida | Ejecuta checkout y panel; habla mientras opera |
| **Escriba** | Buffy o una segunda persona | Anota `requestId`, hora, resultado y archivo de captura en la tabla de §5; no toca la app |
| **Analista Evertec** | Observa | Puede pedir repetir un escenario o revisar un `requestId` en su consola |

Regla de oro: **una sola pestaña de checkout abierta por reserva**. El retorno de
la tokenización falla cerrado si detecta dos o más sesiones de tokenización
abiertas para la misma reserva en los últimos 40 minutos («Hay más de una
tokenización reciente para esta reserva y el retorno llegó sin su
identificador…»): no es un fallo, es la guarda que evita guardar la tarjeta de la
pestaña equivocada.

---

## 3. Orden de los escenarios

**Orden recomendado para la sesión: 1 → 2 → 4a → 4b → 5 → 3.**

El escenario 3 termina con el token `CANCELADO` y la tarjeta bloqueada quemada;
se deja al final para que un corte de tiempo no deje sin ejecutar los demás. La
corrida del 26-nov se hizo en orden 1-2-3-4-5 y también es válida: el orden no
cambia el resultado, solo el riesgo de quedarse a medias.

Cada escenario se ejecuta sobre su **propia reserva** creada en el momento con
datos ficticios (las de la corrida anterior se borraron de la base). Las
referencias de pago no deben repetirse: PlacetoPay bloquea duplicados 24 h.

### 3.1 Tabla maestra

| # | Escenario | Reserva (26-nov) | Tarjeta | Collect y valor | `requestId` 26-nov | Captura |
|---|---|---|---|---|---|---|
| 1 | Tokenizar sin cobro | `DIN-2026-9401` | `4110 7600 0000 0008` (aprobada) | **Ninguno** | `3971301` (sesión) | `escenario-1-modal-token.png`, `escenario-1-aviso-retorno.png`, `escenario-1-fila-activa.png` |
| 2 | Rechazo recuperable ×2 | `DIN-2026-9402` | `4110 7600 0000 0016` (rechazos) | 2 × `$40.000` (propuesto) | `3971303`, `3971304` | `escenario-2-dos-rechazos.png` |
| 4a | Invalidación al 3.er rechazo | `DIN-2026-9402` | `4110 7600 0000 0016` | 3 × `$40.000` (propuesto) | `3971305` | `escenario-4a-cancelada.png` |
| 4b | Invalidación manual | `DIN-2026-9403` | `4110 7600 0000 0008` | **Ninguno** | `3971306` (sesión) | `escenario-4b-invalidacion-manual.png` |
| 5 | Token invalidado no admite cobros | `DIN-2026-9402` | — | **Ninguno** (400 local) | — | `escenario-5-fila-sin-cobro.png` |
| 3 | Rechazo no recuperable | `DIN-2026-8358` | `4716 3751 8409 2180` (bloqueada) | 1 × `$87.500` | tokenización `3971788`, Collect `3971789` | `escenario-3-cancelada.png` |

Los importes marcados «propuesto» son sugerencia de guion: en la corrida del
26-nov solo quedó registrado el de `$87.500` del escenario 3. El valor exacto no
cambia el veredicto; lo que se demuestra es el conteo de intentos y la
invalidación.

Datos de las tarjetas de sandbox: vencimiento `12/30`, CVV `123`, titular y
documento ficticios cargados en la reserva.

---

## 4. Guion escenario por escenario

### Escenario 1 — Tokenizar sin cobro
**Preparación.** Reserva nueva (Logan sirve: 4 unidades) con datos ficticios.
**Acciones.** Panel → icono del **escudo** en la columna de acciones de la fila
(tooltip «Tarjeta de Garantía: registrar o actualizar el medio de pago, aplicar
cobros y cancelar la suscripción») → botón **«Registrar tarjeta de garantía»**
(«Actualizar medio de pago» si la reserva ya tenía token) → se abre el checkout
de **tokenización pura** (bloque `subscription`, sin objeto `payment`; la
referencia es el código de reserva) → tarjeta `4110 7600 0000 0008` →
*Continuar* → «Medio de pago guardado» → *Volver al comercio* (los tres textos
son del checkout de PlacetoPay).
**En pantalla.** Checkout: «Proceso Aprobado», referencia = código de reserva,
`•••• 0008`. Al volver, el panel queda en
`/admin/reservas?token=actualizado&reserva=<código>`, muestra el aviso «Medio de
pago actualizado para la reserva … El token quedó activo para cobros de
garantía.», limpia la URL y la fila pasa a «Tarjeta Garantía (activa)» con el
icono de cobro ya visible.
**Cierre.** Decir en voz alta: «no hubo cargo; solo se guardó el instrumento y el
estado del pago de la reserva no cambia».

### Escenario 2 — Dos rechazos recuperables
**Preparación.** Reserva nueva; tokenizar `4110 7600 0000 0016` (mismo
procedimiento del escenario 1).
**Acciones.** Icono de **tarjeta** en la fila (tooltip «Aplicar Cobro a Garantía
con Token Place to Pay») → en el modal, concepto `DEDUCIBLE` («Deducible por
Siniestro o Daños Menores») y monto `40000` → botón **«Confirmar y Cobrar
$40.000»** → repetir una segunda vez.
**En pantalla.** Dos veces el aviso rojo del modal con el texto del emisor (el
panel no muestra contador de intentos). El conteo se enseña en la pestaña Red:
HTTP 402 con `attempts: 1` en la primera respuesta y `attempts: 2` en la segunda.
La fila sigue con «Tarjeta Garantía (activa)»: dos rechazos no invalidan.
**Cierre.** «La tarjeta sigue vinculada; el tercer rechazo consecutivo la
desvincula».

### Escenario 4a — Invalidación automática al tercer rechazo
**Preparación.** La misma reserva y token del escenario 2 (dos rechazos ya
acumulados).
**Acciones.** Tercer cobro por `$40.000`, con el mismo procedimiento del
escenario 2.
**En pantalla.** El aviso rojo del modal añade el sufijo «La tarjeta fue
desvinculada (3 intentos de cobro rechazados consecutivamente); se requiere
registrar una nueva tarjeta para cobrar la garantía.»; el badge del modal pasa a
«CANCELADA», la fila a «Tarjeta Garantía (cancelada)» y desaparece el icono de
cobro. En la pestaña Red, la respuesta 402 trae `attempts: 3`,
`tokenInvalidation.applied: true` y `tokenInvalidation.reason`.
**Cierre.** Mostrar el `SyncLog` (`/api/sync`, entrada `[Token] Token invalidado…`)
para que el analista vea la auditoría, no solo la UI.

### Escenario 4b — Invalidación manual
**Preparación.** Reserva nueva con tarjeta aprobada `4110 7600 0000 0008`
tokenizada (escenario 1 sobre otra reserva o nueva tokenización).
**Acciones.** Abrir el modal de tarjeta (escudo) → elegir «Motivo de la
cancelación de la suscripción» → botón **«Cancelar suscripción e invalidar
token»**. No hay diálogo de confirmación aparte: el aviso ámbar del modal («Se
ejecutará la invalidación real del instrumento en Place to Pay…») hace esa
función.
**En pantalla.** Aviso verde «Suscripción cancelada y token invalidado. …», badge
del modal «CANCELADA», fila «Tarjeta Garantía (cancelada)» sin icono de cobro y
el motivo en *Cargos aplicados al token* (solo si hubo cargos). En la pestaña
Red, HTTP 200 con `{ ok: true, tokenStatus: "CANCELADO" }`; el `SyncLog` registra
«[Token] Suscripción cancelada y token invalidado para la reserva …». No hay
tráfico de cobro.
**Cierre.** «El token existe pero ya no puede usarse; es la vía administrativa
cuando el cliente cambia de tarjeta».

### Escenario 5 — Un token invalidado no admite cobros
**Preparación.** La reserva del escenario 4a (token ya `CANCELADO`).
**Acciones.** Abrir el modal de tarjeta (escudo): la vista de gestión muestra el
aviso rojo «La suscripción de esta reserva no tiene un token activo (cancelada,
vencida o aún no registrada): no admite nuevos cobros…», y la fila no tiene
icono de cobro. Para el acta, `POST /api/payments/collect` con `reservationId` y
`amount` devuelve **400** con `status: "CANCELLED"`, `tokenStatus:
"CANCELADO"`, `retokenizationRequired: true` y el mensaje «El token de la tarjeta
fue cancelado y no admite nuevos cobros.».
**En pantalla.** **No sale tráfico a la pasarela**: ninguna respuesta trae un
`requestId` nuevo, no se creó sesión ni `DepositCharge`.
**Cierre.** «La validación es local y previa: no se gasta un intento ni se
molesta al emisor».

### Escenario 3 — Rechazo no recuperable (tarjeta bloqueada)
**Preparación.** Reserva nueva; tokenizar `4716 3751 8409 2180` (la tarjeta que
entregó Evertec), sin cobro.
**Acciones.** Un único cobro por `$87.500` desde el icono de tarjeta de la fila
(mismo procedimiento del escenario 2).
**En pantalla.** El modal muestra el texto del emisor, **37 «Negada, Tarjtea
bloqueada retener/capturar»** (la errata es del emisor), seguido de «La tarjeta
fue desvinculada (Tarjeta bloqueada o cancelada); se requiere registrar una nueva
tarjeta para cobrar la garantía.»; el badge pasa a «CANCELADA», la fila a
«Tarjeta Garantía (cancelada)» y desaparece el icono de cobro. En la pestaña Red,
la respuesta 402 trae `attempts: 1`, `tokenInvalidation.applied: true` y
`tokenInvalidation.reason` = «Tarjeta bloqueada o cancelada».
**Qué mirar.** Que el texto mostrado sea el del emisor y no «Se ha rechazado la
petición» (mensaje global `XN`). Ese detalle es la prueba de que el build incluye
`ef32c55`.
**Cierre.** Es el escenario que más pesa: un solo intento invalida por política.

---

### Notificación entrante real (webhook)

Las capturas del 26-nov prueban el ciclo del token, **no** que Evertec haya
llamado a nuestro endpoint. Este paso produce esa evidencia y se hace una vez,
antes o durante la sesión.

**Requisito que no se ve desde el código.** La URL
`https://dinamorentacar.com/api/webhooks/placetopay` debe estar
registrada en la cuenta sandbox de PlacetoPay. El checkout no la envía en el
payload de la sesión; si no está registrada, no llega ninguna notificación.
Confirmarlo con el analista antes de empezar (ver §8).

**Cómo provocarla.** Reserva nueva → sesión de **pago** normal (no tokenización)
→ tarjeta `4110 7600 0000 0008` → pagar. No recargar `/pago/retorno` ni tocar el
panel: esa pantalla solo lee la base y no consulta la pasarela. Evitar la franja
de las 08:00 UTC, cuando corre el cron, para no confundir el origen.

**Qué debe aparecer (≤2 min).**
- `SyncLog`: `[Webhook Evertec] Pago APROBADO para reserva <CÓDIGO>`, con
  `payload.requestId` = la sesión pagada, `payload.authorization` y
  `payload.hasToken`. El pago pasa a `APROBADO` y la reserva a `PAGADA` en la
  misma transacción.
- Si la notificación es de una tokenización: `[Token] Nueva tokenización
  administrativa para reserva <CÓDIGO>` (el retorno escribe otra línea distinta,
  `[Token] Tarjeta de garantía actualizada…`; la que sirve es la primera).
- Vercel → Logs: `POST /api/webhooks/placetopay 200` a la hora del pago.
- Consulta para el acta (o `GET /api/sync` con bearer, que devuelve las últimas
  10 líneas):
  ```sql
  SELECT "createdAt", message, payload->>'requestId' AS request_id
  FROM sync_logs
  WHERE message LIKE '[Webhook Evertec]%' OR message LIKE '[Token] Nueva tokenización%'
  ORDER BY "createdAt" DESC LIMIT 5;
  ```

**Si no llega.**
1. Pedir al analista que reenvíe la notificación de ese `requestId` desde su
   consola y mirar Vercel → Logs.
2. `401` → la firma no cuadra: la `P2P_TRAN_KEY` del despliegue no es la del
   comercio (o la cuenta firmó con otra llave). No es un fallo de red.
3. `502` → el webhook llegó, pero `QuerySession` no pudo confirmar la sesión.
4. `200` con `duplicate: true` → la notificación llegó, pero el pago ya estaba
   `APROBADO`: el webhook no reescribe ni deja `SyncLog`, así que la prueba es el
   200 en el log y que el pago conserva su `updatedAt`.
5. `200` «Notificación procesada sin registro local» → el `requestId` no
   corresponde a ningún pago de esta base.

**Qué capturar.** La línea de `SyncLog` con su `createdAt` y `requestId`, la
línea de Vercel con hora y estado, y la fila del panel en `PAGADA`. Nombre:
`notificacion-webhook-<requestId>.png`. Anotar hora y `requestId` en §5.

**Si no se consigue.** Se declara pendiente en el acta. No se sustituye por un
`curl` firmado con nuestra llave: eso prueba el endpoint, no que Evertec
notifique. El preflight solo confirma que una firma inválida se rechaza con 401
y, con `SYNC_TOKEN`, si ya existe una línea `[Webhook Evertec]` en `/api/sync`.

---

## 5. Registro de la sesión

El escriba completa esta tabla en vivo; es la fuente del acta.

| Hora | # | Reserva | `requestId` | Collect / valor | Resultado | Captura |
|---|---|---|---|---|---|---|
| | 1 | | | — | | |
| | 2 | | | | | |
| | 4a | | | | | |
| | 4b | | | — | | |
| | 5 | | — | — | 400 local | |
| | 3 | | | | | |

Capturas: pantalla completa, sin datos personales reales (los ficticios se
difuminan igual que en el paquete del 26-nov). Nombre de archivo
`escenario-N-<estado>.png`.

---

## 6. Si algo falla en vivo

**Reglas generales, válidas para todos los escenarios**

1. **No se improvisa evidencia.** Nada de repetir hasta que salga ni de editar
   capturas: se anota el `requestId`, lo que se vio y se sigue.
2. **Se distingue veredicto del emisor de fallo nuestro.** Un `PENDING` (timeout,
   HTTP 5xx, error de red) **no** es un rechazo: el token no se toca y el cargo
   queda pendiente de verificar.
3. **Se dice el estado real y el plan**, sin prometer resultados.

| Síntoma | Qué significa | Qué se dice / hace |
|---|---|---|
| El rechazo muestra «Se ha rechazado la petición» | El build desplegado no tiene el fix del parser | «Detengo la demo: el despliegue no es el que certificamos. Verifico el SHA y te confirmo por escrito antes de continuar.» |
| `502` / «No fue posible confirmar el cobro con la pasarela (…). El cargo quedó PENDIENTE…» | La pasarela no respondió: no hay veredicto del emisor | «No hubo veredicto; el cargo quedó PENDIENTE y el token intacto. Te paso el `requestId` para que lo verifiques y repetimos con referencia nueva.» |
| `502` / «…El cobro no se ejecutó y el token de la tarjeta no se modificó.» | El request del `Collect` no pasó la validación de la pasarela | «El cobro no se ejecutó y el token no se tocó. Corrijo el dato y repito: no es un veredicto del emisor.» |
| `429` al crear sesión o reserva | Límite de 8 sesiones / 15 reservas por IP cada 10 min | «El entorno limita operaciones por IP; esperamos N segundos (`Retry-After`).» |
| El retorno de tokenización dice «Hay más de una tokenización reciente» | Dos pestañas o dos sesiones para la misma reserva | «La guarda evita guardar la tarjeta equivocada. Cierro la otra pestaña y repito la tokenización.» |
| La fila muestra un `••••` que no corresponde | El `cardLast4` viene de la última consulta a la pasarela y puede quedar desfasado tras una re-tokenización | «El token es el de la tarjeta correcta; la etiqueta se actualiza al re-tokenizar. Te muestro la consulta de la sesión.» |
| En el escenario 2 aparece «La tarjeta fue desvinculada» antes del tercer rechazo | Se arrastran rechazos previos de esa reserva | Se detiene: «esta reserva ya tenía intentos; abro una nueva para el escenario 2». |
| El escenario 3 no invalida en el primer intento | El mensaje no se clasificó como definitivo | «Reviso el mensaje que devolvió el emisor y el `SyncLog`; si la política no se aplicó, lo reporto como hallazgo y no lo maquillo.» |
| El escenario 5 ofrece el icono de cobro | El token no está `CANCELADO` | Se muestra el estado del instrumento en el panel y se reporta como hallazgo. |
| Falla el login del panel | Clave incorrecta → 401; 5 intentos por IP en 15 min → 429; `ADMIN_PASSWORD`/`ADMIN_SECRET` ausentes en producción → 503 | «El acceso está bloqueado por intentos; uso la sesión ya abierta y reviso la configuración de entorno.» |
| La sonda responde `401` | Se llamó sin `Authorization: Bearer $CRON_SECRET`; el atajo `?test=true` solo existe fuera de producción | «La sonda exige el secreto; la disparo con la cabecera y te muestro el 200.» |
| Se cae la conexión o el navegador | — | Se retoma con el `requestId` ya anotado; el estado se consulta, no se reconstruye de memoria. |

**Qué no se dice nunca.** «Ya quedó», «debe estar», «en mi máquina funciona».
Si no está en pantalla o en un `requestId` verificable, no existe para el acta.

---

## 7. Cierre de la sesión

1. Completar la tabla de §5 y adjuntar las capturas nuevas.
2. Recalcular el ZIP de evidencia y actualizar `docs/evidencia/README.md` con los
   `requestId` de la sesión.
3. Conservar las reservas de la sesión en el sandbox al menos hasta que Evertec
   confirme; no hay borrado físico, solo cancelación
   (`DELETE /api/reservations/:id` → `CANCELADA`).
4. Rotar `ADMIN_PASSWORD` al terminar y registrar la fecha en el handoff.

---

## 8. Notas conocidas (para no confundirlas con fallos)

- Las notificaciones `REJECTED` del webhook actualizan el pago pero **no**
  escriben `SyncLog`; solo `APROBADO` y «reserva cancelada» lo hacen. No es un
  fallo de la sesión.
- `GET /api/cron/p2p-check-pending` exige `Authorization: Bearer $CRON_SECRET` en todos los entornos; Vercel Cron añade la cabecera sola cuando el secreto existe. `?test=true` solo se acepta con `NODE_ENV` distinto de `production`.
- Una notificación de re-tokenización no se puede asociar al pago: el `Payment`
  no guarda el `requestId` de esa sesión hasta que existe `create-session`. La
  trazabilidad de esas sesiones vive en el `SyncLog`.
- El panel muestra el icono de cobro solo con token `ACTIVO`; con `CANCELADO` o
  `EXPIRADO` desaparece y el `Collect` responde **400** local con
  `status: "CANCELLED"` (o `"EXPIRED"`) y `retokenizationRequired: true`, sin
  llamar a la pasarela.
