# Cambio de DNS en Hostinger a Vercel — `dinamorentacar.com`

Guía operativa para apuntar el dominio del comercio al despliegue de Vercel **sin tocar el correo**. El dominio ya está adjunto y verificado en el proyecto (`project.verified: true`); lo que falta es que el DNS público resuelva a Vercel. Todo se hace en el panel de Hostinger, sin cambiar los nameservers.

> **Regla de oro:** se editan **solo** los registros `A`, `AAAA` del apex y el `CNAME` de `www`. **No se tocan** `NS`, `MX`, `TXT` (SPF, DKIM, DMARC) ni ningún registro de verificación. Si el panel ofrece «Cambiar nameservers» o «Conectar con Vercel», **no** se usa esa opción.

## 0. Punto de partida (comprobado hoy con `1.1.1.1`)

| Registro | Valor actual | Acción |
|---|---|---|
| `A @` | `191.101.104.58`, `195.35.60.137` | **Reemplazar** por los dos de Vercel |
| `AAAA @` | `2a02:4780:84:bea4:20:5d28:e4cd:9443`, `2a02:4780:84:4a24:d83e:3fd9:b0b0:b2ca` | **Eliminar** (si quedan, IPv6 sigue yendo a Hostinger) |
| `CNAME www` | `www.dinamorentacar.com.cdn.hstgr.net` | **Reemplazar** por el de Vercel, sin proxy |
| `MX` | `mx1.hostinger.com` (pref. 5), `mx2.hostinger.com` (pref. 10) | **No tocar** |
| `TXT @` (SPF) | `v=spf1 include:_spf.mail.hostinger.com ~all` | **No tocar** |
| `NS` | Hostinger (`ns1/ns2.dns-parking.com`) | **No tocar** |

Los valores del apex pueden haber cambiado desde esta captura: **léelos en el panel antes de borrar** y guarda el respaldo del paso 1.

## 1. Respaldar la zona y elegir la ventana

1. En hPanel → **Dominios** → `dinamorentacar.com` → **DNS / Nameservers** → **Administrar registros DNS**.
2. Haz una captura de pantalla de la tabla completa (o exporta la zona si el panel lo permite) y guárdala en `docs/evidencias/`. Ese respaldo es el rollback del paso 8.
3. Programa el cambio en franja de bajo tráfico y **fuera de la ventana de la sonda** (08:00 UTC / 03:00 Colombia), para no mezclar el cron con las pruebas.
4. Si el panel permite TTL por registro, baja a **300 s** los `A`, `AAAA` y `CNAME` que vas a cambiar y espera el TTL anterior (suele ser 3600–14400 s) antes de editar. Así el rollback propaga en minutos.

## 2. Editar los registros en Hostinger

Todo en la misma pantalla de **Administrar registros DNS**:

1. **Apex — `A`:** elimina los dos `A` actuales (`191.101.104.58` y `195.35.60.137`) y crea:
   - `A` · nombre `@` · valor `216.198.79.1` · TTL 300
   - `A` · nombre `@` · valor `64.29.17.1` · TTL 300
2. **Apex — `AAAA`:** elimina los dos `AAAA` de Hostinger (`2a02:4780:…`). Si el panel no deja borrarlos, es señal de que el dominio está usando el «CDN/Proxy» de Hostinger: desactívalo primero para ese dominio. **No** crees `AAAA` nuevos: Vercel atiende por IPv4 en el apex.
3. **`www` — `CNAME`:** elimina el `CNAME` hacia `www.dinamorentacar.com.cdn.hstgr.net` y crea:
   - `CNAME` · nombre `www` · valor `e3afc53ed41a68b1.vercel-dns-017.com` · TTL 300 · **sin proxy / «DNS only»**
   - Si el registro queda proxificado (naranja/«CDN activo»), el tráfico seguirá pasando por Hostinger y Vercel no podrá emitir el certificado.
4. **No toques** `NS`, `MX`, SPF, DKIM (`*._domainkey`), DMARC (`_dmarc`) ni los `TXT` de verificación.
5. Guarda. Hostinger puede avisar que «los nameservers no son los recomendados» o intentar venderte el cambio a Vercel: ignóralo, el DNS de Hostinger sigue siendo autoritativo y es justo lo que queremos.

