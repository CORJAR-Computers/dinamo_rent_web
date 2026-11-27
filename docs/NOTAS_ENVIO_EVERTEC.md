# Notas de envío — respuesta a Evertec

**El texto del correo vive en un solo sitio: `docs/RESPUESTA_EVERTEC.txt`.**
Este archivo no lo repite; solo registra las decisiones, el estado de los
adjuntos y lo que falta antes de enviar. Si hay que cambiar el correo, se edita
el `.txt` y nada más.

---

## Datos del envío

| Campo | Valor |
|---|---|
| Remitente | `tecnologia@dinamorentacar.com` — **confirmado**: es el correo de contacto técnico declarado en `docs/DOCUMENTO_TECNICO_PLACETOPAY.md` §9. Si el hilo con Evertec se llevó desde otra cuenta, usar esa para que el correo quede en la misma conversación |
| Destinatario | Julián Esteban Guerrero Guzmán — `Julian.GuerreroGuzman@evertecinc.com` |
| Copia | Laura Calle Ávila — `Laura.Calle@evertecinc.com` |
| Asunto | Certificación PlacetoPay — validación del 26-nov, evidencia de los cinco escenarios y ajustes posteriores |
| Firma | Marcador `[COMPLETAR ANTES DE ENVIAR: nombre y apellido del firmante]` en el `.txt`. El repo no registra el nombre de quien firma, así que no se rellena con un dato inventado |

## Correo intermedio, antes del definitivo

Se envía **primero** un correo corto, sin adjuntos, que informa que el último
pendiente de Julián quedó resuelto y pide su visto bueno. El correo definitivo
—acta en PDF y ZIP de capturas— sale solo después de esa confirmación.

- **Fuente:** `docs/RESPUESTA_EVERTEC_INTERMEDIA.txt` (texto plano pegable, no
  versionado). Mismo remitente, destinatario y copia que el definitivo.
