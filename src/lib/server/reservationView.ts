import type { Prisma } from '@prisma/client';

/**
 * Vista pública de una reserva: lo justo para consultar el comprobante con el
 * código o la referencia de pago.
 *
 * Nunca incluye:
 *  - `payment.token` ni ids/procesos internos de la pasarela (`p2pRequestId`,
 *    `p2pProcessUrl`, `p2pOpType`, `p2pStatusMessage`): permitirían operar la
 *    tarjeta del cliente.
 *  - Datos de contacto o documento del conductor (`customerEmail`,
 *    `customerPhone`, `customerIdType`, `customerIdNumber`): el código de
 *    reserva no es una credencial fuerte y no debe servir para cosechar PII.
 *  - Fotos del documento/licencia, firma y notas internas.
 */
export const PUBLIC_RESERVATION_SELECT = {
  id: true,
  code: true,
  status: true,
  pickupDate: true,
  returnDate: true,
  pickupTime: true,
  returnTime: true,
  pickupLocation: true,
  returnLocation: true,
  days: true,
  baseAmount: true,
  insuranceAmount: true,
  extrasAmount: true,
  blockingAmount: true,
  totalAmount: true,
  insurancePlan: true,
  extras: true,
  customerName: true,
  customerLastname: true,
  synced: true,
  desktopRef: true,
  createdAt: true,
  updatedAt: true,
  vehicle: {
    select: { name: true, image: true, plate: true },
  },
  payment: {
    select: {
      status: true,
      amount: true,
      cardBrand: true,
      cardLast4: true,
      tokenStatus: true,
      transactionId: true,
      p2pSessionStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.ReservationSelect;

/**
 * Límite de consultas públicas por IP: el código `DIN-AAAA-NNNN` tiene pocas
 * combinaciones, así que se frena la enumeración por fuerza bruta.
 */
export const PUBLIC_LOOKUP_RATE_LIMIT = {
  endpointKey: 'public-reservation-lookup',
  windowMs: 10 * 60 * 1000,
  maxRequests: 20,
};
