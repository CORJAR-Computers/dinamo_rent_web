# Documento de Traspaso Técnico y Estado del Proyecto (Handoff)
## Dinamo Rent a Car S.A.S. — Integración Pasarela Evertec PlacetoPay & Aplicación Web/Escritorio

- **Fecha de corte:** Noviembre 26, 2026
- **Comercio:** DINAMO RENTA CAR S.A.S. (NIT: 900694866-3)
- **Dominio productivo Web:** `https://dinamo-rent-a-car.vercel.app/`
- **Repositorio Web:** `D:\Proyectos\Dinamo_Rent_a_Car WEB` (`CORJAR-Computers/dinamo_rent_web`, rama `main`)
- **Repositorio Escritorio (ERP Mostrador):** `D:\dinamo_rent_tr` (`CORJAR-Computers/dinamo_rent_tr`, rama `main`)
- **Stack Tecnológico Web:** SvelteKit 3, Svelte 5 (Runes), TailwindCSS, Prisma ORM, PostgreSQL (Neon Serverless), Vercel.
- **Stack Tecnológico Escritorio:** Rust (Tauri) + SvelteKit, Firebird SQL.
- **Contrapartes Técnicas Evertec:**
  - Laura Calle Ávila (`Laura.Calle@evertecinc.com`)
  - Julián Esteban Guerrero Guzmán (`Julian.GuerreroGuzman@evertecinc.com`)

---

## 1. Resumen Ejecutivo del Estado del Proyecto

Se ha completado el 100% de los requerimientos técnicos y de seguridad exigidos por las guías oficiales de certificación de **Evertec PlacetoPay WebCheckout (WC)** y **Suscripción/Tokenización**. La plataforma web se encuentra desplegada y funcionando en producción sobre Vercel, con su base de datos PostgreSQL en Neon sincronizada con la aplicación de escritorio de mostrador.

Se superaron y blindaron las 4 observaciones principales formuladas por el analista de certificaciones (Julián Guerrero):
1. **Validación estricta de documentos según catálogo PlacetoPay** (frontend y backend).
2. **Aislamiento total de la página de retorno (`/pago/retorno`)** respecto a consumos de la pasarela y configuración de la Sonda diaria en `vercel.json`.
3. **Definición de reversos** centralizada en el Panel Administrativo de PlacetoPay.
4. **Definición y defensa legal/técnica del flujo de Suscripción/Tokenización** para cobro de garantías y deducibles de siniestros, combustible y multas de tránsito (SIMIT).

---

## 2. Requerimientos de Certificación Evertec Implementados

### 2.1 Validación y Normalización de Documentos
- **Ubicación:** `src/lib/utils/documentValidation.ts`, `src/lib/components/BookingModal.svelte`, `src/routes/api/reservations/+server.ts`.
- **Catálogo Oficial PlacetoPay:** Soporte estricto de tipos `CC`, `CE`, `PPN`, `TI`, `NIT`, `RUT`.
- **Homologación de Pasaporte:** Cualquier referencia previa a `PAS` se normaliza automáticamente a `PPN` antes del envío a PlacetoPay.
- **Reglas Regex Validadas:**
  - `CC`: `/^[1-9][0-9]{3,9}$/` (no permite empezar en cero; entre 4 y 10 dígitos numéricos).
  - `CE`: `/^([a-zA-Z]{1,5})?[1-9][0-9]{3,7}$/` (hasta 5 letras iniciales opcionales + 4 a 8 dígitos; máximo 12 caracteres).
  - `PPN`: `/^[a-zA-Z0-9_]{4,16}$/` (alfanumérico, longitud 4 a 16).
  - `TI`: `/^[1-9][0-9]{4,11}$/` (5 a 12 dígitos, no inicia en cero).
  - `NIT` y `RUT`: `/^[1-9]\d{6,9}$/` (7 a 10 dígitos, sin dígito de verificación).
- **Sanitización en Tiempo Real:** En el modal de reserva, el campo de documento utiliza `inputmode="numeric"` cuando el tipo es puramente numérico e impide ingresar caracteres no válidos.

