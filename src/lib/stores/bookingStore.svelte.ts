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

export interface ReservationResult {
    id: string;
    code: string;
    status: string;
    totalAmount: number;
    blockingAmount: number;
    synced: boolean;
    desktopRef: string | null;
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
    insuranceCoverage = $state<'basic' | 'total'>('total');
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

    // Modal state — ahora 4 pasos (el voucher se muestra en /pago/retorno)
    isModalOpen = $state<boolean>(false);
    modalStep = $state<number>(1); // 1: Seguros, 2: Conductor, 3: Firma, 4: Pago (redirect)

    // Reservation persisted
    reservationId = $state<string>('');
    persistedReservation = $state<ReservationResult | null>(null);
    submitting = $state<boolean>(false);
    errorMessage = $state<string>('');
    paymentRedirectUrl = $state<string | null>(null);

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

    get rentalDays(): number {
        if (!this.pickupDate || !this.returnDate) return 1;
        const d1 = new Date(this.pickupDate);
        const d2 = new Date(this.returnDate);
        const diff = d2.getTime() - d1.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return days < 1 ? 1 : days;
    }

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
        if (this.extraFullTank) total += 140000;
        return total;
    }

    get grandTotal(): number {
        return this.baseVehicleTotal + this.insuranceTotal + this.extrasTotal;
    }

    get depositAmount(): number {
        if (!this.selectedVehicle) return 0;
        return this.insuranceCoverage === 'total'
            ? Math.round(this.selectedVehicle.depositCOP * 0.7)
            : this.selectedVehicle.depositCOP;
    }

    get blockingAmount(): number {
        return Math.round(this.grandTotal * 0.25);
    }

    openBooking(vehicle: Vehicle) {
        this.selectedVehicle = vehicle;
        this.modalStep = 1;
        this.isModalOpen = true;
        this.persistedReservation = null;
        this.errorMessage = '';
        this.paymentRedirectUrl = null;
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

    // === INTEGRACIÓN CON BACKEND ===

    // Crea la reserva en PostgreSQL (llamada al avanzar de paso 3 firma)
    async createReservation(): Promise<boolean> {
        if (!this.selectedVehicle) return false;
        this.submitting = true;
        this.errorMessage = '';
        try {
            const res = await fetch('/api/reservations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: this.selectedVehicle.id,
                    pickupDate: this.pickupDate,
                    returnDate: this.returnDate,
                    pickupTime: this.pickupTime,
                    returnTime: this.returnTime,
                    pickupLocation: this.pickupPlace,
                    returnLocation: this.returnPlace,
                    customerName: this.driver.names,
                    customerLastname: this.driver.lastnames,
                    customerEmail: this.driver.email,
                    customerPhone: this.driver.phone,
                    customerIdType: this.driver.docType,
                    customerIdNumber: this.driver.docNumber,
                    customerLicense: this.driver.license,
                    customerLicenseExp: this.driver.licenseExp,
                    customerHotel: this.driver.hotel,
                    insurancePlan: this.insuranceCoverage === 'total' ? 'TOTAL' : 'BASICO',
                    extras: {
                        babySeat: this.extraBabySeat,
                        secondDriver: this.extraSecondDriver,
                        fullTank: this.extraFullTank
                    },
                    signatureDataUrl: this.signatureDataUrl,
                    notes: ''
                })
            });
            const data = await res.json();
            if (!data?.ok) throw new Error(data?.error || 'Error al crear reserva');
            this.persistedReservation = {
                id: data.reservation.id,
                code: data.reservation.code,
                status: data.reservation.status,
                totalAmount: data.reservation.totalAmount,
                blockingAmount: data.reservation.blockingAmount,
                synced: data.reservation.synced,
                desktopRef: data.reservation.desktopRef
            };
            this.reservationId = data.reservation.code;
            return true;
        } catch (e) {
            this.errorMessage = (e as Error).message;
            return false;
        } finally {
            this.submitting = false;
        }
    }

    // Inicia el pago con la pasarela: crea la sesión y redirige al checkout seguro
    async redirectToPayment(): Promise<boolean> {
        if (!this.persistedReservation) return false;
        this.submitting = true;
        this.errorMessage = '';
        try {
            const res = await fetch('/api/payments/create-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reservationId: this.persistedReservation.id
                })
            });
            const data = await res.json();
            if (data?.ok && data.processUrl) {
                this.paymentRedirectUrl = data.processUrl;
                // Redirige al checkout seguro de la pasarela
                window.location.href = data.processUrl;
                return true;
            }
            this.errorMessage = data?.error || 'No se pudo iniciar el pago';
            return false;
        } catch (e) {
            this.errorMessage = (e as Error).message;
            return false;
        } finally {
            this.submitting = false;
        }
    }

    // Fuerza sincronización con la app de escritorio
    async syncWithDesktop(): Promise<boolean> {
        if (!this.persistedReservation) return false;
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entity: 'RESERVATION',
                    entityId: this.persistedReservation.id
                })
            });
            const data = await res.json();
            if (data?.ok) {
                if (this.persistedReservation) {
                    this.persistedReservation.synced = true;
                    this.persistedReservation.desktopRef = data.desktopRef || null;
                }
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }
}

export const booking = new BookingStore();