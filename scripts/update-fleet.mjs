/**
 * Reconciliación puntual de la flota en la base de datos (Neon) con la flota real
 * de Dinamo Rent a Car: 11 modelos / 17 unidades.
 *
 * - Hace upsert de cada modelo con su stock (`units`) y su imagen de referencia.
 * - Marca como no disponibles los modelos antiguos que ya no están en la flota
 *   (no los borra: conservan sus reservas históricas).
 *
 * Uso:
 *   node scripts/update-fleet.mjs            # solo muestra el plan (dry-run)
 *   node scripts/update-fleet.mjs --apply    # aplica los cambios
 *
 * La fuente canónica del catálogo es `src/lib/data/fleet.ts`; este script refleja
 * esa lista para poder aplicarla a la base sin pasar por el endpoint de seed,
 * que está deshabilitado en producción.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';

// Carga DATABASE_URL desde .env sin imprimir valores (Node >= 20.12).
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: se usa la variable de entorno ya presente en la shell.
}

// Prisma 7 exige driver adapter; `pg` no trae timeout de conexión por defecto.
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  }),
  log: ['error'],
});

const APPLY = process.argv.includes('--apply');

const FLEET = [
  {
    id: 'onix', name: 'Chevrolet Onix', category: 'ECONOMICO', categoryLabel: 'Económico • Sedán',
    badge: 'Más Alquilado', pricePerDay: 160000, deposit: 1000000, seats: 5, transmission: 'AUTOMATICA',
    luggage: '2 Maletas Grandes', fuelType: 'GASOLINA', ac: true, plate: null, units: 1,
    image: '/images/flota/onix.jpg',
    features: ['Apple CarPlay / Android Auto', 'Cámara de Reversa', 'Motor Turbo 1.0L', 'Excelente Consumo']
  },
  {
    id: 'voyage', name: 'Volkswagen Voyage', category: 'SEDAN', categoryLabel: 'Sedán • 1.6',
    badge: 'Sedán Amplio', pricePerDay: 150000, deposit: 1200000, seats: 5, transmission: 'MECANICA',
    luggage: '3 Maletas Grandes', fuelType: 'GASOLINA', ac: true, plate: null, units: 2,
    image: '/images/flota/voyage.jpg',
    features: ['Baúl de 484 L', 'Pantalla Táctil', 'Aire Acondicionado', 'Control de Estabilidad']
  },
  {
    id: 'polo', name: 'Volkswagen Polo', category: 'ECONOMICO', categoryLabel: 'Compacto • Hatchback',
    badge: 'Compacto Premium', pricePerDay: 165000, deposit: 1200000, seats: 5, transmission: 'AUTOMATICA',
    luggage: '2 Maletas Grandes', fuelType: 'GASOLINA', ac: true, plate: null, units: 2,
    image: '/images/flota/polo.jpg',
    features: ['Apple CarPlay / Android Auto', 'Sensor de Parqueo', 'Motor 1.6', 'Dirección Eléctrica']
  },
  {
    id: 'logan', name: 'Renault Logan', category: 'SEDAN', categoryLabel: 'Sedán Económico',
    badge: 'La Opción Más Económica', pricePerDay: 140000, deposit: 900000, seats: 5, transmission: 'MECANICA',
    luggage: '3 Maletas Grandes', fuelType: 'GASOLINA', ac: true, plate: null, units: 4,
    image: '/images/flota/logan.jpg',
    features: ['Baúl de 510 L', 'Bajo Consumo', 'Aire Acondicionado', 'Bluetooth']
  },
  {
    id: 'swift', name: 'Suzuki Swift', category: 'ECONOMICO', categoryLabel: 'Compacto • 2024',
    badge: 'Ágil en la Ciudad', pricePerDay: 150000, deposit: 900000, seats: 5, transmission: 'AUTOMATICA',
    luggage: '2 Maletas Medianas', fuelType: 'GASOLINA', ac: true, plate: null, units: 1,
    image: '/images/flota/swift.jpg',
    features: ['Pantalla Táctil', 'Cámara de Reversa', 'Excelente Consumo', '6 Airbags']
  },
  {
    id: 'march', name: 'Nissan March', category: 'ECONOMICO', categoryLabel: 'Compacto • 2024',
    badge: 'Fácil de Parquear', pricePerDay: 140000, deposit: 900000, seats: 5, transmission: 'MECANICA',
    luggage: '2 Maletas Medianas', fuelType: 'GASOLINA', ac: true, plate: null, units: 1,
    image: '/images/flota/march.jpg',
    features: ['Aire Acondicionado', 'Bluetooth', 'Dirección Eléctrica', 'Bajo Consumo']
  },
  {
    id: 'rio', name: 'Kia Rio', category: 'SEDAN', categoryLabel: 'Sedán Compacto',
    badge: 'Cómodo & Eficiente', pricePerDay: 160000, deposit: 1200000, seats: 5, transmission: 'AUTOMATICA',
    luggage: '3 Maletas Grandes', fuelType: 'GASOLINA', ac: true, plate: null, units: 1,
    image: '/images/flota/rio.jpg',
    features: ['Apple CarPlay / Android Auto', 'Cámara de Reversa', 'Control de Estabilidad', 'Aire Acondicionado']
  },
  {
    id: 'renault-duster', name: 'Renault Duster', category: 'SUV', categoryLabel: 'SUV / Camioneta',
    badge: 'Ideal Playas & Barú', pricePerDay: 220000, deposit: 1500000, seats: 5, transmission: 'AUTOMATICA',
    luggage: '4 Maletas Grandes', fuelType: 'GASOLINA', ac: true, plate: null, units: 1,
    image: '/images/flota/duster.jpg',
    features: ['Altura Libre al Suelo 21 cm', 'Cámara de Reversa', 'Modo Eco', 'Climatizador Automático']
  },
  {
    id: 'captiva', name: 'Chevrolet Captiva', category: 'SUV', categoryLabel: 'SUV Familiar',
    badge: 'Espacio para Toda la Familia', pricePerDay: 260000, deposit: 1500000, seats: 5, transmission: 'AUTOMATICA',
    luggage: '4 Maletas Grandes', fuelType: 'GASOLINA', ac: true, plate: null, units: 1,
    image: '/images/flota/captiva.jpg',
    features: ['Baúl Amplio', 'Cámara de Reversa', 'Pantalla Táctil', 'Control de Estabilidad']
  },
  {
    id: 'koleos', name: 'Renault Koleos', category: 'SUV', categoryLabel: 'SUV Premium',
    badge: 'Confort de Gama Alta', pricePerDay: 270000, deposit: 1500000, seats: 5, transmission: 'AUTOMATICA',
    luggage: '4 Maletas Grandes', fuelType: 'GASOLINA', ac: true, plate: null, units: 2,
    image: '/images/flota/koleos.jpg',
    features: ['Techo Panorámico', 'Cámara 360°', 'Asientos en Cuero', 'Climatizador Bizona']
  },
  {
    id: 'traverse', name: 'Chevrolet Traverse', category: 'PREMIUM', categoryLabel: 'Gama Alta • 7 Pasajeros',
    badge: 'VIP Familiar', pricePerDay: 380000, deposit: 3500000, seats: 7, transmission: 'AUTOMATICA',
    luggage: '5 Maletas Grandes', fuelType: 'GASOLINA', ac: true, plate: null, units: 1,
    image: '/images/flota/traverse.jpg',
    features: ['3 Filas de Asientos', 'Cámara 360°', 'Techo Panorámico', 'Sonido Premium']
  }
];

/** Modelos que salieron de la flota: se ocultan del catálogo, no se borran. */
const OBSOLETE_IDS = ['onix-turbo', 'renault-kwid', 'nissan-versa', 'chevrolet-tracker', 'toyota-prado-txl'];