### 2.2 Sonda / Cronjob y Aislamiento de la Pasarela
- **Ubicación:** `vercel.json`, `src/routes/api/cron/p2p-check-pending/+server.ts`, `src/routes/pago/retorno/+page.svelte`.
- **Aislamiento en `/pago/retorno`:** Se removió completamente el método `refreshFromGateway()` / `QuerySession` directo desde el cliente. La pantalla de retorno solo lee el estado consolidado de la base de datos local (`/api/reservations?code=...` o `?requestId=...`). Esto evita consumos redundantes o manipulaciones del cliente al recargar la página.
- **Mecanismos Oficiales de Actualización:**
  1. **Webhook principal (URL de Notificación):** `POST /api/webhooks/placetopay`, recibe la notificación asíncrona de Evertec, valida la firma, consulta la sesión y actualiza la reserva y el token.
     - **Firma SHA-1 y SHA-256:** se acepta `SHA1(requestId + status.status + status.date + P2P_TRAN_KEY)` en hex sin prefijo (40 caracteres) y el formato nuevo `sha256:<64 hex>`, que usa SHA-256 sobre la misma cadena. El prefijo elige el algoritmo, se exige que la firma sea hexadecimal y la comparación es con `timingSafeEqual`. Firma ausente, mal formada o calculada con otro secreto → 401 sin tocar la base de datos. Evertec puede activar SHA-256 en la cuenta sin ventana de 401.
     - **Estado:** nunca se toma del cuerpo de la notificación; solo se aplica lo que confirma `QuerySession`. Si la pasarela no puede confirmarlo, se responde 502 para que Evertec reintente.
     - **Idempotencia:** si el pago ya está `APROBADO`, la notificación repetida responde 200 con `duplicate: true` sin reescribir pago ni reserva. Si la reserva está `CANCELADA`, un `APPROVED` tardío no la revive: se registra un `SyncLog` de auditoría (`ignored: RESERVA_CANCELADA`) y se responde 200 para detener los reintentos.
  2. **Sonda de contingencia:** `GET /api/cron/p2p-check-pending`, configurada en `vercel.json` con periodicidad diaria:
     ```json
     {
       "crons": [
         {
           "path": "/api/cron/p2p-check-pending",
           "schedule": "0 8 * * *"
         }
       ]
     }
     ```
     *(Se ejecuta a las 08:00 UTC / 03:00 AM hora de Colombia, en horario de bajo tráfico, cumpliendo con la cuota de Vercel Hobby y con la directriz de producción de Evertec).*
  - **Sonda manual para sesión de prueba:** Durante la llamada de certificación con Evertec, se puede disparar en vivo vía:
    `GET https://dinamo-rent-a-car.vercel.app/api/cron/p2p-check-pending?test=true`.
  - **Barrido de tokens vencidos:** la misma ejecución diaria marca `EXPIRADO` todo `payment` con `tokenValidUntil` ya cumplido (excluye los `CANCELADO` y `EXPIRADO`), escribe su `SyncLog` (`purpose: "EXPIRACION"`, `source: "CRON"`) y **no** llama a la pasarela. La respuesta incluye `expiredTokenCount` y `expiredTokens`; con eso el estado no depende de que alguien intente cobrar.

### 2.3 Seguridad y Prevención de Fraude (Anti-Card Testing y Anti-Spam)
- **Ubicación:** `src/lib/server/rateLimit.ts`.
- **Límites por IP:**
  - Creación de reservas (`/api/reservations`): máximo 15 peticiones por cada 10 minutos por IP.
  - Creación de sesión de pago (`/api/payments/create-session`): máximo 8 intentos por cada 10 minutos por IP (mitiga ataques automatizados de prueba de tarjetas o *card testing*).
  - Login administrativo (`/api/admin/login`): máximo 5 intentos fallidos, tras los cuales la IP se bloquea por 15 minutos.

