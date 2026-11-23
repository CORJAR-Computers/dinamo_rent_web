# Documento de Traspaso Técnico y Estado del Proyecto (Handoff)
## Dinamo Rent a Car S.A.S. — Integración Pasarela Evertec PlacetoPay & Aplicación Web/Escritorio

- **Fecha de corte:** Noviembre 23, 2026
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
  1. **Webhook principal (URL de Notificación):** `POST /api/webhooks/placetopay`, el cual recibe la notificación asíncrona de Evertec, valida firma, consulta sesión de forma segura y actualiza la reserva y el token.
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

---

## 6. Procedimiento para la Salida a Producción (Checklist Final)

Una vez aprobada la llamada de certificación técnica con Evertec:

1. **Credenciales de Producción PlacetoPay:**
   - Solicitar a Evertec el paso a producción y las nuevas credenciales productivas (`P2P_LOGIN` y `P2P_TRAN_KEY` definitivas).
   - En Vercel Environment Variables:
     - Cambiar `P2P_ENV` a `"prod"`.
     - Actualizar `P2P_LOGIN` y `P2P_TRAN_KEY`.
     - Realizar un Redeploy en Vercel.

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
