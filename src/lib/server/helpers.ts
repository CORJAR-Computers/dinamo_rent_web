// Helpers compartidos del backend: formato COP, fechas, códigos, tarjetas,
// planes de seguro y extras. Sincronizados con el bookingStore del frontend.

import type { InsurancePlan } from '@prisma/client';

export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatUSD(value: number, usdRate = 4000): string {
  const usd = Math.round(value / usdRate);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(usd);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function daysBetween(start: Date | string, end: Date | string): number {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return 0;
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
}

// Genera código DIN-2026-XXXX
export function genReservationCode(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `DIN-${year}-${n}`;
}

export function genBlockCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `BLK-${n}`;
}

export function genTxId(): string {
  return `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function detectCardBrand(cardNumber: string): string {
  const n = cardNumber.replace(/\s/g, '');
  if (/^4/.test(n)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'MASTERCARD';
  if (/^3[47]/.test(n)) return 'AMEX';
  if (/^6/.test(n)) return 'CODENSA';
  return 'OTRO';
}

export function maskCard(cardNumber: string): string {
  const n = cardNumber.replace(/\s/g, '');
  return n.length < 4 ? '****' : n.slice(-4);
}

export const INSURANCE_CONFIG: Record<
  InsurancePlan,
  { name: string; perDay: number; depositFactor: number; description: string }
> = {
  BASICO: {
    name: 'Seguro Básico Legal',
    perDay: 0,
    depositFactor: 1.0,
    description: 'Deducible del 20%. Depósito/garantía completo requerido.',
  },
  TOTAL: {
    name: 'Cobertura Total Cero Deducible',
    perDay: 35000,
    depositFactor: 0.7,
    description: 'Sin deducible. Depósito/garantía reducido al 70%.',
  },
};

export const EXTRA_PRICES = {
  babySeat: 20000, // COP/día
  secondDriver: 15000, // COP/día
  fullTank: 140000, // COP pago único
} as const;

export interface ExtrasSelection {
  babySeat?: boolean;
  secondDriver?: boolean;
  fullTank?: boolean;
}

export function calcExtrasAmount(extras: ExtrasSelection, days: number): number {
  let total = 0;
  if (extras.babySeat) total += EXTRA_PRICES.babySeat * days;
  if (extras.secondDriver) total += EXTRA_PRICES.secondDriver * days;
  if (extras.fullTank) total += EXTRA_PRICES.fullTank;
  return total;
}

export const BLOCK_PERCENT = 0.25;

export function calcBlockingAmount(base: number, extras: number, insurance: number): number {
  return Math.round((base + extras + insurance) * BLOCK_PERCENT);
}

export const PICKUP_LOCATIONS = [
  'Aeropuerto Internacional Rafael Núñez (CTG)',
  'Bocagrande (Oficina Principal / Hotel)',
  'Centro Histórico (Torre del Reloj / Getsemaní)',
  'Manga / Zona Portuaria',
  'Zona Norte / Manzanillo del Mar',
  'Entrega a Domicilio en Hotel / Airbnb',
];