const totalUnits = FLEET.reduce((acc, v) => acc + v.units, 0);

async function main() {
  const existing = await prisma.vehicle.findMany({
    select: { id: true, name: true, units: true, available: true },
    orderBy: { name: 'asc' }
  });

  console.log(`Flota objetivo: ${FLEET.length} modelos / ${totalUnits} unidades`);
  console.log(`Vehículos en base: ${existing.length}`);
  for (const v of existing) {
    const target = FLEET.find((f) => f.id === v.id);
    const mark = target ? 'actualiza' : OBSOLETE_IDS.includes(v.id) ? 'oculta' : 'sin cambios';
    console.log(`  - ${v.id} (${v.name}) · ${v.units ?? 1} u. · ${v.available ? 'visible' : 'oculto'} → ${mark}`);
  }

  if (!APPLY) {
    console.log('\nDry-run: nada se modificó. Ejecuta con --apply para aplicar.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const v of FLEET) {
      const data = { ...v, available: true };
      await tx.vehicle.upsert({ where: { id: v.id }, create: data, update: data });
    }
    if (OBSOLETE_IDS.length) {
      await tx.vehicle.updateMany({
        where: { id: { in: OBSOLETE_IDS } },
        data: { available: false }
      });
    }
  });

  const after = await prisma.vehicle.findMany({
    where: { available: true },
    select: { id: true, name: true, units: true },
    orderBy: { name: 'asc' }
  });
  const units = after.reduce((acc, v) => acc + (v.units ?? 1), 0);
  console.log(`\nAplicado: ${after.length} modelos visibles / ${units} unidades.`);
}

main()
  .catch((err) => {
    console.error('Error actualizando la flota:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