## 3. Verificar la propagación

**a) Contra el servidor autoritativo (la prueba más rápida, no espera caché):**

```bash
nslookup -type=A    dinamorentacar.com ns1.dns-parking.com
nslookup -type=AAAA dinamorentacar.com ns1.dns-parking.com
nslookup -type=CNAME www.dinamorentacar.com ns1.dns-parking.com
```

Esperado: `216.198.79.1` y `64.29.17.1`; **sin** registro AAAA; `www` → `e3afc53ed41a68b1.vercel-dns-017.com`.

**b) Contra resolvers públicos (lo que ve el usuario):**

```bash
nslookup -type=A     dinamorentacar.com 1.1.1.1
nslookup -type=A     dinamorentacar.com 8.8.8.8
nslookup -type=AAAA  dinamorentacar.com 1.1.1.1
nslookup -type=CNAME www.dinamorentacar.com 1.1.1.1
```

Esperado: los mismos dos `A`, ningún `AAAA` (un «no existe el registro» es correcto), el `CNAME` nuevo. Una respuesta antigua significa caché del resolver o TTL alto: espera y repite; no vuelvas a editar la zona.

**c) Panel de Vercel:** proyecto → **Settings → Domains**. `dinamorentacar.com` y `www.dinamorentacar.com` deben pasar de *Pending* a **Valid Configuration**, con certificado emitido.

**d) HTTP real:**

```bash
curl -sSI https://dinamorentacar.com | head -20
curl -sSI https://www.dinamorentacar.com | head -20
```

Esperado: `HTTP/2 200` (o `301` hacia `https://dinamorentacar.com` desde `www`) y una cabecera `x-vercel-id` o `server: Vercel`. Si aparece `curl: (35) schannel: failed to receive handshake`, no es DNS: es TLS local. Reintenta con `curl --ssl-no-revoke -sSI …` o abre la URL en el navegador y comprueba el certificado.

**e) Terceros:** `dnschecker.org` o `whatsmydns.net` para `A`, `AAAA` y `CNAME`. Cuando la mayoría de resolvers coincida, la propagación está hecha (normalmente 5–30 min con TTL 300; hasta el TTL anterior si no lo bajaste).

## 4. Certificado TLS

Vercel emite el certificado solo cuando el DNS ya resuelve. Si en **Domains** sigue *Pending Certificate*:

- confirma que no quedó ningún `AAAA` ni `A` viejo en el apex;
- confirma que `www` resuelve por `CNAME` al destino de Vercel, sin proxy de Hostinger;
- espera unos minutos y refresca. No borres y vuelvas a añadir el dominio salvo que siga así tras una hora.

## 5. Confirmar que el correo sigue funcionando

El correo no depende de los `A`: se sostiene en `MX`, SPF, DKIM y DMARC, que no se tocaron. Aun así, verifícalo:

```bash
nslookup -type=MX  dinamorentacar.com 1.1.1.1
nslookup -type=TXT dinamorentacar.com 1.1.1.1
```

Esperado: `mx1.hostinger.com` (pref. 5) y `mx2.hostinger.com` (pref. 10) igual que antes, y el SPF `v=spf1 include:_spf.mail.hostinger.com ~all` **sin cambios**.

Prueba funcional (10 minutos):

1. Desde una cuenta externa (Gmail), envía un correo a `reservas@dinamorentacar.com` → debe llegar a la bandeja de Hostinger.
2. Responde desde `tecnologia@dinamorentacar.com` a esa cuenta externa → debe entregarse.
3. En el mensaje recibido, «Mostrar original»: `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`. Si SPF o DKIM fallan, se tocó un `TXT` por error: restáuralo del respaldo del paso 1.
4. Comprueba que el envío sigue saliendo por Hostinger (misma IP/registro de salida) y que no hay avisos de «remitente no verificado».

## 6. Verificar webhook, cron y `returnUrl` con el dominio nuevo