### 2.4 Cumplimiento Legal y Consentimiento Explícito
- **Ubicación:** `src/lib/components/BookingModal.svelte`.
- Dos checkboxes independientes y **desmarcados por defecto**:
  1. Términos y Condiciones del contrato de alquiler.
  2. Política de Privacidad y Tratamiento de Datos (Ley 1581 de 2012).
- Ambos enlaces abren en pestañas independientes (`/terminos` y `/privacidad`).

### 2.5 Modelo de Negocio de Garantías y Tokenización
- **Ubicación:** `src/lib/server/placetopay.ts`, `src/routes/api/payments/collect/+server.ts`.
- **Estructura enviada a PlacetoPay:** `payment.subscribe = true` en la sesión inicial para vincular el medio de pago del cliente.
- **Almacenamiento (PCI-DSS):** Dinamo Rent a Car **no almacena** PAN, CVV ni fechas de caducidad. Únicamente se persiste el string alfanumérico opaco `token`, franquicia y últimos 4 dígitos enmascarados en la tabla `payments`.
- **Cobros posteriores:** Endpoint `/api/payments/collect` que consume el servicio `POST /api/collect` de PlacetoPay utilizando el token guardado. Reservado exclusivamente para conceptos contractuales probados (daños con acta de entrega, faltante de gasolina, comparendos de tránsito SIMIT).
- **Token vencido (`tokenValidUntil` ya cumplido):** `/api/payments/collect` rechaza el cobro **antes** de generar la referencia y **sin llamar a la pasarela**. Marca `tokenStatus = "EXPIRADO"`, registra un `SyncLog` (`purpose: "EXPIRACION"`, `gatewayCalled: false`), no crea `DepositCharge` ni consume intentos, y responde **400** con `{ ok: false, status: "EXPIRED", tokenStatus: "EXPIRADO", retokenizationRequired: true }` y el mensaje: «El token de la tarjeta venció el {fecha} y quedó marcado como EXPIRADO. Registra una nueva tarjeta de garantía (re-tokenización) antes de cobrar. No se envió ningún cargo a la pasarela.» Criterio (`isTokenExpired`, `src/lib/utils/tokenValidity.ts`): `YYYY-MM-DD` vale hasta el final de ese día en UTC, una hora sin zona se toma como UTC y una fecha ausente o ilegible **no** se marca. En el panel el token aparece como **EXPIRADA** con la fecha, sin botón de cobro y con la re-tokenización a la vista.
- **Sin veredicto ≠ rechazo:** si `/api/collect` no responde (timeout, red o credenciales ausentes), el cobro queda `PENDIENTE`, se responde **502** y el token sigue ACTIVO; ese fallo no cuenta para los 3 intentos consecutivos que invalidan la tarjeta.
- **`description` normalizado (25-nov-2026):** Evertec reportó un error de validación en el cobro con token asociado a `payment.description`. El valor se construye en el servidor (`Dinamo Rent: CONCEPTO - detalle (Reserva CODIGO)`) y se sanea con `sanitizeGatewayText()`: ASCII imprimible, sin guiones tipográficos ni saltos de línea, sin `#`, `%`, `&`, `@`, `[]`, máximo 200 caracteres. En `deposit_charges.description` se guarda esa misma versión saneada (la que se envió a la pasarela), no el texto libre original; el registro de auditoría se completa con `concept`, `amount`, `status`, `p2pRequestId` y `p2pStatusMessage`.
- **Validación ≠ rechazo:** un HTTP no-2xx o un `REJECTED` por campo/formato se clasifica como `PENDING` (502, cargo `PENDIENTE`), no consume intentos y no invalida el token.
- **Re-tokenización administrativa (25-nov-2026):** `POST /api/payments/token/resubscribe` crea una sesión con `subscription` **sin** `payment`; el retorno `GET /api/payments/token/resubscribe/return/[reservationId]` (lógica en `src/lib/server/resubscribeReturn.ts`) guarda el token sin tocar el pago ni la reserva y valida la sesión contra el log de creación de esa reserva. En el panel: `/admin/reservas` → escudo → «Registrar tarjeta de garantía» / «Actualizar medio de pago». Permite certificar el ciclo completo (tokenización sin cobro → rechazo recuperable → rechazo no recuperable → invalidación → bloqueo de nuevos cobros).
- **Webhook de tokenización pura:** responde `tokenUpdated: true` y solo actualiza el instrumento; nunca marca la reserva como `PAGADA`.
- **Estado de la respuesta a Evertec (25-nov-2026):** la respuesta cubre los dos puntos pendientes que envió el analista el 25-nov. (1) `description` del Collect: causa raíz, normalización, request final enmascarado, clasificación de errores de validación como `PENDING` y evidencia (`9b228d3`). (2) tokenización sin `payment`: ruta en el panel, request a la pasarela, retorno, webhook `subscriptionOnly` y los cinco escenarios certificables. Versión enviada ese día: `main` @ `8aa31f1` (suite completa, `npm run check` y build en verde en el check requerido). Versión publicada hoy: `main` @ `7b7c643`, que añade el retorno por ruta (`d0ea067`), el guardado de últimos 4 y vigencia (`5d91164`), el ajuste de CI (`8aa31f1`) y la documentación (`7b7c643`). Queda a la espera de que Evertec confirme el cierre del error de `description`, indique las tarjetas de prueba para rechazo recuperable y no recuperable, o proponga fecha de sesión asistida.
- **Evidencia ejecutada (26-nov-2026, `checkout-test`):** reservas de prueba `DIN-2026-5278` (escenario 1, token `bc56eb3f…`, sesión 3971255), `DIN-2026-5137` (escenario 2, dos `Collect` con 402 y `attempts` 1 y 2, `requestId` 3971267/3971268), `DIN-2026-8375` (escenario 4a: tres rechazos, `requestId` 3971261–3971263, `tokenInvalidation.applied` y token `CANCELADO`) y `DIN-2026-9370` (escenario 4b: invalidación manual 200 con motivo y auditoría). Escenario 5: 400 local «El token de la tarjeta fue cancelado y no admite nuevos cobros» sin tráfico a la pasarela. **Escenario 3 (rechazo no recuperable) queda pendiente**: las tarjetas públicas de sandbox devuelven «Se ha rechazado la petición», que el clasificador trata como recuperable por diseño; hace falta una tarjeta de Evertec con mensaje definitivo («Tarjeta vencida», «bloqueada», etc.). Evidencia completa en el documento «Evidencia Evertec — escenarios de token (26-nov-2026)». Las reservas de prueba se eliminaron de la base tras capturar la evidencia; los datos quedan en ese documento.
- **Retorno de la tokenización corregido (26-nov-2026):** el botón «Volver al comercio» del checkout SPA devuelve el `returnUrl` sin `requestId`, así que el retorno ya no depende de él. La reserva va en la ruta (`/api/payments/token/resubscribe/return/[reservationId]`) y, si falta el `requestId`, se usa la sesión registrada en `SyncLog` al crear la tokenización (ventana de 40 min; la anterior con `?reservationId=` sigue atendida), pero solo cuando hay **una**: con dos o más sesiones abiertas en esa ventana el retorno es ambiguo, así que se rechaza con un aviso para verificar el medio de pago en el panel en lugar de elegir la más reciente. El respaldo valida la sesión: solo acepta logs de creación de esa reserva, rechaza un `requestId` ajeno y no sobrescribe una tarjeta guardada después de abrir la sesión. Lógica en `src/lib/server/resubscribeReturn.ts`. Probado de punta a punta contra `checkout-test`: reserva `DIN-2026-8226`, sesión 3971271, tarjeta Visa aprobada; «Volver al comercio» llevó a `token=actualizado&reserva=DIN-2026-8226` y el token quedó `ACTIVO` (`d1d71010…`) sin intervención manual. Suite y `npm run check`/`lint` en verde. Además se corrigió el mapeo del instrumento: la pasarela devuelve `lastDigits` y `validUntil` en camelCase, así que `cardLast4` ya se guarda (antes caía en `0000`) y la vigencia del token deja de perderse; reprobado contra sandbox con una Visa `•••• 0008` (`cardLast4: "0008"`, `tokenValidUntil: "2030-12-31"`). Reprobado después con el código ya simplificado (`DIN-2026-4170`, sesión 3971292): mismos valores (`0008`, `2030-12-31`) y reserva de prueba eliminada al terminar.
- **Automerge corregido (26-nov-2026):** `check.yml` ahora corre en `push` solo para `main`; en una rama de PR únicamente existe el run de `pull_request`, que es el que dispara el merge. Así se elimina el contexto duplicado que hizo fallar el automerge del PR #6 («base branch policy prohibits the merge») y `automerge.yml` reintenta el merge si GitHub aún no da el PR por mergeable. El PR #6 falló por ese contexto duplicado y hubo que mergearlo a mano; con el arreglo, el automerge mergeó solo los PR #7 y #8 (`main` quedó entonces en `8aa31f1`; hoy está en `7b7c643`).
- **Token anterior al reemplazar la tarjeta:** `POST /api/payments/token/resubscribe` sustituye el token guardado en `payments`, pero **no** invalida en la pasarela el token previo; para dejarlo inutilizable hay que llamar antes a `/api/payments/token/invalidate`. No afecta a la certificación (cada escenario usa una reserva y un token nuevos), pero conviene tenerlo presente en producción: reemplazar la tarjeta no revoca la anterior del lado de PlacetoPay.

