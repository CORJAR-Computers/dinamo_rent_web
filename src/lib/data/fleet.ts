import { OFFICE_NEIGHBORHOOD, OFFICE_STREET } from '#lib/data/contact.js';

export interface Vehicle {
  id: string;
  name: string;
  category: 'economico' | 'sedan' | 'suv' | 'premium';
  categoryLabel: string;
  badge: string;
  priceCOP: number;
  depositCOP: number;
  passengers: number;
  transmission: 'Automático' | 'Mecánico' | 'Automático 4x4';
  luggage: string;
  fuel: 'Gasolina' | 'Diésel';
  ac: boolean;
  plate: string;
  /** Unidades físicas disponibles de este modelo (stock real de la flota). */
  units: number;
  image: string;
  features: string[];
}

/**
 * Flota real de Dinamo Rent a Car (17 unidades, 11 modelos).
 * `units` es el stock físico del modelo: alimenta el control de disponibilidad
 * por solapamiento de fechas y la vista de stock del panel administrativo.
 * Las imágenes son de referencia del modelo, no de la unidad física.
 */
export const FLEET_DATABASE: Vehicle[] = [
  {
    id: 'onix',
    name: 'Chevrolet Onix',
    category: 'economico',
    categoryLabel: 'Económico • Sedán',
    badge: 'Más Alquilado',
    priceCOP: 160000,
    depositCOP: 1000000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '2 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 1,
    image: '/images/flota/onix.jpg',
    features: ['Apple CarPlay / Android Auto', 'Cámara de Reversa', 'Motor Turbo 1.0L', 'Excelente Consumo']
  },
  {
    id: 'voyage',
    name: 'Volkswagen Voyage',
    category: 'sedan',
    categoryLabel: 'Sedán • 1.6',
    badge: 'Sedán Amplio',
    priceCOP: 150000,
    depositCOP: 1200000,
    passengers: 5,
    transmission: 'Mecánico',
    luggage: '3 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 2,
    image: '/images/flota/voyage.jpg',
    features: ['Baúl de 484 L', 'Pantalla Táctil', 'Aire Acondicionado', 'Control de Estabilidad']
  },
  {
    id: 'polo',
    name: 'Volkswagen Polo',
    category: 'economico',
    categoryLabel: 'Compacto • Hatchback',
    badge: 'Compacto Premium',
    priceCOP: 165000,
    depositCOP: 1200000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '2 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 2,
    image: '/images/flota/polo.jpg',
    features: ['Apple CarPlay / Android Auto', 'Sensor de Parqueo', 'Motor 1.6', 'Dirección Eléctrica']
  },
  {
    id: 'logan',
    name: 'Renault Logan',
    category: 'sedan',
    categoryLabel: 'Sedán Económico',
    badge: 'La Opción Más Económica',
    priceCOP: 140000,
    depositCOP: 900000,
    passengers: 5,
    transmission: 'Mecánico',
    luggage: '3 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 4,
    image: '/images/flota/logan.jpg',
    features: ['Baúl de 510 L', 'Bajo Consumo', 'Aire Acondicionado', 'Bluetooth']
  },
  {
    id: 'swift',
    name: 'Suzuki Swift',
    category: 'economico',
    categoryLabel: 'Compacto • 2024',
    badge: 'Ágil en la Ciudad',
    priceCOP: 150000,
    depositCOP: 900000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '2 Maletas Medianas',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 1,
    image: '/images/flota/swift.jpg',
    features: ['Pantalla Táctil', 'Cámara de Reversa', 'Excelente Consumo', '6 Airbags']
  },
  {
    id: 'march',
    name: 'Nissan March',
    category: 'economico',
    categoryLabel: 'Compacto • 2024',
    badge: 'Fácil de Parquear',
    priceCOP: 140000,
    depositCOP: 900000,
    passengers: 5,
    transmission: 'Mecánico',
    luggage: '2 Maletas Medianas',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 1,
    image: '/images/flota/march.jpg',
    features: ['Aire Acondicionado', 'Bluetooth', 'Dirección Eléctrica', 'Bajo Consumo']
  },
  {
    id: 'rio',
    name: 'Kia Rio',
    category: 'sedan',
    categoryLabel: 'Sedán Compacto',
    badge: 'Cómodo & Eficiente',
    priceCOP: 160000,
    depositCOP: 1200000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '3 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 1,
    image: '/images/flota/rio.jpg',
    features: ['Apple CarPlay / Android Auto', 'Cámara de Reversa', 'Control de Estabilidad', 'Aire Acondicionado']
  },
  {
    id: 'renault-duster',
    name: 'Renault Duster',
    category: 'suv',
    categoryLabel: 'SUV / Camioneta',
    badge: 'Ideal Playas & Barú',
    priceCOP: 220000,
    depositCOP: 1500000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '4 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 1,
    image: '/images/flota/duster.jpg',
    features: ['Altura Libre al Suelo 21 cm', 'Cámara de Reversa', 'Modo Eco', 'Climatizador Automático']
  },
  {
    id: 'captiva',
    name: 'Chevrolet Captiva',
    category: 'suv',
    categoryLabel: 'SUV Familiar',
    badge: 'Espacio para Toda la Familia',
    priceCOP: 260000,
    depositCOP: 1500000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '4 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 1,
    image: '/images/flota/captiva.jpg',
    features: ['Baúl Amplio', 'Cámara de Reversa', 'Pantalla Táctil', 'Control de Estabilidad']
  },
  {
    id: 'koleos',
    name: 'Renault Koleos',
    category: 'suv',
    categoryLabel: 'SUV Premium',
    badge: 'Confort de Gama Alta',
    priceCOP: 270000,
    depositCOP: 1500000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '4 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 2,
    image: '/images/flota/koleos.jpg',
    features: ['Techo Panorámico', 'Cámara 360°', 'Asientos en Cuero', 'Climatizador Bizona']
  },
  {
    id: 'traverse',
    name: 'Chevrolet Traverse',
    category: 'premium',
    categoryLabel: 'Gama Alta • 7 Pasajeros',
    badge: 'VIP Familiar',
    priceCOP: 380000,
    depositCOP: 3500000,
    passengers: 7,
    transmission: 'Automático',
    luggage: '5 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: '',
    units: 1,
    image: '/images/flota/traverse.jpg',
    features: ['3 Filas de Asientos', 'Cámara 360°', 'Techo Panorámico', 'Sonido Premium']
  }
];

export const PICKUP_LOCATIONS = [
  'Aeropuerto Internacional Rafael Núñez (CTG)',
  `${OFFICE_NEIGHBORHOOD} (Oficina Principal — ${OFFICE_STREET})`,
  'Bocagrande / Castillogrande / El Laguito (Hotel)',
  'Centro Histórico (Torre del Reloj / Getsemaní)',
  'Manga / Zona Portuaria',
  'Zona Norte / Manzanillo del Mar',
  'Entrega a Domicilio en Hotel / Airbnb'
];

/** Clave de comparación insensible a mayúsculas, acentos, guiones y espacios extra. */
function locationKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Valida y normaliza un lugar de recogida contra PICKUP_LOCATIONS.
 * Devuelve el valor canónico de la lista o `null` si no es un valor conocido.
 * (El llamador decide: rechazar la petición o usar el default.)
 */
export function normalizePickupLocation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const needle = locationKey(value);
  if (!needle) return null;
  return PICKUP_LOCATIONS.find((loc) => locationKey(loc) === needle) ?? null;
}
