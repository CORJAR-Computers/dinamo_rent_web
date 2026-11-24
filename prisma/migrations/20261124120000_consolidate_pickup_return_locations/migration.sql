-- =============================================================================
-- Migración: consolidate_pickup_return_locations
-- Fecha: 2026-11-24
--
-- Motivo: 20261004210000_normalize_pickup_return_locations ya estaba aplicada
-- en la base, así que reescribir ese archivo no vuelve a ejecutarlo y las
-- reservas históricas seguían mostrando aeropuerto, hoteles, zonas o domicilio.
-- Esta migración es nueva e idempotente: recorre TODAS las filas de
-- `reservations` y consolida cualquier ubicación en el único punto vigente de
-- PICKUP_LOCATIONS (src/lib/data/fleet.ts).
--
-- Regla: solo el valor canónico se reconoce; cualquier otro valor histórico
-- (aeropuerto, hotel, zona, domicilio, NULL o vacío) cae en el DEFAULT, que es
-- justamente el valor de la oficina principal. Así ninguna fila queda fuera de
-- PICKUP_LOCATIONS, que es lo que exige la API de reservas.
--
-- También alinea el DEFAULT de la base de datos con prisma/schema.prisma, que
-- ya no usa el aeropuerto como valor por defecto.
--
-- Aplicación: el build no ejecuta migraciones. Con historial de `prisma migrate`:
--   npx prisma migrate deploy
-- Sin historial (sincronizado antes con `prisma db push`):
--   npx prisma db execute --file prisma/migrations/20261124120000_consolidate_pickup_return_locations/migration.sql --url "$DATABASE_URL"
-- =============================================================================

WITH legacy (old, canonical) AS (
  VALUES
    -- Única ubicación vigente (se mapea a sí misma: no-op)
    ('Oficina Principal — Crespo',
     'Oficina Principal — Crespo'),
    -- Variante con guion simple (teclado sin em dash)
    ('Oficina Principal - Crespo',
     'Oficina Principal — Crespo')
),
-- Claves de comparación: minúsculas + espacios colapsados + recortados
-- (la parte de espacios/mayúsculas de locationKey() en fleet.ts).
norm (key, canonical) AS (
  SELECT lower(btrim(regexp_replace(old, '\s+', ' ', 'g'))), canonical
  FROM legacy
),
-- Valores de las columnas ya saneados: NULL -> '' y espacios colapsados.
src (id, pk, rk) AS (
  SELECT
    id,
    btrim(regexp_replace(coalesce("pickupLocation", ''), '\s+', ' ', 'g')),
    btrim(regexp_replace(coalesce("returnLocation", ''), '\s+', ' ', 'g'))
  FROM "reservations"
),
mapped AS (
  SELECT
    s.id,
    coalesce(np.canonical,
             'Oficina Principal — Crespo') AS pickup_new,
    coalesce(nr.canonical,
             'Oficina Principal — Crespo') AS return_new
  FROM src AS s
  LEFT JOIN norm AS np ON np.key = lower(s.pk)
  LEFT JOIN norm AS nr ON nr.key = lower(s.rk)
)
UPDATE "reservations" AS r
SET "pickupLocation" = m.pickup_new,
    "returnLocation"  = m.return_new
FROM mapped AS m
WHERE r.id = m.id
  AND (r."pickupLocation" IS DISTINCT FROM m.pickup_new
    OR r."returnLocation"  IS DISTINCT FROM m.return_new);

-- DEFAULT de la base = PICKUP_LOCATIONS[0] de src/lib/data/fleet.ts.
ALTER TABLE "reservations"
  ALTER COLUMN "pickupLocation" SET DEFAULT 'Oficina Principal — Crespo',
  ALTER COLUMN "returnLocation" SET DEFAULT 'Oficina Principal — Crespo';
