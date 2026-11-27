# Plan de corte a producción — `P2P_ENV=prod`

> **Estado: propuesta, no ejecutada.** Nada de este documento se ha corrido contra la base ni
> contra PlacetoPay. El objetivo es que el día del corte solo haya que ejecutar, no decidir.
>
> Entorno de partida: `https://dinamorentacar.com` (dominio propio ya adjunto y verificado en el
> proyecto del team `Dinamo-Corjar`), `P2P_ENV=test`, checkout en `checkout-test.placetopay.com`.
> La certificación con Evertec sigue en curso; el estado vive en
> `docs/HANDOFF_CERTIFICACION_Y_ESTADO.md`. El traspaso de cuenta y lo que queda de él se resumen en
> §0.1 y, con detalle, en el §6 de ese handoff.

---

## 0. Resumen

El corte es un cambio de variables de entorno, pero su consecuencia no es reversible por sí sola:
**todos los tokens de garantía emitidos hasta ese momento son de sandbox y en producción no
existen**. La reserva sigue en la base con su tarjeta «activa» en pantalla y, sin embargo, no se
puede cobrar contra ella. Por eso el corte se planifica como una operación con inventario,
re-tokenización y prueba de dinero real, no como un redeploy.

---

## 0.1 Traspaso de cuenta y dominio (27-nov-2026)

El proyecto ya vive en la cuenta de Dinamo (**team `Dinamo-Corjar`, plan pro**) con el dominio propio `https://dinamorentacar.com`. Detalle completo en `docs/HANDOFF_CERTIFICACION_Y_ESTADO.md` §6.

**Ya verificado** (no hay que repetirlo el día del corte):

- Proyecto, dominio `dinamorentacar.com` + `www` (adjuntos y verificados) y alias al despliegue productivo vigente.
- Link de Git (`CORJAR-Computers/dinamo_rent_web`, `main`) y cron `/api/cron/p2p-check-pending` `0 8 * * *` intactos tras la transferencia.
- `CRON_SECRET` creado en Production y sonda verificada: 401 sin cabecera, **200** con `Authorization: Bearer …`.

**Pendiente y bloqueante para T0:**

- [ ] **GitHub App de Vercel en la org `CORJAR-Computers`**: la instalación no se hereda con la transferencia. Sin ella un `push` no despliega; el redeploy del corte habría que hacerlo a mano (`vercel deploy` / `vercel redeploy`). Verificar en *Settings → Git* y con un push de prueba.
- [ ] **DNS de Hostinger apuntando a Vercel**: apex `A 216.198.79.1` y `A 64.29.17.1`; `www CNAME e3afc53ed41a68b1.vercel-dns-017.com`; sin tocar NS, MX ni SPF. Mientras el DNS siga en Hostinger, el `returnUrl` del checkout se arma con el origen de la petición y saldría `*.vercel.app`, no el dominio del comercio. Guía detallada de la edición en Hostinger, verificación y rollback: [`RUNBOOK_CAMBIO_DNS_HOSTINGER_VERCEL.md`](RUNBOOK_CAMBIO_DNS_HOSTINGER_VERCEL.md).
- [ ] **URL de notificación registrada en la cuenta de producción de Evertec**: `https://dinamorentacar.com/api/webhooks/placetopay`.
- [ ] `P2P_ENV=prod` + credenciales productivas: es el propio corte (§4).

---

## 1. Qué cambia exactamente (hechos del código)

