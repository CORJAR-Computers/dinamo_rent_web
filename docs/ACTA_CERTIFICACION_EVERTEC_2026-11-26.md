# Acta de certificación — anexo técnico de la corrida del 26-nov-2026

Acta **parcial**: no es la sesión asistida con el analista de Evertec (esa
requiere el paquete de capturas y los siete escenarios de
`PLANTILLA_ACTA_CERTIFICACION.md`). Recoge únicamente lo que se ejecutó y se
verificó en esta corrida local contra el sandbox de PlacetoPay, con los datos
tal como quedaron en la base y en `SyncLog`. Todo lo que no se ejecutó figura
como `PENDIENTE` en §6.

Regla aplicada, la misma de la plantilla: **si no está en un registro
verificable, no existe para el acta.**

---

## 1. Datos de la corrida

| Campo | Valor |
|---|---|
| Fecha (hora Colombia, UTC-5) | 26 de noviembre de 2026 |
| Ventana ejecutada | 21:23 – 21:25 (UTC: 27-nov 02:23 – 02:25) |
| Modalidad | Ejecución local de QA. **Sin analista de Evertec y sin videollamada** |
| Conductor / escriba | Agente de QA (Dinamo) · `QA Evertec (administrador)` en el registro de consentimiento |
| Comercio | DINAMO RENTA CAR S.A.S. — NIT 900694866-3 |
| Entorno de la pasarela | `P2P_ENV=test` → `checkout-test.placetopay.com` (banner «Modo de pruebas. No habrá afectación monetaria a los medios de pago») |
| Simulador local | `P2P_MOCK` sin definir: el tráfico fue **al sandbox real**, no a un mock |
| Cliente usado | Dev server local `127.0.0.1:5199` (no el deployment de Vercel) |
| Build | Build de desarrollo sobre `ea8bd85` (el código certificado no corresponde a un deployment) |
| Capturas | **Ninguna de esta corrida.** La evidencia de estos tres pasos es de base de datos (`SyncLog`) y no hay capturas ni `SHA-256` propios. Las ocho capturas que acompañan al correo son de la corrida de la matriz de escenarios del mismo día (`docs/evidencia/`, escenarios 1, 2, 3, 4a, 4b y 5) |
| Reserva usada | `DIN-2026-9107` · `cmwxypjf60002jn0847klowx0` · cliente `Ensayo Certificacion Evertec` (CC 1010101010) · Renault Logan, 15–18 dic 2026 · total 624.750 COP · garantía 131.250 COP · nota «ENSAYO E2E certificacion Evertec - borra» |

**Nota de estado posterior (27-nov-2026).** El código con el que se ejecutó esta
corrida —`ea8bd85` más los cambios que entonces estaban sin commitear— ya está
versionado en `main`: la tanda que lo contiene son los ocho commits de
`c8902ba` a `5a5396d`, con `5a5396d` como punta. No cambia el alcance de esta
acta: lo verificado fue el dev server local, no un deployment certificado.

---

## 2. Lo ejecutado, en orden

| Hora (UTC) | Paso | Reserva | Referencia / evidencia | Resultado |
|---|---|---|---|---|
| 27-nov 02:23:41 | Registro manual del consentimiento | DIN-2026-9107 | `SyncLog` `cmwycxp0q0000mng0qhaya97l` | `CUMPLE` |
| 27-nov 02:24:07 | Re-tokenización (sin cobro) | DIN-2026-9107 | sesión `3972115` | `CUMPLE` |
| 27-nov 02:25:36 | Cobro con token por 1.000 COP | DIN-2026-9107 | `COL-DIN-2026-9107-MWYD04L9` · aut. `482566` | `CUMPLE` |

---

## 3. Fichas

### 3.1 Registro manual del consentimiento (control previo al cobro)