**`returnUrl`:** el código **no** lee `P2P_RETURN_URL`; lo arma con el origen de la petición (`url.origin` en `create-session` y en `resubscribe`). Por eso, en cuanto el sitio se sirve por `https://dinamorentacar.com`, el `returnUrl` que viaja a PlacetoPay ya es `https://dinamorentacar.com/pago/retorno?reference=…` y `https://dinamorentacar.com/api/payments/token/resubscribe/return/<id>`. Verificación práctica: entra al panel por `https://dinamorentacar.com/admin`, haz una reserva de prueba en sandbox y abre el checkout; al volver, la barra del navegador debe mostrar `https://dinamorentacar.com/pago/retorno…` (no `*.vercel.app`).

**Webhook (endpoint alcanzable y firmado):**

```bash
# Sin firma debe rechazar: 401
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  https://dinamorentacar.com/api/webhooks/placetopay \
  -H "Content-Type: application/json" -d '{}'
```

Esperado `401`. Un `404` o un error de conexión indica que el dominio no está llegando al despliegue; un `200` sería un problema de validación de firma. **Además**, en el panel de Evertec (cuenta sandbox ahora, producción en el corte) la URL de notificación registrada debe ser exactamente `https://dinamorentacar.com/api/webhooks/placetopay`; el checkout no la envía en el payload, así que si allí sigue la vieja `*.vercel.app`, no llegará ninguna notificación.

**Cron / sonda:**

```bash
# 401 sin cabecera
curl -sS -o /dev/null -w "%{http_code}\n" https://dinamorentacar.com/api/cron/p2p-check-pending

# 200 con el bearer
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://dinamorentacar.com/api/cron/p2p-check-pending
```

Guarda la salida como evidencia (`docs/evidencias/`), igual que la captura del 27-nov.

**Notificación real de punta a punta** (cuando toque la sesión con Evertec): reserva nueva → pago con `4110 7600 0000 0008` → esperar ≤2 min → en `SyncLog`, `[Webhook Evertec] Pago APROBADO para reserva <CÓDIGO>`.

## 7. Cierre

- `vercel alias ls` debe mostrar el despliegue vigente aliasado a `dinamorentacar.com` y `www.dinamorentacar.com`.
- Repite la sonda y el chequeo del webhook **después** de 24 h para confirmar que el DNS quedó estable.
- Anota en `docs/HANDOFF_CERTIFICACION_Y_ESTADO.md` §6.2 la fecha del cambio y adjunta la captura de propagación.

## 8. Rollback (si algo falla)

Con el respaldo del paso 1, en pocos minutos:

1. `A @` → `191.101.104.58` y `195.35.60.137` (o los que tuviera el respaldo).
2. `AAAA @` → los dos `2a02:4780:…` del respaldo.
3. `CNAME www` → `www.dinamorentacar.com.cdn.hstgr.net`.
4. Espera el TTL (300 s si lo bajaste) y verifica con `nslookup`.

El correo nunca se ve afectado por un rollback porque `MX`, SPF, DKIM y DMARC no forman parte del cambio.

## 9. Checklist

- [ ] Zona DNS respaldada (captura o export) en `docs/evidencias/`
- [ ] TTL bajado a 300 y TTL anterior esperado
- [ ] `A @` → `216.198.79.1` y `64.29.17.1`; sin `A` viejos
- [ ] `AAAA @` eliminados
- [ ] `www CNAME` → `e3afc53ed41a68b1.vercel-dns-017.com`, sin proxy
- [ ] `NS`, `MX`, SPF, DKIM, DMARC intactos
- [ ] Vercel: ambos dominios en **Valid Configuration** con certificado
- [ ] `curl -sSI https://dinamorentacar.com` → 200 + `x-vercel-id`
- [ ] `www` redirige al apex por HTTPS
- [ ] Correo: recepción y envío OK, SPF/DKIM/DMARC en PASS
- [ ] Webhook sin firma → 401 por el dominio nuevo
- [ ] URL de notificación registrada en Evertec = `https://dinamorentacar.com/api/webhooks/placetopay`
- [ ] Cron: 401 sin bearer, 200 con bearer
- [ ] `returnUrl` observado con `https://dinamorentacar.com/...`
- [ ] Rollback documentado y a mano
