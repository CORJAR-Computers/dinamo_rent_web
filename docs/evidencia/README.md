# Evidencia — ciclo de token de garantía

Capturas de la corrida del **26-nov-2026** contra `checkout-test.placetopay.com` (sandbox, «No habrá afectación monetaria»), tomadas del panel real. Las reservas de la corrida de escenarios 1, 2, 4 y 5 se eliminaron de la base al terminar; las de esta captura del escenario 3 (`DIN-2026-8358` y el intento previo `DIN-2026-6438`) se conservan en el sandbox para que Evertec pueda consultar sus `requestId`. Los datos personales son ficticios, la columna de cliente va difuminada y el panel recorta el token a sus primeros 12 caracteres.

**Comercio:** DINAMO RENTA CAR S.A.S. (NIT 900694866-3)
**Código de la corrida:** `main` @ `ef32c55` (fix del parser de `Collect`, que prefiere `payment[].status`), con el handoff de la certificación en `c2a1456`. Los arreglos de navegación posteriores no tocan la lógica de pago.

| # | Escenario | Archivo | `requestId` | Estado |
|---|---|---|---|---|
| 1 | Tokenizar sin cobro | `escenario-1-modal-token.png`, `escenario-1-aviso-retorno.png`, `escenario-1-fila-activa.png` | 3971301 (sesión) | Ejecutado — token `ACTIVO`; pago y reserva originales intactos |
| 2 | Rechazo recuperable ×2 | `escenario-2-dos-rechazos.png` | 3971303, 3971304 | Ejecutado — 402 con `attempts` 1 y 2; el token sigue `ACTIVO` |
| 3 | Rechazo no recuperable | `escenario-3-cancelada.png` | 3971789 | Ejecutado — 402, `attempts: 1`, `tokenInvalidation.applied: true` («Tarjeta bloqueada o cancelada»), token `CANCELADO` |
| 4a | Invalidación automática al 3.er rechazo | `escenario-4a-cancelada.png` | 3971305 | Ejecutado — 402, `attempts: 3`, `tokenInvalidation.applied: true`, token `CANCELADO` |
| 4b | Invalidación manual | `escenario-4b-invalidacion-manual.png` | 3971306 (sesión) | Ejecutado — 200, token `CANCELADO` con motivo y auditoría |
| 5 | Un token invalidado no admite cobros | `escenario-5-fila-sin-cobro.png` | — (400 local, sin tráfico a la pasarela) | Ejecutado |

Reservas de prueba: DIN-2026-9401 (esc. 1), DIN-2026-9402 (esc. 2, 4a y 5), DIN-2026-9403 (esc. 4b) y DIN-2026-8358 (esc. 3).
Tarjetas de sandbox: Visa `4110 7600 0000 0008` (aprobada para tokenizar), Visa `4110 7600 0000 0016` (cobros rechazados) y Visa `4716 3751 8409 2180` (tarjeta bloqueada entregada por Evertec: rechazo definitivo), fecha `12/30`, CVV `123`.
`requestId` marcado «sesión» es el de la tokenización (`/api/session`); el resto son los de los cobros (`/api/collect`).

## Escenario 3 — cómo se cerró

Se tokenizó sin cobro la tarjeta bloqueada de Evertec (`4716 3751 8409 2180`, sesión 3971788) y se ejecutó **un único** `Collect` por $87.500 (3971789). El emisor respondió con el motivo **37 «Negada, Tarjtea bloqueada retener/capturar»**; el sistema lo trató como rechazo definitivo, desvinculó el token en el primer intento (`attempts: 1`, `tokenInvalidation.applied: true`, motivo «Tarjeta bloqueada o cancelada») y el panel quedó en `CANCELADA` sin ofrecer nuevos cobros.

Hallazgo de la corrida: Evertec devuelve el veredicto global en `status` (`reason: XN`, «Se ha rechazado la petición») y el motivo real del emisor en `payment[].status` (`reason: 37`). El parser leía solo el primero, así que la tarjeta bloqueada se clasificaba como rechazo recuperable y el token seguía `ACTIVO`. La corrección —preferir `payment[].status` y su mensaje— es la que se capturó aquí y quedó en `main` como `ef32c55`; sin ella el escenario no se cumple. La lista exacta de mensajes definitivos vive en `classifyTokenRejection` (`src/lib/server/placetopay.ts`).

Paquete enviado a Evertec: `capturas-evidencia-evertec.zip`, con las ocho capturas de la tabla.
