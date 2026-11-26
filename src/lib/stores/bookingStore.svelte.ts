import type { Vehicle } from '#lib/data/fleet.js';
import { PICKUP_LOCATIONS } from '#lib/data/fleet.js';
import { calcTaxes } from '#lib/utils/taxes.js';
import { calcRentalDays } from '#lib/utils/rentalDays.js';
import { SvelteDate } from 'svelte/reactivity';

export interface DriverData {
    docType: string;
    docNumber: string;
    names: string;
    lastnames: string;
    phone: string;
    email: string;
    license: string;
    licenseExp: string;
}

export interface ReservationResult {
    id: string;
    code: string;
    status: string;
    /** Subtotal sin IVA (vehículo + seguro + adicionales), tal como lo guarda el servidor. */
    subtotalAmount: number;
    /** IVA 19% calculado por el servidor. */
    taxAmount: number;
    totalAmount: number;
    blockingAmount: number;
    synced: boolean;
    desktopRef: string | null;
}

class BookingStore {
    currency = $state<'COP' | 'USD'>('COP');
    usdRate = $state<number>(4000);

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
        licenseExp: ''
    });

    // Signature data url
    signatureDataUrl = $state<string | null>(null);

    // Digitalización de documentos (fotos del documento y licencia)
    docPhotoUrl = $state<string | null>(null);
    licensePhotoUrl = $state<string | null>(null);

    // Modal state — ahora 4 pasos (el voucher se muestra en /pago/retorno)
    isModalOpen = $state<boolean>(false);
    modalStep = $state<number>(1); // 1: Seguros, 2: Conductor, 3: Firma, 4: Pago (redirect)

    // Reservation persisted
    reservationId = $state<string>('');
    persistedReservation = $state<ReservationResult | null>(null);
    /** Huella de lo cotizado al crear la reserva: evita duplicarla al volver atrás. */
    private persistedFingerprint = $state<string>('');
    submitting = $state<boolean>(false);
    errorMessage = $state<string>('');
    paymentRedirectUrl = $state<string | null>(null);
    // Control de doble pago: transacción PENDIENTE que bloquea un nuevo intento
    pendingTransaction = $state<{
        reference: string;
        requestId: string;
        amount: number;
        date: string;
    } | null>(null);

    // Estado de disponibilidad preventiva
    checkingAvailability = $state<boolean>(false);
    isAvailableForSelectedDates = $state<boolean>(true);
    availabilityMessage = $state<string>('');

    constructor() {
        this.initDates();
    }

    initDates() {
        const today = new SvelteDate();
        const returnD = new SvelteDate();
        returnD.setDate(today.getDate() + 3);

        const pad = (n: number) => n.toString().padStart(2, '0');
        const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        this.pickupDate = toISO(today);
        this.returnDate = toISO(returnD);
    }

    /**
     * Días facturables en periodos de 24 horas desde la hora de entrega.
     * Antes se contaban solo las fechas: devolver a las 18:00 lo recogido a las
     * 10:00 tres días antes (80 horas) se cobraba como 3 días en vez de 4.
     */
    get rentalDays(): number {
        return calcRentalDays(
            this.pickupDate,
            this.pickupTime,
            this.returnDate,
            this.returnTime
        );
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

    /** Suma de vehículo, seguro y adicionales, sin IVA. */
    get subtotalAmount(): number {
        return this.baseVehicleTotal + this.insuranceTotal + this.extrasTotal;
    }

    get ivaAmount(): number {
        return calcTaxes(this.subtotalAmount).iva;
    }

    /** Total a pagar, con IVA incluido. */
    get grandTotal(): number {
        return calcTaxes(this.subtotalAmount).total;
    }

    get depositAmount(): number {
        if (!this.selectedVehicle) return 0;
        return this.insuranceCoverage === 'total'
            ? Math.round(this.selectedVehicle.depositCOP * 0.7)
            : this.selectedVehicle.depositCOP;
    }

    get blockingAmount(): number {
        return Math.round(this.subtotalAmount * 0.25);
    }

    openBooking(vehicle: Vehicle) {
        this.selectedVehicle = vehicle;
        this.modalStep = 1;
        this.isModalOpen = true;
        this.persistedReservation = null;
        this.persistedFingerprint = '';
        this.errorMessage = '';
        this.paymentRedirectUrl = null;
        this.pendingTransaction = null;
        this.isAvailableForSelectedDates = true;
        this.availabilityMessage = '';
        if (!this.reservationId) {
            this.generateReservationId();
        }
        // Consulta preventiva de disponibilidad
        this.checkAvailability();
    }

    async checkAvailability(): Promise<boolean> {
        if (!this.selectedVehicle || !this.pickupDate || !this.returnDate) return true;
        this.checkingAvailability = true;
        try {
            const params = new URLSearchParams({
                vehicleId: this.selectedVehicle.id,
                pickupDate: this.pickupDate,
                returnDate: this.returnDate
            });
            const res = await fetch(`/api/reservations/check-availability?${params.toString()}`);
            const data = await res.json();
            if (data?.ok) {
                this.isAvailableForSelectedDates = !!data.available;
                this.availabilityMessage = data.reason || '';
                return this.isAvailableForSelectedDates;
            }
            return true;
        } catch {
            return true;
        } finally {
            this.checkingAvailability = false;
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

    /**
     * Huella de lo que se cotizó al crear la reserva (sin firma ni fotos, que
     * son datos pesados y no cambian el precio). Sirve para no insertar dos
     * reservas cuando el cliente vuelve atrás y avanza de nuevo sin cambios, y
     * para rehacerla si modifica fechas, coberturas o adicionales.
     */
    private quoteFingerprint(): string {
        return JSON.stringify({
            vehicleId: this.selectedVehicle?.id ?? '',
            pickupDate: this.pickupDate,
            pickupTime: this.pickupTime,
            returnDate: this.returnDate,
            returnTime: this.returnTime,
            driver: this.driver,
            insuranceCoverage: this.insuranceCoverage,
            extras: {
                babySeat: this.extraBabySeat,
                secondDriver: this.extraSecondDriver,
                fullTank: this.extraFullTank
            }
        });
    }

    // Crea la reserva en PostgreSQL (llamada al avanzar de paso 3 firma)
    async createReservation(): Promise<boolean> {
        if (!this.selectedVehicle) return false;

        // Volver atrás y avanzar otra vez sin cambiar nada no debe crear una
        // segunda reserva PENDIENTE en la base ni consumir otro intento.
        const fingerprint = this.quoteFingerprint();
        if (this.persistedReservation && this.persistedFingerprint === fingerprint) {
            this.errorMessage = '';
            return true;
        }

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
                    // Único punto de entrega y devolución (sin selector en la UI).
                    pickupLocation: PICKUP_LOCATIONS[0],
                    returnLocation: PICKUP_LOCATIONS[0],
                    customerName: this.driver.names,
                    customerLastname: this.driver.lastnames,
                    customerEmail: this.driver.email,
                    customerPhone: this.driver.phone,
                    customerIdType: this.driver.docType,
                    customerIdNumber: this.driver.docNumber,
                    customerLicense: this.driver.license,
                    customerLicenseExp: this.driver.licenseExp,
                    insurancePlan: this.insuranceCoverage === 'total' ? 'TOTAL' : 'BASICO',
                    extras: {
                        babySeat: this.extraBabySeat,
                        secondDriver: this.extraSecondDriver,
                        fullTank: this.extraFullTank
                    },
                    signatureDataUrl: this.signatureDataUrl,
                    docPhotoUrl: this.docPhotoUrl,
                    licensePhotoUrl: this.licensePhotoUrl,
                    notes: ''
                })
            });
            const data = await res.json();
            if (!data?.ok) throw new Error(data?.error || 'Error al crear reserva');
            this.persistedReservation = {
                id: data.reservation.id,
                code: data.reservation.code,
                status: data.reservation.status,
                subtotalAmount: data.reservation.subtotalAmount,
                taxAmount: data.reservation.taxAmount,
                totalAmount: data.reservation.totalAmount,
                blockingAmount: data.reservation.blockingAmount,
                synced: data.reservation.synced,
                desktopRef: data.reservation.desktopRef
            };
            this.reservationId = data.reservation.code;
            this.persistedFingerprint = fingerprint;
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
        this.pendingTransaction = null;
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
            if (data?.code === 'PENDING_TRANSACTION' && data.pending) {
                this.pendingTransaction = {
                    reference: data.pending.reference,
                    requestId: data.pending.requestId,
                    amount: Number(data.pending.amount) || 0,
                    date: data.pending.date
                };
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

declare global {
    interface Window {
        /** Depuración en consola: acceso directo al store de reservas. */
        __booking?: BookingStore;
    }
}

if (typeof window !== 'undefined') {
    window.__booking = booking;
}
