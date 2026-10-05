-- =============================================================================
-- Migración: normalize_pickup_return_locations
-- Fecha: 2026-10-04
--
-- Objetivo: que TODA fila de `reservations` tenga `pickupLocation` y
-- `returnLocation` con un valor de PICKUP_LOCATIONS (src/lib/data/fleet.ts),
-- la lista que la API de reservas exige desde su validación.
--
-- Fuente de verdad: PICKUP_LOCATIONS (7 valores). El literal DEFAULT es
-- PICKUP_LOCATIONS[0]; si esa lista cambia de orden, actualizar el literal.
--
-- Origen de los valores legados (verificado en el histórico de git):
--   * 'Bocagrande (Oficina Principal / Hotel)': valor de PICKUP_LOCATIONS
--     desde el commit inicial hasta 2026-09. Se mapea a la variante Bocagrande
--     (la palabra clave del valor viejo); la oficina de Crespo es una ubicación
--     posterior que esas filas no podían describir.
--   * 'Aeropuerto Rafael Núñez (CTG)' y similares: default literal del
--     bookingStore en versiones tempranas (sin "Internacional").
--   * Etiquetas de la landing estática (app.js / index.html antiguos).
--   * NULL, vacío o solo espacios -> DEFAULT, igual que hace la API.
--
-- Todo valor no reconocido cae en DEFAULT: ninguna fila puede quedar fuera de
-- PICKUP_LOCATIONS (ese es justamente el objetivo de la migración).
--
-- Nota de aplicación: este esquema se ha sincronizado con `prisma db push`
-- (no existía historial de migraciones), así que puede aplicarse con:
--   npx prisma db execute --file prisma/migrations/20261004210000_normalize_pickup_return_locations/migration.sql --url "$DATABASE_URL"
-- o, si se adopta `prisma migrate` desde ahora, con `npx prisma migrate deploy`.
-- =============================================================================

WITH legacy (old, canonical) AS (
  VALUES
    -- ---------------------------------------------------------------------
    -- Valores actuales de PICKUP_LOCATIONS (se mapean a sí mismos: no-op)
    -- ---------------------------------------------------------------------
    ('Aeropuerto Internacional Rafael Núñez (CTG)',
     'Aeropuerto Internacional Rafael Núñez (CTG)'),
    ('Crespo (Oficina Principal — Carrera 3 #70-200)',
     'Crespo (Oficina Principal — Carrera 3 #70-200)'),
    -- Variante con guion simple (teclado sin em dash)
    ('Crespo (Oficina Principal - Carrera 3 #70-200)',
     'Crespo (Oficina Principal — Carrera 3 #70-200)'),
    ('Bocagrande / Castillogrande / El Laguito (Hotel)',
     'Bocagrande / Castillogrande / El Laguito (Hotel)'),
    ('Centro Histórico (Torre del Reloj / Getsemaní)',
     'Centro Histórico (Torre del Reloj / Getsemaní)'),
    ('Manga / Zona Portuaria',
     'Manga / Zona Portuaria'),
    ('Zona Norte / Manzanillo del Mar',
     'Zona Norte / Manzanillo del Mar'),
    ('Entrega a Domicilio en Hotel / Airbnb',
     'Entrega a Domicilio en Hotel / Airbnb'),

    -- ---------------------------------------------------------------------
    -- Legados históricos (PICKUP_LOCATIONS del commit inicial -> 2026-09)
    -- ---------------------------------------------------------------------
    ('Bocagrande (Oficina Principal / Hotel)',
     'Bocagrande / Castillogrande / El Laguito (Hotel)'),

    -- ---------------------------------------------------------------------
    -- Legados del bookingStore temprano y de la landing estática
    -- ---------------------------------------------------------------------
    ('Aeropuerto Rafael Núñez (CTG)',
     'Aeropuerto Internacional Rafael Núñez (CTG)'),
    ('Aeropuerto Rafael Nunez (CTG)',
     'Aeropuerto Internacional Rafael Núñez (CTG)'),
    ('Aeropuerto Rafael Núñez',
     'Aeropuerto Internacional Rafael Núñez (CTG)'),
    ('Oficina Principal Dinamo Rent',
     'Crespo (Oficina Principal — Carrera 3 #70-200)'),
    ('Oficina Principal',
     'Crespo (Oficina Principal — Carrera 3 #70-200)'),
    ('Bocagrande / El Laguito',
     'Bocagrande / Castillogrande / El Laguito (Hotel)'),
    ('Centro Histórico / Getsemaní',
     'Centro Histórico (Torre del Reloj / Getsemaní)'),
    ('Centro Historico / Getsemani',
     'Centro Histórico (Torre del Reloj / Getsemaní)'),
    ('Zona Norte / Hoteles Manzanillo',
     'Zona Norte / Manzanillo del Mar'),
    ('Zona Norte / Manzanillo',
     'Zona Norte / Manzanillo del Mar'),
    ('Hoteles Zona Norte & Manzanillo',
     'Zona Norte / Manzanillo del Mar')
),
-- Claves de comparación con la MISMA normalización que aplicará el lookup:
-- minúsculas + espacios colapsados + recortados (equivalente a locationKey()
-- de src/lib/data/fleet.ts en su parte de espacios/mayúsculas).
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
             'Aeropuerto Internacional Rafael Núñez (CTG)') AS pickup_new,
    coalesce(nr.canonical,
             'Aeropuerto Internacional Rafael Núñez (CTG)') AS return_new
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
