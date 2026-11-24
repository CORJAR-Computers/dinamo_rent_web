-- =============================================================================
-- Migración: normalize_pickup_return_locations
-- Fecha: 2026-10-04 (actualizada 2026-11-24)
--
-- Objetivo: que TODA fila de `reservations` tenga `pickupLocation` y
-- `returnLocation` con un valor de PICKUP_LOCATIONS (src/lib/data/fleet.ts),
-- la lista que la API de reservas exige desde su validación.
--
-- Fuente de verdad: PICKUP_LOCATIONS (hoy un solo valor vigente: la oficina
-- principal). Todos los valores legados se consolidan ahí: el negocio no hace
-- entregas a domicilio, en aeropuerto ni en hoteles, y las devoluciones en otra
-- ciudad se negocian en la oficina o por WhatsApp, no en el buscador.
--
-- Origen de los valores legados (verificado en el histórico de git):
--   * 'Bocagrande (Oficina Principal / Hotel)': valor de PICKUP_LOCATIONS
--     desde el commit inicial hasta 2026-09.
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
-- Si ya se aplicó la versión anterior, volver a ejecutarla consolida además las
-- reservas históricas de aeropuerto, hoteles y zonas en la oficina principal.
-- =============================================================================

WITH legacy (old, canonical) AS (
  VALUES
    -- Ubicación única vigente (se mapea a sí misma: no-op)
    ('Oficina Principal — Crespo',
     'Oficina Principal — Crespo'),
    -- Variantes con guion simple (teclado sin em dash)
    ('Oficina Principal - Crespo',
     'Oficina Principal — Crespo'),
    ('Crespo (Oficina Principal — Carrera 3 #70-200)',
     'Oficina Principal — Crespo'),
    ('Crespo (Oficina Principal - Carrera 3 #70-200)',
     'Oficina Principal — Crespo'),
    ('Oficina Principal Dinamo Rent',
     'Oficina Principal — Crespo'),
    ('Oficina Principal',
     'Oficina Principal — Crespo'),

    -- ---------------------------------------------------------------------
    -- Ubicaciones que ya no se ofrecen (aeropuerto, hoteles, zonas y
    -- domicilio): sus reservas históricas se consolidan en la oficina.
    -- ---------------------------------------------------------------------
    ('Aeropuerto Internacional Rafael Núñez (CTG)',
     'Oficina Principal — Crespo'),
    ('Aeropuerto Rafael Núñez (CTG)',
     'Oficina Principal — Crespo'),
    ('Aeropuerto Rafael Nunez (CTG)',
     'Oficina Principal — Crespo'),
    ('Aeropuerto Rafael Núñez',
     'Oficina Principal — Crespo'),
    ('Bocagrande / Castillogrande / El Laguito (Hotel)',
     'Oficina Principal — Crespo'),
    ('Bocagrande (Oficina Principal / Hotel)',
     'Oficina Principal — Crespo'),
    ('Bocagrande / El Laguito',
     'Oficina Principal — Crespo'),
    ('Centro Histórico (Torre del Reloj / Getsemaní)',
     'Oficina Principal — Crespo'),
    ('Centro Histórico / Getsemaní',
     'Oficina Principal — Crespo'),
    ('Centro Historico / Getsemani',
     'Oficina Principal — Crespo'),
    ('Manga / Zona Portuaria',
     'Oficina Principal — Crespo'),
    ('Zona Norte / Manzanillo del Mar',
     'Oficina Principal — Crespo'),
    ('Zona Norte / Hoteles Manzanillo',
     'Oficina Principal — Crespo'),
    ('Zona Norte / Manzanillo',
     'Oficina Principal — Crespo'),
    ('Hoteles Zona Norte & Manzanillo',
     'Oficina Principal — Crespo'),
    ('Entrega a Domicilio en Hotel / Airbnb',
     'Oficina Principal — Crespo')
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
