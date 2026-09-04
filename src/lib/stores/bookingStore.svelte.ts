import type { Vehicle } from '$lib/data/fleet';
import { FLEET_DATABASE, PICKUP_LOCATIONS } from '$lib/data/fleet';

export interface DriverData {
  docType: string;
  docNumber: string;
  names: string;
  lastnames: string;
  phone: string;
  email: string;
  license: string;
  licenseExp: string;
  hotel: string;
}

class BookingStore {
  currency = $state<'COP' | 'USD'>('COP');
  usdRate = $state<number>(4000);
  
  pickupPlace = $state<string>(PICKUP_LOCATIONS[0]);
  returnPlace = $state<string>(PICKUP_LOCATIONS[0]);
  
  pickupDate = $state<string>('');
  pickupTime = $state<string>('10:00');
  returnDate = $state<string>('');
  returnTime = $state<string>('10:00');
  
  selectedVehicle = $state<Vehicle | null>(null);
  
  // Insurance and Extras
  insuranceCoverage = $state<'basic' | 'total'>('total'); // 'basic' (deducible 20%) | 'total' (cero deducible)
  extraBabySeat = $state<boolean>(false);
  extraSecondDriver = $state<boolean>(false);
  extraFullTank = $state<boolean>(false);
  
  // Driver Data
  driver = $state<DriverData>({
    docType: 'CC',
    docNumber: '',
    names: '',
    lastnames: '',
    phone: '',
    email: '',
    license: '',
    licenseExp: '',
    hotel: ''
  });
  
  // Signature data url
  signatureDataUrl = $state<string | null>(null);
  
  // Modal state
  isModalOpen = $state<boolean>(false);
  modalStep = $state<number>(1); // 1: Extras/Seguro, 2: Conductor, 3: Firma, 4: Voucher
  
  // Unique reservation code generated on confirmation
  reservationId = $state<string>('');

  constructor() {
    this.initDates();
  }

  initDates() {
    const today = new Date();
    const returnD = new Date();
    returnD.setDate(today.getDate() + 3);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    this.pickupDate = toISO(today);
    this.returnDate = toISO(returnD);
  }

  // Calculated rental days
  get rentalDays(): number {
    if (!this.pickupDate || !this.returnDate) return 1;
    const d1 = new Date(this.pickupDate);
    const d2 = new Date(this.returnDate);
    const diff = d2.getTime() - d1.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days < 1 ? 1 : days;
  }

  // Costs calculation
  get baseVehicleTotal(): number {
    if (!this.selectedVehicle) return 0;
    return this.selectedVehicle.priceCOP * this.rentalDays;
  }

  get insurancePerDay(): number {
    return this.insuranceCoverage === 'total' ? 35000 : 0;
  }

  get insuranceTotal(): number {
    return this.insurancePerDay * this.rentalDays;
  }

  get extrasTotal(): number {
    let total = 0;
    if (this.extraBabySeat) total += 20000 * this.rentalDays;
    if (this.extraSecondDriver) total += 15000 * this.rentalDays;
    if (this.extraFullTank) total += 140000; // pago único
    return total;
  }

  get grandTotal(): number {
    return this.baseVehicleTotal + this.insuranceTotal + this.extrasTotal;
  }

  get depositAmount(): number {
    if (!this.selectedVehicle) return 0;
    // Si tiene seguro total, el depósito/garantía de franquicia se reduce un 30%
    return this.insuranceCoverage === 'total' 
      ? Math.round(this.selectedVehicle.depositCOP * 0.7)
      : this.selectedVehicle.depositCOP;
  }

  openBooking(vehicle: Vehicle) {
    this.selectedVehicle = vehicle;
    this.modalStep = 1;
    this.isModalOpen = true;
    if (!this.reservationId) {
      this.generateReservationId();
    }
  }

  generateReservationId() {
    const random = Math.floor(1000 + Math.random() * 9000);
    const year = new Date().getFullYear();
    this.reservationId = `DIN-${year}-${random}`;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  toggleCurrency() {
    this.currency = this.currency === 'COP' ? 'USD' : 'COP';
  }
}

export const booking = new BookingStore();