| Campo | Valor |
|---|---|
| Objetivo | Que una reserva anterior al control de términos quede habilitada para cobrar **sin inventar** la aceptación: la registra un administrador, con versión, hash, fecha, IP y responsable. |
| Punto de partida | La reserva no tenía `termsVersion`, `termsHash` ni `termsAcceptedAt`. `POST /api/payments/collect` la rechazaba con `400 NO_CONSENT` antes de crear cargo o llamar a la pasarela. |
| Acción | Panel `/admin/reservas` → tarjeta de garantía de la reserva → «Registrar consentimiento» con responsable y soporte |
| Documento aceptado | Términos v**2026-11-23** |
| SHA-256 del texto | `c05c732cbdb9aebc9261543965ca7edeb8ab12fd930632e65be0a71c23aafbcf` |
| Fecha del registro | 2026-11-27T02:23:41.309Z (26-nov 21:23, hora Colombia) |
| IP registrada | `127.0.0.1` — IP **del registro** (dev server local), no del cliente |
| Responsable | `QA Evertec (administrador)` |
| Soporte declarado | «Ensayo E2E de certificación: contrato firmado en mostrador (reserva de prueba)» |
| Audiencia | `SyncLog` `cmwycxp0q0000mng0qhaya97l`, `entityId` = reserva; payload con `version`, `hash`, `acceptedAt`, `ip`, `registeredBy`, `note` y estado previo (`null`) |
| Verificación en el panel | Bloque «Consentimiento Términos v2026-11-23 · Registrado el 26 de nov de 2026, 09:23 p. m. · IP del registro 127.0.0.1 · Por QA Evertec (administrador)» + «Registro manual (no capturado en el checkout) · Soporte: …» |
| Estado | `CUMPLE` |

**Observaciones.** El hash y la versión los calcula el servidor: el formulario
solo envía responsable y soporte. El consentimiento es inmutable por
diseño (segundo intento → `409 CONSENT_ALREADY_RECORDED`), y la IP guardada es
la del registro, no la del cliente; el panel lo rotula así explícitamente.
La reserva es de prueba, por eso el soporte lo dice.

### 3.2 Re-tokenización en sandbox (sin cobro)

| Campo | Valor |
|---|---|
| Objetivo | Reemplazar un token ya inválido sin ejecutar ningún cobro. |
| Situación previa | El token anterior (`a981f37e…`, Visa •••• 0008) estaba `CANCELADO` desde el 26-nov 19:49 por el rechazo del escenario de tarjeta bloqueada (ver §4). |
| Acción | Panel → modal de la tarjeta → «Actualizar medio de pago»; sesión hospedada de PlacetoPay |
| Sesión de tokenización | **`3972115`** (`SyncLog` 02:24:07, `purpose: RETOKENIZACION`) |
| Tarjeta | `4110 7600 0000 0008` (Visa, sandbox) |
| Resultado en la pasarela | Pantalla «Medio de pago guardado — **Proceso Aprobado**» · método `•••• 0008` · fecha de transacción 2026-11-26 21:25:01 |
| Retorno al comercio | Aviso «Medio de pago actualizado para la reserva DIN-2026-9107. El token quedó activo para cobros de garantía.» |
| Token nuevo | `ebd6d456…` · franquicia `visa` · vigencia `2030-12-31` · estado `ACTIVO` |
| Cobro ejecutado en este paso | **Ninguno** (`SyncLog` no registra `DepositCharge` hasta el paso siguiente) |
| Incidencia registrada | 02:25:12 `SyncLog` `[Token] No fue posible invalidar el token anterior…: El token usado es inválido` (`FAILED`). El token anterior ya estaba cancelado; el nuevo se guardó igualmente y el cobro posterior lo usó. |
| Estado | `CUMPLE` (con la incidencia de §4 documentada) |

### 3.3 Cobro aprobado con token (1.000 COP)