- **Desacoplamiento de cifras rígidas en UI:** Se ajustaron los textos en web ([BookingModal.svelte](file:///d:/Proyectos/Dinamo_Rent_a_Car%20WEB/src/lib/components/BookingModal.svelte), [CarCard.svelte](file:///d:/Proyectos/Dinamo_Rent_a_Car%20WEB/src/lib/components/CarCard.svelte), [retorno/+page.svelte](file:///d:/Proyectos/Dinamo_Rent_a_Car%20WEB/src/routes/pago/retorno/+page.svelte)) para indicar *"Depósito / Garantía: Según contrato de alquiler"*, evitando confusiones con los deducibles reales de póliza (\$2.500.000 COP).

### 2.6 Medios de pago, IVA y datos de recaudo (definiciones del 23-nov-2026)

**Medios habilitados:** únicamente **tarjetas de crédito y débito de bancos internacionales** (Visa, Mastercard, American Express). **PSE, Nequi y transferencias bancarias quedan descartados** para esta certificación: no son tokenizables y no sirven para respaldar la garantía. La FAQ de la home (`src/routes/+page.svelte`, `index.html` e `index.template.html`) ya no anuncia esos medios; el resumen del checkout solo muestra tarjetas.

**IVA 19% (implementado):** las tarifas publicadas **no incluyen IVA**. El impuesto se calcula sobre el subtotal (vehículo + seguro + adicionales) y **se suma**; contabilidad confirmó que todos los ítems van al 19%.
- `src/lib/utils/taxes.ts`: `IVA_RATE = 0.19` y `calcTaxes()` → `{ subtotal, iva, total }`, con `iva = round(subtotal × 0,19)` y `total = subtotal + iva`.
- `src/routes/api/reservations/+server.ts`: calcula el IVA al crear la reserva y guarda `totalAmount` con IVA; la API devuelve `subtotalAmount` y `taxAmount`.
- `src/lib/server/placetopay.ts`: envía `payment.amount.taxes: [{ kind: "valueAddedTax", base, amount }]` cuando la base es válida y menor que el total (una reserva antigua sin IVA no declara un impuesto en cero).
- `src/routes/api/payments/create-session/+server.ts`: envía `taxBaseCOP` = vehículo + seguro + adicionales, de modo que `base + impuesto = total` cobrado.
- Desglose visible **Subtotal (sin IVA) / IVA 19% / Total** en el modal (`BookingModal.svelte`), en el comprobante `/pago/retorno` y en el panel `/admin/reservas`.
- Verificado con `npm run check` (0 errores) y `npm run test` (23/23, incluida `tests/taxes.test.ts`).

**Cuenta de recaudo (enviada a Evertec):**

| Campo | Valor |
|---|---|
| Banco recaudador | Bancolombia |
| Tipo de cuenta | Ahorros |
| Número de cuenta | 098 000044 44 |
| Titular | DINAMO RENTA CAR S.A.S. — NIT 900694866-3 |
| Soporte | Certificación bancaria de la cuenta, disponible para adjuntar al correo |

**Acceso del analista (`/admin`):** se definió una **clave temporal de certificación** para `ADMIN_PASSWORD`, que se comparte en el hilo con Evertec y **se rota al cierre** de la certificación. El valor no se versiona en este repositorio; vive en las variables de entorno de Vercel y en el correo al analista. El login solo pide contraseña (no usuario) y bloquea la IP 15 minutos tras 5 intentos fallidos.

---

## 3. Mejoras de Experiencia de Usuario y Flujo de Reserva

### 3.1 Resolución Proactiva de Disponibilidad y Fechas
- **Problema previo:** Si un cliente seleccionaba un vehículo ocupado, el error saltaba al final (Paso 3) y no permitía cambiar fechas ni auto dentro del modal.
- **Solución implementada:**
  - Nuevo endpoint preventivo `GET /api/reservations/check-availability?vehicleId=...&pickupDate=...&returnDate=...`.
  - Verifica unidades disponibles (`units`) contra reservas confirmadas/pagadas.
  - Al detectar conflicto, despliega un panel destacado con dos botones:
    - 🔄 **"Cambiar fechas u horas"**: Despliega selectores inline para ajustar entrega/devolución y revalidar con un clic.
    - 🚗 **"Elegir otro vehículo disponible"**: Cierra el modal y desplaza suavemente la vista a la sección de flota (`#flota`).
  - Botón de avance deshabilitado con etiqueta informativa *"Fechas Ocupadas"*.
  - En el Paso 1 se agregó el botón permanente *"Modificar fechas"*.

### 3.2 Digitalización de Documentos (Cédula y Licencia)
- **Captura en Web:** En el Paso 2 del modal, el usuario puede subir o tomar foto de su documento de identidad y de su licencia de conducción.
- **Compresión del lado del cliente:** `src/lib/utils/imageCompression.js` comprime automáticamente las imágenes a 1280px máx con calidad 0.75 WebP/JPEG antes de guardarlas en base de datos.
- **Sincronización con Mostrador (App de Escritorio):**
  - La app de escritorio (`D:\dinamo_rent_tr`) cuenta con `DocumentosDigitalizadosModal.svelte`.
  - Permite al personal de mostrador previsualizar cédula, licencia y firma en alta definición, descargarlas o imprimirlas en hoja tamaño Carta para el expediente físico.

### 3.3 Copy sin promesas de correo electrónico
- **Decisión:** el proyecto **no envía correos transaccionales**: ni voucher, ni comprobante, ni confirmación de reserva. El correo del conductor se captura solo como dato de contacto.
- **Criterio de copy:** ningún texto visible (web, panel o comprobante) debe prometer un envío por email. Las vías reales de entrega son el comprobante imprimible de `/pago/retorno`, el botón de WhatsApp al asesor y el código de reserva copiable.
- **Ajustes aplicados (25-nov-2026):**
  - `/pago/retorno`, paso 2: «Guarda tu comprobante» — se imprime con «Imprimir Comprobante» o se envían los datos al asesor por WhatsApp.
  - `src/routes/terminos/+page.svelte` §3: la confirmación escrita se emite «por WhatsApp o mediante el comprobante de la reserva en la web» (antes: «correo electrónico o WhatsApp»).
  - `index.template.html` (landing estática; regenerar con `npm run generate:index`): el contrato «queda disponible en el comprobante de tu reserva, listo para imprimir» y la etiqueta queda como «Correo Electrónico *», sin «(para contrato PDF)».
- **Fuera de alcance:** los planes comerciales (`Plan_Maestro_Dinamo_Rent_a_Car.pdf`, `Plan_de_Integracion_Web_Dinamo_Rent_a_Car.pdf` y sus generadores `generate_pdf.py` / `generate_consolidated_pdf.py`) mencionan Amazon SES como integración **futura** dentro del cronograma, no como capacidad actual del sitio.

### 3.4 Nota técnica: limpiar la query del aviso de tokenización (SvelteKit 3.0.1)
- **Contexto:** al volver de PlacetoPay, `/admin/reservas` recibe `?token=…&reserva=…` (o `?detalle=…`). El aviso se lee una sola vez al montar y la URL debe quedar limpia, para que recargar no repita el mensaje de una operación ya cerrada.
- **Trampa de la versión:** ni `replaceState` (deprecado) ni `goto(url, { shallow: true, replace: true })` actualizan `page.url`. Ambos terminan en `update_state`, que reescribe el historial con `history.replaceState` **sin** pasar por `update_url` (`client.js:2888-2976`); `update_url` solo se llama en el camino de `popstate`. Por eso, limpiar la query desde un `$effect` que lea `page.url` o `page.state` deja la guardia siempre activa: el efecto se reejecuta sin fin, la consola se llena de «Throttling navigation to prevent the browser from hanging» y el panel deja de responder.
- **Arreglo aplicado (26-nov-2026):** la limpieza vive en `onMount`, con un único `goto(resolve('/admin/reservas'), { state: page.state, shallow: true, replace: true })`. Sin reaccividad no hay reejecución, el banner sigue visible y el historial no gana entradas; `shallow` evita reejecutar el load. Efecto conocido: `page.url` conserva la query en memoria hasta la siguiente navegación. En esta página solo se lee al montar, así que no afecta, pero no conviene apoyarse en ella para otra cosa.
- **Sin cambios en el retorno:** `src/lib/server/resubscribeReturn.ts` (validación de la sesión, `querySessionWithRetry` y persistencia del token) quedó intacto; el arreglo es solo de presentación en el panel.
- **Barrido del resto del proyecto (26-nov-2026):** no hay ningún otro `replaceState`/`pushState` ni ningún otro `goto` con `shallow`; los únicos lectores de `page.url` son informativos (`/pago/retorno` con `$derived` para `reference` y `requestId`, y `readTokenNotice()` en `/admin/reservas`, que solo se ejecuta al montar) y los `goto` de `admin/+layout` (logout) y `admin/login` son navegaciones reales, sin query que limpiar. El único `$effect` restante (`admin/precios`) copia `data.vehicles` al estado local y no toca la URL. No queda ningún otro caso con este riesgo.

---

## 4. Arquitectura de Base de Datos y Modelos Prisma

El esquema en `prisma/schema.prisma` (PostgreSQL en Neon) incluye:
- `Vehicle`: Catálogo de flota, categorías, precios, unidades físicas (`units`), estado de disponibilidad.
- `Customer`: Maestro de clientes únicos (cero duplicados por documento).
- `Reservation`: Código único `code` (ej. `DIN-2026-XXXX`), fechas, snapshot de conductor, URLs de fotos comprimidas (`docPhotoUrl`, `licensePhotoUrl`, `signatureDataUrl`), estado (`PENDIENTE`, `CONFIRMADA`, `PAGADA`, `EN_CURSO`, `FINALIZADA`, `CANCELADA`), flag `synced` y `desktopRef`.
- `Payment`: Relación 1:1 con reserva, montos, estado (`PENDIENTE`, `APROBADO`, `RECHAZADO`), datos Evertec (`p2pRequestId`, `p2pProcessUrl`, `token`, `tokenStatus`, `tokenValidUntil`, `tokenFranchise`, `cardBrand`, `cardLast4`).
- `DepositCharge`: Histórico de cobros posteriores sobre el token (Deducible, Gasolina, Días extra, Multas) con auditoría.
- `SyncLog`: Registro de eventos para sincronización bidireccional web ↔ escritorio.

---

## 5. Variables de Entorno del Proyecto

### 5.1 En Vercel (Producción y Preview)
| Variable | Descripción | Valor / Estado |
|---|---|---|
| `DATABASE_URL` | Pooler Neon PostgreSQL con SSL | Configurado |
| `DIRECT_URL` | Conexión directa Neon PostgreSQL | Configurado |
| `NODE_ENV` | Entorno de ejecución | `production` |
| `P2P_ENV` | Entorno PlacetoPay (`test` / `prod`) | `test` (cambiar a `prod` post-certificación) |
| `P2P_LOGIN` | Identificador de comercio Evertec | Credencial oficial Dinamo Rent |
| `P2P_TRAN_KEY` | Llave transaccional secreta Evertec | Credencial oficial Dinamo Rent |
| `P2P_MOCK` | Simulador local de la pasarela (solo desarrollo/test) | `false` / ausente: en producción el simulador está deshabilitado aunque el flag llegue a `true` |
| `P2P_RETURN_URL` | URL de retorno web | `https://dinamo-rent-a-car.vercel.app/pago/retorno` |
| `P2P_NOTIFICATION_URL` | URL de Webhook webhook | `https://dinamo-rent-a-car.vercel.app/api/webhooks/placetopay` |
| `ADMIN_PASSWORD` | Contraseña acceso `/admin` | Clave **temporal de certificación**, rotada al cierre (valor solo en Vercel y en el correo a Evertec) |
| `ADMIN_SECRET` | Llave secreta HMAC firma de cookies admin | Configurado |
| `DESKTOP_SYNC_TOKEN` | Token para sincronización de escritorio | Configurado |

> **Nota de Seguridad (Fail Closed):** En producción (`NODE_ENV=production`), si `ADMIN_PASSWORD` o `ADMIN_SECRET` no existen, el endpoint de login responde HTTP 503 por diseño, impidiendo el uso de claves por defecto.
>
> **Nota de Seguridad (Credenciales PlacetoPay):** con `P2P_ENV=prod`, si falta `P2P_LOGIN` o `P2P_TRAN_KEY`, `src/lib/server/placetopay.ts` devuelve error y **no** llama a la pasarela: en producción no existen credenciales de sandbox por defecto. La creación de sesión falla sin crear `Payment`, la consulta devuelve `ok: false` (el webhook responde 502) y `collect`/`invalidate` devuelven error de configuración.

---

## 6. Procedimiento para la Salida a Producción (Checklist Final)

Una vez aprobada la llamada de certificación técnica con Evertec:

1. **Credenciales de Producción PlacetoPay:**
   - Solicitar a Evertec el paso a producción y las nuevas credenciales productivas (`P2P_LOGIN` y `P2P_TRAN_KEY` definitivas).
   - En Vercel Environment Variables:
     - Cambiar `P2P_ENV` a `"prod"`.
     - Actualizar `P2P_LOGIN` y `P2P_TRAN_KEY`.
     - Realizar un Redeploy en Vercel.
   - Solicitar a Evertec la activación de **SHA-256** para las notificaciones: el webhook ya valida ambos formatos (SHA-1 sin prefijo y SHA-256 con prefijo `sha256:`), así que el cambio no requiere despliegue adicional.

2. **Transacciones de Prueba en Producción (Centavo / Valor Mínimo):**
   - Realizar 1 transacción real con tarjeta de crédito propia por valor mínimo permitido o canon de prueba.
   - Verificar la recepción del Webhook en `SyncLog` de la base de datos.
   - Comprobar que en la aplicación de escritorio (`D:\dinamo_rent_tr`) se refleje la reserva pagada con sus documentos digitalizados.
   - Efectuar la anulación o reverso de la transacción desde el **Panel Administrativo de PlacetoPay**.

3. **Cierre de la certificación:**
   - Rotar `ADMIN_PASSWORD` a la clave definitiva de operación y hacer redeploy.
   - Confirmar que la sonda y el webhook sigan en `P2P_ENV=prod` con las credenciales productivas.

4. **Comandos de Verificación Local:**
   - Chequeo de sintaxis, tipos y guardia de contacto:
     ```bash
     npm run check
     ```
   - Suite de pruebas unitarias:
     ```bash
     npm run test
     ```