- **Qué afirma:** el `requestId` del `Collect` queda en `DepositCharge.p2pRequestId`,
  en el `SyncLog` del cobro y en la respuesta del endpoint, incluido el caso sin
  veredicto (`c4f57df`, PR #28). Es el pendiente #4 del acta, resuelto el 27-nov.
- **Qué no lleva:** ni acta, ni ZIP, ni fechas, ni cifras nuevas. Solo anuncia que
  ese paquete existe y está listo.
- **Por qué así:** el correo definitivo pide revisar acta y ocho capturas. Si el
  punto técnico no estuviera cerrado, ese trabajo se repetiría; el intermedio
  convierte esa duda en una pregunta de una línea.
- **Riesgo asumido:** son dos mensajes en el mismo hilo y el intermedio puede
  quedar sin respuesta. Si no contesta en unos días, el recordatorio debe citar
  este correo y no reenviar el definitivo: el visto bueno sigue siendo la
  condición para mandar el paquete.
- [ ] Sustituir el marcador del firmante en el `.txt` intermedio.
- [ ] Enviarlo desde la cuenta del hilo abierto con Evertec.
- [ ] Con el visto bueno, revisar que el acta siga siendo la versión de `main`
  (regenerar el PDF con `npm run docs:pdf`) y solo entonces enviar el definitivo.

## Por qué el `.txt` y no el Markdown

El correo se envía como texto plano: el Markdown se cuela con `**` y tablas de
barras en cuanto se pega en Outlook o Gmail, y el destinatario ve los asteriscos.
Mantener dos versiones del mismo cuerpo garantiza que una quede vieja, así que la
versión pegable es la única fuente y allí se convirtió la tabla de escenarios en
bloques (`Escenario 1 — …` / `requestId:` / `Resultado:`) para que no se
desalinee al cambiar de fuente.

`docs/RESPUESTA_EVERTEC.txt` (137 líneas, UTF-8, saltos LF) es lo que se pega en
el cliente de correo o se adjunta como plantilla.

El `.txt` **no se versiona** (está en `.gitignore`): el original que vale es el
correo enviado, que queda en la cuenta de correo, y guardar aquí una copia
«lista para enviar» daría a entender que el repo registra lo que se mandó. El
repo conserva las decisiones (este archivo) y la evidencia (acta y capturas).

El **PDF del acta tampoco se versiona**: se genera desde el `.md` con
`npm run docs:pdf` (script `scripts/acta-pdf.mjs`, que imprime con Chrome a A4,
con tablas sin partir y la §7 en página propia) y se adjunta al correo.
Versionarlo invitaría a enviar una copia vieja mientras el `.md` sigue cambiando.

## Adjuntos

| Adjunto | Archivo | Estado |
|---|---|---|
| ZIP con las 8 capturas | `docs/evidencia/capturas-evidencia-evertec.zip` | Listo — 479 KB, 8 PNG de los escenarios 1, 2, 3, 4a, 4b y 5. `SHA-256` `ab8628ee60213f46aec05874d4dd90ed947e04648f83f3c7a123581f85beba4e` |
| Acta parcial | `docs/ACTA_CERTIFICACION_EVERTEC_2026-11-26.md` | Listo en Markdown — sin PDF y sin firmas |

Lo que **no** existe y hay que decidir antes de enviar:

- **PDF del acta.** Va en Markdown; si su proceso solo acepta PDF, hay que
  exportarla. Exportar **después** de cerrar el texto: el acta cambió tres veces
  el 27-nov (nota de estado posterior, pendiente #4 resuelto, la fila «Build»
  y la de «Capturas»),
  y cualquier copia anterior lleva el texto viejo.
- **Acta firmada.** La tabla de firmas de §7 está vacía a propósito: el correo la
  presenta como anexo técnico parcial, no como documento firmado.
- **Evidencia del webhook.** No hay: es lo que se pide en el punto 5.
- **Certificado del build desplegado.** La corrida fue contra el dev server; el
  código quedó en `main`, pero no hay deployment certificado (pendiente #3).

## Lo que sostiene cada afirmación del correo

| Afirmación del `.txt` | Respaldo |
|---|---|
| Escenarios 1, 2, 4a, 4b, 5 y 3 con sus `requestId` | `docs/evidencia/README.md` y las 8 capturas del ZIP |
| Rechazo definitivo con motivo 37 y token desvinculado al primer intento | `docs/evidencia/README.md`, sección «Escenario 3» |
| Botón de cobro (`3e52a65`, PR #15) | Commit en `main` |
| Parser de `Collect` que prefiere `payment[].status` (`ef32c55`) | Commit en `main` |
| `requestId` del `Collect` persistido (`c4f57df`, PR #28) | Commit en `main` |
| Sesión `3972115`, cobro de 1.000 COP, `COL-DIN-2026-9107-MWYD04L9`, aut. `482566` | `docs/ACTA_CERTIFICACION_EVERTEC_2026-11-26.md` §2 |

El correo no promete fechas ni cifras fuera de esa evidencia; si se añade algo,
debe salir de ahí.

## Antes de enviar

- [x] Destinatarios identificados (Julián principal, Laura en copia).
- [x] Adjuntos localizados y verificados en disco.
- [x] El `requestId` del `Collect` ya está en `main`: el punto 3 puede citarlo.
- [x] Sin fechas comprometidas en el texto.
- [x] El cobro de 1.000 COP aparece solo en el punto 4, como corrida interna.
- [ ] Sustituir el marcador `[COMPLETAR ANTES DE ENVIAR: …]` por el nombre y apellido de quien firma.
- [x] Remitente confirmado: `tecnologia@dinamorentacar.com` (contacto técnico declarado en el documento de PlacetoPay).
- [x] ZIP verificado: 8 capturas, 479 KB, `SHA-256` idéntico al que cita el correo.
- [x] PDF del acta regenerado desde el `.md` de `main` y revisado por texto: 6 páginas, sin el pendiente de capturas.
- [ ] Adjuntar el PDF (`docs/ACTA_CERTIFICACION_EVERTEC_2026-11-26.pdf`) o el `.md`; no ambos.
- [ ] Enviar desde la cuenta del hilo abierto con Evertec.