| Campo | Valor |
|---|---|
| Objetivo | Cobrar con el token almacenado y obtener aprobación real del emisor en sandbox. |
| Acción | Modal «Cobro a Tarjeta de Garantía» → concepto `DEDUCIBLE` → 1.000 COP → «Confirmar y Cobrar» |
| Tope contractual mostrado | 131.250 COP · Cobrado 0 · Disponible 131.250 |
| Referencia enviada | **`COL-DIN-2026-9107-MWYD04L9`** |
| Autorización del emisor | **`482566`** |
| Estado del cargo | `APROBADO` · mensaje `Aprobada -` |
| Monto | **1.000 COP** (`DepositCharge` `cmwyd05bq0007mng04kn9090v`) |
| Fecha del cargo | 2026-11-27T02:25:36.759Z |
| Snapshot de consentimiento en el cargo | v`2026-11-23` · `c05c732cbdb9…` (copiado de la reserva al crear el cargo) |
| Audiencia | `SyncLog` `cmwyd08hv0008mng0r1spv9cs`: «Cobro de garantía procesado con token … DEDUCIBLE por 1000 COP (APPROVED)», payload con `reference` y `authorization` |
| Verificación en el panel | Fila `DEDUCIBLE · $ 1.000 · APROBADO · Autorización 482566` y `Cobrado: $ 1.000 · Disponible: $ 130.250` |
| `requestId` del Collect | **No disponible en este registro**: la fila se eliminó en la limpieza y el `SyncLog` del cobro no lo incluye. La trazabilidad que queda es la referencia `COL-DIN-2026-9107-MWYD04L9` (y, del lado de Evertec, los registros de la sesión `3972115`). Desde el 27-nov-2026 el endpoint sí lo persiste en el cargo y en el `SyncLog` (pendiente #4, resuelto), así que los cobros nuevos quedan cruzables por ese id. |
| Estado | `CUMPLE` |

---

## 4. Antecedentes de la misma reserva (26-nov, corrida anterior)

Se incluyen porque explican por qué hubo que re-tokenizar. No forman parte de
esta corrida:

- **19:49** cobro de 50.000 COP `RECHAZADO` con autorización `000000` y mensaje del
  emisor «Negada, Tarjtea bloqueada retener/capturar» (tarjeta bloqueada `4716…2180`).
  El token se invalidó en el primer intento (`attempts: 1`, `immediate: true`).
- **19:48** notificación entrante de Evertec procesada: `[Webhook Evertec] Pago
  APROBADO` para `requestId 3971892`, autorización `732653`.
- **19:51** reserva cancelada por administrador.

---

## 5. Limpieza de los datos del ensayo

La reserva estaba marcada «borra». Al terminar la verificación se eliminó, en una
transacción, el 2026-11-27 ~02:44 UTC:

| Tabla | Filas |
|---|---|
| `deposit_charges` | 2 (el de 1.000 APROBADO y el de 50.000 RECHAZADO) |
| `payments` | 1 (token del sandbox) |
| `insurance_blocks` | 1 (`BLK-897686`) |
| `reservations` | 1 |

**Consecuencia para el acta:** la evidencia de los pasos 3.1–3.3 ya **no está en
las filas** de la base. Lo que queda son los **13 registros de `SyncLog`** de esa
reserva (todas las entradas con `entityId` `cmwxypjf60002jn0847klowx0`,
`cmwxyrxa50008jn084ns9xqgn`, `cmwxyuhx9000fjn08htwe9y89` o
`cmwyd05bq0007mng04kn9090v`), que no se borraron por ser la bitácora de auditoría.

En el sandbox de PlacetoPay siguen existiendo la sesión `3972115` y el
instrumento guardado de la tarjeta de prueba. El cobro de 1.000 COP fue aprobado
solo en sandbox (sin afectación monetaria); no se anuló.

---

## 6. Pendientes para una certificación completa

| # | Pendiente | Por qué quedó abierto |
|---|---|---|
| 1 | Sesión asistida con el analista de Evertec | No se ha agendado; esta corrida fue local |
| 2 | Escenarios 2, 4a, 4b, 5 y webhook de la matriz | No se ejecutaron en esta corrida |
| 3 | Certificar el **build desplegado**, no el dev server | El código verificado quedó en `main` (`5a5396d`), pero lo certificado fue la corrida sobre el dev server: el build desplegado no es ese commit |
| 4 | Conservar el `requestId` del Collect en la evidencia — **resuelto el 27-nov-2026** | Antes era un dato derivado que se perdía con la fila borrada; ahora queda en `DepositCharge.p2pRequestId`, en el `SyncLog` del cobro y en la respuesta del endpoint (incluido el caso sin veredicto de la pasarela) |
| 5 | Limitación del webhook en la cuenta sandbox | Depende de Evertec |
| 6 | Rotación de `ADMIN_PASSWORD`, `SYNC_TOKEN` y `P2P_TRAN_KEY` | Higiene de credenciales tras la sesión |

---

## 7. Declaración

De los pasos ejecutados en esta corrida: **3 `CUMPLE`**, 0 `NO CUMPLE`,
5 escenarios de la matriz + webhook `PENDIENTE`, 0 `NO EJECUTADO`.

Esta acta **no certifica** el ciclo completo de Evertec: certifica que, al
26-nov-2026, el consentimiento previo al cobro quedó registrado y auditable, que
el sandbox aprobó una re-tokenización sin cobro y que un cobro con token por
1.000 COP fue aprobado con referencia `COL-DIN-2026-9107-MWYD04L9` y autorización
`482566`, sobre una reserva de prueba que después se eliminó dejando su rastro en
`SyncLog`.

| Firma | Nombre | Cargo | Fecha |
|---|---|---|---|
| Por Dinamo | | | |
| Por Evertec | | | |