| # | Hecho | Consecuencia operativa |
|---|---|---|
| 1 | `getEnvConfig()` lee `process.env.P2P_ENV` en cada petición, pero **Vercel inyecta las variables por despliegue** | Cambiar variables sin redeploy no cambia nada; el corte es el redeploy |
| 1a | Desde `36422fe`, `P2P_ENV` es **obligatoria** con `NODE_ENV=production` y un valor desconocido también falla cerrado | Si el redeploy se queda sin la variable (o con una errata tipo `produccion`), la web **no** cae al sandbox: checkout y cobros devuelven error de configuración y el humo del paso 5 lo delata |
| 1b | En `test`, `P2P_LOGIN`/`P2P_TRAN_KEY` **se usan si están definidas**; solo hay valores por defecto cuando faltan | Cargar credenciales de producción con `P2P_ENV=test` rompe el sandbox: las tres variables se cambian a la vez (§4.3) |
| 2 | Con `P2P_ENV=prod` el host pasa a `https://checkout.placetopay.com` para sesión, `collect` e invalidación | Un token de sandbox enviado ahí no existe: el cobro falla y el token no se puede revocar |
| 3 | Con `prod` y sin `P2P_LOGIN`/`P2P_TRAN_KEY`, la pasarela no se llama (fail closed) | La web sigue en pie, pero checkout y cobros devuelven error explícito |
| 4 | `payments` guarda `token`, `tokenStatus`, `tokenValidUntil`, `cardLast4`… **sin campo de entorno** | No hay forma de distinguir un token de sandbox de uno de producción mirando la base; el único marcador fiable es `payments."updatedAt"` anterior a T0 |
| 5 | La re-tokenización crea la sesión contra el host vigente | **No se pueden pre-cargar tokens de producción antes del corte** |
| 6 | Desde `9489a39`, al guardar el token nuevo se revoca el anterior | Durante el corte esas revocaciones irán a producción con un token de sandbox y quedarán como `PREVIOUS_TOKEN_REVOKE_FAILED` en `SyncLog`. **Es esperado**, no un fallo |
| 7 | No hay endpoint de reembolso ni anulación en el código | El reverso del cobro de prueba se hace desde el panel de PlacetoPay |
| 8 | ~~`GET /api/cron/p2p-check-pending?test=true` salta la autorización también en producción~~ **Cerrada (PR #23)**: la sonda exige `Authorization: Bearer $CRON_SECRET` siempre, sin token por defecto ni `?token=`, y `?test=true` solo se acepta fuera de producción | Ya no hay puerta que cerrar antes de las tarjetas reales; solo verificar que `CRON_SECRET` exista en Vercel |

---

## 2. Inventario: quién se queda sin garantía

Toda reserva con `payments.token` anterior a T0 cae en una de estas categorías. La clasificación se
hace con el inventario de §7, no de memoria.

| Cat. | Condición | Riesgo | Acción |
|---|---|---|---|
| **A** | `EN_CURSO` (vehículo entregado, no devuelto) con token | Máximo: el daño ocurre durante el alquiler y no habría con qué cobrarlo | Re-tokenizar **el mismo día del corte**, antes de la primera devolución |
| **B** | `PENDIENTE`/`CONFIRMADA`/`PAGADA` con `pickupDate` posterior a T0 y token | Medio: hay tiempo, pero el cliente llega a la oficina sin garantía | Re-tokenizar en el mostrador al entregar el vehículo |
| **C** | `FINALIZADA` en los últimos 30 días con token | Bajo: daños reportados tarde | Decisión de negocio: re-tokenizar solo las que sigan en reclamo |
| **D** | `CANCELADA`, o sin `payments.token` | Ninguno | Sin acción |
| **E** | `tokenStatus` `CANCELADO` o `EXPIRADO` | Ninguno: la tarjeta ya no era utilizable | Sin acción |

**Regla durante la ventana:** ninguna reserva de A o B recibe un `Collect` hasta estar
re-tokenizada. Un cobro contra un token de sandbox no devolverá un veredicto útil y ensuciará el
historial de cargos de esa reserva.

---

## 3. Re-tokenización operativa

Es la única vía: no hay re-tokenización de autoservicio para el cliente.

1. `/admin/reservas` → icono del **escudo** en la fila → botón **«Actualizar medio de pago»**
   (o «Registrar tarjeta de garantía» si la reserva no tenía token).
2. Se abre el checkout de PlacetoPay con **tokenización pura** (sin `payment`, sin cargo).
3. El cliente digita la tarjeta; al volver, el panel muestra «Medio de pago actualizado…» y la fila
   pasa a «Tarjeta Garantía (activa)» con el icono de cobro.
4. Evidencia por reserva: código, hora, quién lo hizo, `cardLast4` resultante y la línea de
   `SyncLog` `[Token] Tarjeta de garantía actualizada para reserva …`. Esa línea, más la ausencia
   de `PREVIOUS_TOKEN_REVOKE_FAILED` inesperados, es la prueba del corte.

**Qué se le dice al cliente:** «Estamos actualizando el sistema de pagos; necesitamos volver a
registrar su tarjeta como garantía. No hay ningún cargo: solo se guarda el medio de pago».

**Si el cliente no está o no puede en ese momento:** la reserva queda sin garantía cobrable. Es una
decisión de negocio, no técnica: (a) entregar sin garantía y asumirlo por escrito, (b) pedir un
anticipo por otro medio, o (c) reprogramar la entrega. Conviene fijarla antes del corte, no en el
mostrador.

**Orden:** primero A (en curso), después B (al entregar). Las de C solo si hay reclamo abierto.

---

## 4. Secuencia del corte (T0)

**Preliminares (T-7 a T-2)**
- [ ] Credenciales de producción de Evertec en mano (`P2P_LOGIN`, `P2P_TRAN_KEY`) y confirmación de
      que la cuenta de comercio está habilitada en producción.
- [ ] Dominio y accesos listos (§0.1): DNS de `dinamorentacar.com` resolviendo a Vercel, URL de
      notificación `https://dinamorentacar.com/api/webhooks/placetopay` registrada en la cuenta de
      producción de Evertec y GitHub App de Vercel autorizada en la org (o decidido que el redeploy
      del corte se hace a mano).
- [ ] Monto mínimo aceptado por la pasarela y tarjeta propia para el cobro de prueba.
- [ ] Inventario de §7 ejecutado y firmado, con la lista A cerrada (es la que se toca el día del corte).
- [ ] Aviso al mostrador: guion, quién re-tokeniza y en qué orden.
- [ ] Congelar despliegues de código desde 24 h antes hasta el cierre del corte.

**T0 (mañana de bajo tráfico, antes de la primera devolución)**

1. **Respaldo**: punto de restauración / rama de Neon. Si algo sale mal, la base vuelve sin depender
   de la pasarela.
2. **Inventario firmado**: ejecutar de nuevo las consultas de §7 y guardar el resultado con la hora
   exacta de T0. Esa marca es la que separa «token viejo» de «token nuevo».
3. **Cargar las tres variables juntas** en Production (`P2P_ENV=prod`, `P2P_LOGIN` y
   `P2P_TRAN_KEY` de producción) y hacer **un solo redeploy**.
   *No* cargarlas antes de cambiar `P2P_ENV`: `getEnvConfig()` usa `P2P_LOGIN`/`P2P_TRAN_KEY` tal
   cual cuando el entorno es `test` (solo rellena valores por defecto si faltan), así que unas
   credenciales de producción con `P2P_ENV=test` harían fallar las sesiones del sandbox contra
   `checkout-test`. Este es el único orden que no rompe nada a mitad de camino.
      **Tampoco** cargar credenciales de producción en Preview: un preview con la misma base y credenciales reales puede cobrar de verdad.
   Si el redeploy se hace sin `P2P_ENV`, el código ya no cae a `test`: falla con error de configuración (§1, fila 1a). El humo
   del paso 5 confirma que las tres quedaron bien cargadas.
4. **Redeploy** con las tres variables. Aquí empieza el corte efectivo.
5. **Humo sin dinero** (5 minutos):
   - `/` responde 200 en el dominio productivo `https://dinamorentacar.com` y el checkout ya no
     muestra el aviso «No habrá afectación monetaria» (texto del propio checkout de PlacetoPay).
   - Login admin 200 (`dinamo_admin_session`).
   - Reserva desechable creada en el momento → escudo → «Registrar tarjeta de garantía» con tarjeta
     propia → token `ACTIVO`, `cardLast4` correcto, `tokenValidUntil` poblado.
   - Invalidar ese token desde el modal («Cancelar suscripción e invalidar token») → 200 y `SyncLog`
     `[Token] Suscripción cancelada y token invalidado…`. Prueba que la invalidación funciona en
     producción sin gastar dinero.
6. **Cobro mínimo real** (§5) sobre la reserva desechable.
7. **Re-tokenizar A** y avisar a la oficina de B.
8. **Cierre**: rotar `ADMIN_PASSWORD`, verificar que `CRON_SECRET` esté configurado (la sonda ya exige
   bearer y `?test=true` solo existe fuera de producción, §1.8), registrar en el handoff el SHA
   desplegado, la hora de T0 y el resultado del cobro de prueba.

---

## 5. Prueba con cobro mínimo real

Objetivo: demostrar el ciclo completo con dinero real una sola vez, con el monto más bajo que acepte
la cuenta de comercio, y dejarlo reversible.

1. Reserva desechable (datos ficticios, sin vehículo comprometido) con un token de producción
   recién creado en §4.5.
2. Panel → icono de tarjeta → concepto `OTRO`, detalle «Prueba de corte a producción» → monto mínimo
   confirmado con Evertec → «Confirmar y Cobrar».
3. Verificar **todo** esto, no solo el 200:
   - `DepositCharge` `APROBADO` con `transactionId` (autorización) y `p2pRequestId`.
   - Notificación en `SyncLog` (`[Webhook Evertec] Pago APROBADO…`) con el mismo `requestId`: prueba
     que la URL de notificación y la firma con la `P2P_TRAN_KEY` de producción están bien.
   - Fila y modal del panel coherentes: cargo aprobado, token `ACTIVA`.
4. **Reverso** desde el panel administrativo de PlacetoPay (no existe endpoint de reembolso en el
   código). Anotar el número de reverso en el registro del corte.
5. Cerrar la reserva desechable (`DELETE /api/reservations/:id` solo la deja `CANCELADA`; no hay
   borrado físico) y dejarla fuera de los reportes operativos.

Si el cobro se aprueba pero el webhook no llega en ~2 minutos, **no se repite el cobro**: se consulta
la sesión con la sonda y se reporta como hallazgo del corte.

---

## 6. Reversa y criterios de aborto

**Abortar el corte** (volver a `P2P_ENV=test` + redeploy) si: el humo sin dinero falla, el cobro de
prueba no se aprueba, o no llega ninguna notificación. La web sigue funcionando en `test`; se pierde
la ventana, no el servicio.

**Límite de la reversa:** los tokens creados en producción tampoco existen en el entorno de pruebas.
Si ya se re-tokenizaron reservas A, revertir las deja sin garantía igual que antes. Por eso el corte
se hace temprano, con la lista A corta y con la reversa decidida antes de re-tokenizar nada.

**Después de re-tokenizar:** no se vuelve atrás; un segundo corte duplicaría el trabajo. Cualquier
fallo posterior se corrige hacia adelante.

---

## 7. Datos que necesito de la base

Todo es lectura. Puedo ejecutarlo yo si me das una conexión de solo lectura (o el `DATABASE_URL` ya
configurado en el proyecto, sin imprimirlo), o tú corres las consultas y me pegas los resultados.
**No necesito datos personales**: código de reserva, fechas, estado, últimos 4 y estado del token
bastan; nombre, documento y teléfono se pueden omitir.

**7.1 Resumen por estado** — cuántas reservas hay en cada situación y cuántas llevan token:

```sql
SELECT r.status,
       COALESCE(p."tokenStatus", 'SIN_TOKEN') AS token_status,
       COUNT(*) AS reservas
FROM reservations r
LEFT JOIN payments p ON p."reservationId" = r.id
GROUP BY 1, 2
ORDER BY 1, 2;
```

**7.2 Detalle accionable (A y B)** — la lista que se re-tokeniza:

```sql
SELECT r.code,
       r.status,
       r."pickupDate",
       r."returnDate",
       p."tokenStatus",
       p."tokenValidUntil",
       p."cardBrand",
       p."cardLast4",
       p."p2pRequestId",
       p."updatedAt" AS token_actualizado
FROM reservations r
JOIN payments p ON p."reservationId" = r.id
WHERE p.token IS NOT NULL
  AND r.status IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA', 'EN_CURSO')
ORDER BY r."pickupDate" ASC;
```

**7.3 Cerradas recientes (C)** — para decidir si alguna sigue en reclamo:

```sql
SELECT r.code, r."returnDate", p."tokenStatus", p."cardLast4"
FROM reservations r
JOIN payments p ON p."reservationId" = r.id
WHERE p.token IS NOT NULL
  AND r.status = 'FINALIZADA'
  AND r."returnDate" >= NOW() - INTERVAL '30 days'
ORDER BY r."returnDate" DESC;
```

**7.4 Cargos ya aplicados** — para no confundir un rechazo viejo con un problema del corte:

```sql
SELECT r.code,
       COUNT(d.id)                         AS cargos,
       COUNT(d.id) FILTER (WHERE d.status = 'APROBADO')  AS aprobados,
       COUNT(d.id) FILTER (WHERE d.status = 'RECHAZADO') AS rechazados,
       COUNT(d.id) FILTER (WHERE d.status = 'PENDIENTE') AS pendientes
FROM reservations r
LEFT JOIN deposit_charges d ON d."reservationId" = r.id
WHERE r.status IN ('EN_CURSO', 'FINALIZADA')
GROUP BY r.code
HAVING COUNT(d.id) > 0
ORDER BY r.code DESC;
```

**7.5 Tokens que no deberían existir** — tarjetas guardadas en reservas ya canceladas, y tokens
vivos cuya vigencia ya pasó (el barrido diario debería haberlos marcado):

```sql
SELECT r.code, r.status, p."tokenStatus", p."tokenValidUntil"
FROM reservations r
JOIN payments p ON p."reservationId" = r.id
WHERE p.token IS NOT NULL
  AND (r.status = 'CANCELADA'
       OR (p."tokenStatus" NOT IN ('EXPIRADO', 'CANCELADO')
           AND p."tokenValidUntil" IS NOT NULL
           AND p."tokenValidUntil" < to_char(NOW(), 'YYYY-MM-DD')));
```

**Fuera de la base también necesito:**
- Credenciales de producción de Evertec y confirmación de que el comercio está habilitado.
- Monto mínimo aceptado por la pasarela y si el reverso se hace desde su panel o lo ejecutan ellos.
- Qué tarjeta propia se usa para el cobro de prueba y quién autoriza el gasto.
- Decisión de negocio para la categoría C y para la reserva que llegue sin tarjeta.
- Quién re-tokeniza en el mostrador y en qué horario, para fijar la hora del corte.
