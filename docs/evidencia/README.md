# Evidencia — ciclo de token de garantía

Capturas de la corrida del **26-nov-2026** contra `checkout-test.placetopay.com` (sandbox, «No habrá afectación monetaria»), tomadas del panel real. Las reservas de prueba se **eliminaron** de la base al terminar: los datos de trazabilidad quedan en este índice y en el correo a Evertec. Los datos personales son ficticios, la columna de cliente va difuminada y el panel recorta el token a sus primeros 12 caracteres.

**Comercio:** DINAMO RENTA CAR S.A.S. (NIT 900694866-3)
**Código de la corrida:** `main` @ `7b7c643` (los arreglos posteriores de navegación no tocan la lógica de pago)

| # | Escenario | Archivo | `requestId` | Estado |
|---|---|---|---|---|
| 1 | Tokenizar sin cobro | `escenario-1-modal-token.png`, `escenario-1-aviso-retorno.png`, `escenario-1-fila-activa.png` | 3971301 (sesión) | Ejecutado — token `ACTIVO`; pago y reserva originales intactos |
| 2 | Rechazo recuperable ×2 | `escenario-2-dos-rechazos.png` | 3971303, 3971304 | Ejecutado — 402 con `attempts` 1 y 2; el token sigue `ACTIVO` |
| 3 | Rechazo no recuperable | `escenario-3-cancelada.png` | — | **Pendiente** (ver abajo) |
| 4a | Invalidación automática al 3.er rechazo | `escenario-4a-cancelada.png` | 3971305 | Ejecutado — 402, `attempts: 3`, `tokenInvalidation.applied: true`, token `CANCELADO` |
| 4b | Invalidación manual | `escenario-4b-invalidacion-manual.png` | 3971306 (sesión) | Ejecutado — 200, token `CANCELADO` con motivo y auditoría |
| 5 | Un token invalidado no admite cobros | `escenario-5-fila-sin-cobro.png` | — (400 local, sin tráfico a la pasarela) | Ejecutado |

Reservas de prueba: DIN-2026-9401 (esc. 1), DIN-2026-9402 (esc. 2, 4a y 5) y DIN-2026-9403 (esc. 4b).
Tarjetas de sandbox: Visa `4110 7600 0000 0008` (aprobada para tokenizar) y Visa `4110 7600 0000 0016` (cobros rechazados), fecha `12/30`, CVV `123`.
`requestId` marcado «sesión» es el de la tokenización (`/api/session`); el resto son los de los cobros (`/api/collect`).

## Escenario 3 — qué falta y cómo se cierra

Falta la tarjeta de prueba de Evertec con un mensaje que el sistema trate como **rechazo definitivo**: robada, perdida, bloqueada o cancelada, vencida o expirada, inválida, de uso restringido, tipo de tarjeta inválida u orden de retención. Las tarjetas públicas de sandbox devuelven «Se ha rechazado la petición», que el clasificador trata como recuperable por diseño, así que no sirven para este caso.

Con la tarjeta en mano: tokenizar sin cobro → un único `Collect` → verificar `attempts: 1` y `tokenInvalidation.applied: true` → capturar `escenario-3-cancelada.png`. La lista exacta de mensajes vive en `classifyTokenRejection` (`src/lib/server/placetopay.ts`); el encuadre de la captura, en el correo a Evertec.
