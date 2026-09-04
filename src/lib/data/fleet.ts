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
  image: string;
  features: string[];
}

export const FLEET_DATABASE: Vehicle[] = [
  {
    id: 'onix-turbo',
    name: 'Chevrolet Onix Turbo',
    category: 'economico',
    categoryLabel: 'Económico • 2024',
    badge: 'Más Alquilado en Cartagena',
    priceCOP: 160000,
    depositCOP: 1000000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '2 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: 'LMY-842',
    image: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=85',
    features: ['Apple CarPlay / Android Auto', 'Cámara de Reversa', 'Motor Turbo 1.0L', 'Excelente Consumo']
  },
  {
    id: 'renault-kwid',
    name: 'Renault Kwid Iconic',
    category: 'economico',
    categoryLabel: 'Económico Compacto • 2024',
    badge: 'Ultra Económico',
    priceCOP: 135000,
    depositCOP: 900000,
    passengers: 4,
    transmission: 'Mecánico',
    luggage: '2 Maletas Medianas',
    fuel: 'Gasolina',
    ac: true,
    plate: 'WHT-210',
    image: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=800&q=85',
    features: ['Pantalla Táctil 8"', 'Fácil Parqueo en Centro Histórico', '4 Airbags', 'Dirección Eléctrica']
  },
  {
    id: 'nissan-versa',
    name: 'Nissan Versa Advance',
    category: 'sedan',
    categoryLabel: 'Sedán Familiar • 2024',
    badge: 'Espacioso & Cómodo',
    priceCOP: 180000,
    depositCOP: 1200000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '3 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: 'KLM-409',
    image: 'https://images.unsplash.com/photo-1590362891988-f77804703088?auto=format&fit=crop&w=800&q=85',
    features: ['Baúl Gigante 482L', 'Frenado Autónomo de Emergencia', 'Control Crucero', 'Asientos Confort Zero Gravity']
  },
  {
    id: 'renault-duster',
    name: 'Renault Duster 1.3 Turbo',
    category: 'suv',
    categoryLabel: 'SUV / Camioneta • 2024',
    badge: 'Ideal Playas & Barú',
    priceCOP: 220000,
    depositCOP: 1500000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '4 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: 'FRK-551',
    image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=85',
    features: ['Altura Libre al Suelo 21cm', 'Cámara 360°', 'Modo Eco', 'Climatizador Automático']
  },
  {
    id: 'chevrolet-tracker',
    name: 'Chevrolet Tracker Turbo Premier',
    category: 'suv',
    categoryLabel: 'SUV Familiar • 2024',
    badge: 'Máximo Confort & Techo Panorámico',
    priceCOP: 240000,
    depositCOP: 1500000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '3 Maletas Grandes',
    fuel: 'Gasolina',
    ac: true,
    plate: 'UJM-992',
    image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=85',
    features: ['Techo Corredizo Panorámico', '6 Airbags', 'Alerta de Punto Ciego', 'Cargador Inalámbrico']
  },
  {
    id: 'toyota-prado-txl',
    name: 'Toyota Prado TXL 4x4 Diésel',
    category: 'premium',
    categoryLabel: 'Gama Alta / Blindada • 2024',
    badge: 'VIP & Blindaje Ligero',
    priceCOP: 650000,
    depositCOP: 3500000,
    passengers: 7,
    transmission: 'Automático 4x4',
    luggage: '5 Maletas Grandes',
    fuel: 'Diésel',
    ac: true,
    plate: 'TXR-007',
    image: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=85',
    features: ['Tracción 4x4 Constante', '3 Filas de Asientos en Cuero', 'Nevera a Bordo', 'Sonido Premium JBL']
  }
];

export const PICKUP_LOCATIONS = [
  'Aeropuerto Internacional Rafael Núñez (CTG)',
  'Bocagrande (Oficina Principal / Hotel)',
  'Centro Histórico (Torre del Reloj / Getsemaní)',
  'Manga / Zona Portuaria',
  'Zona Norte / Manzanillo del Mar',
  'Entrega a Domicilio en Hotel / Airbnb'
];
