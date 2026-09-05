<script lang="ts">
    import { booking } from "$lib/stores/bookingStore.svelte";
    import { formatCurrency, formatDatePretty } from "$lib/utils/formatters";
    import SignatureCanvas from "./SignatureCanvas.svelte";

    let vehicle = $derived(booking.selectedVehicle);
    let termsAccepted = $state(true);
    let formError = $state<string | null>(null);

    function validateStep2(): boolean {
        const d = booking.driver;
        if (!d.names.trim() || !d.lastnames.trim()) {
            formError = "Por favor ingresa nombre y apellidos completos.";
            return false;
        }
        if (!d.docNumber.trim()) {
            formError =
                "Por favor ingresa el número de documento de identidad.";
            return false;
        }
        if (!d.phone.trim() || d.phone.length < 7) {
            formError =
                "Por favor ingresa un número de teléfono o WhatsApp válido.";
            return false;
        }
        if (!d.email.trim() || !d.email.includes("@")) {
            formError = "Por favor ingresa un correo electrónico válido.";
            return false;
        }
        formError = null;
        return true;
    }

    async function nextStep() {
        formError = null;
        if (booking.modalStep === 2) {
            if (!validateStep2()) return;
        }
        if (booking.modalStep === 3) {
            if (!booking.signatureDataUrl) {
                formError =
                    "Por favor realiza tu trazo de firma en el recuadro antes de continuar.";
                return;
            }
            if (!termsAccepted) {
                formError =
                    "Debes aceptar los términos y condiciones del servicio.";
                return;
            }
            // Crea la reserva en PostgreSQL al avanzar de la firma
            const ok = await booking.createReservation();
            if (!ok) {
                formError =
                    booking.errorMessage ||
                    "No se pudo crear la reserva. Intenta de nuevo.";
                return;
            }
        }
        if (booking.modalStep === 4) {
            // Paso de pago: redirige al checkout seguro de la pasarela
            const ok = await booking.redirectToPayment();
            if (!ok) {
                formError =
                    booking.errorMessage || "No se pudo iniciar el pago.";
            }
            return; // no avanza — la redirección reemplaza el paso 5
        }
        if (booking.modalStep < 4) {
            booking.modalStep++;
        }
    }

    function prevStep() {
        formError = null;
        if (booking.modalStep > 1) {
            booking.modalStep--;
        }
    }

    function handlePrint() {
        window.print();
    }
</script>

{#if booking.isModalOpen && vehicle}
    <div
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
        role="dialog"
        aria-modal="true"
    >
        <div
            class="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
            <!-- Modal Header -->
            <div
                class="relative bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between"
            >
                <div class="flex items-center gap-3">
                    <div class="w-10 h-12 flex items-center justify-center">
                        <img
                            src="/images/logo-dinamo.png"
                            alt="Dinamo Logo"
                            class="h-10 object-contain drop-shadow"
                        />
                    </div>
                    <div>
                        <span
                            class="text-[10px] font-bold uppercase tracking-wider text-orange-400"
                        >
                            Solicitud de Reserva #{booking.reservationId}
                        </span>
                        <h3
                            class="font-heading font-black text-lg text-white leading-tight"
                        >
                            {vehicle.name}
                        </h3>
                    </div>
                </div>

                <button
                    type="button"
                    onclick={() => booking.closeModal()}
                    class="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                    aria-label="Cerrar modal"
                >
                    <i class="fa-solid fa-xmark text-sm"></i>
                </button>
            </div>

            <!-- Step Indicator Bar (4 pasos: Seguros, Conductor, Firma, Pago) -->
            <div
                class="bg-slate-950 px-4 sm:px-6 py-2.5 border-b border-slate-800/80 flex items-center justify-between text-xs font-semibold overflow-x-auto"
            >
                <div class="flex items-center gap-2 shrink-0">
                    <span
                        class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black {booking.modalStep >=
                        1
                            ? 'bg-orange-500 text-white'
                            : 'bg-slate-800 text-slate-500'}">1</span
                    >
                    <span
                        class="{booking.modalStep === 1
                            ? 'text-white'
                            : 'text-slate-500'} hidden sm:inline">Seguros</span
                    >
                </div>
                <i class="fa-solid fa-chevron-right text-[10px] text-slate-700"
                ></i>
                <div class="flex items-center gap-2 shrink-0">
                    <span
                        class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black {booking.modalStep >=
                        2
                            ? 'bg-orange-500 text-white'
                            : 'bg-slate-800 text-slate-500'}">2</span
                    >
                    <span
                        class="{booking.modalStep === 2
                            ? 'text-white'
                            : 'text-slate-500'} hidden sm:inline"
                        >Conductor</span
                    >
                </div>
                <i class="fa-solid fa-chevron-right text-[10px] text-slate-700"
                ></i>
                <div class="flex items-center gap-2 shrink-0">
                    <span
                        class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black {booking.modalStep >=
                        3
                            ? 'bg-orange-500 text-white'
                            : 'bg-slate-800 text-slate-500'}">3</span
                    >
                    <span
                        class="{booking.modalStep === 3
                            ? 'text-white'
                            : 'text-slate-500'} hidden sm:inline">Firma</span
                    >
                </div>
                <i class="fa-solid fa-chevron-right text-[10px] text-slate-700"
                ></i>
                <div class="flex items-center gap-2 shrink-0">
                    <span
                        class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black {booking.modalStep >=
                        4
                            ? 'bg-orange-500 text-white'
                            : 'bg-slate-800 text-slate-500'}">4</span
                    >
                    <span
                        class="{booking.modalStep === 4
                            ? 'text-white'
                            : 'text-slate-500'} hidden sm:inline">Pago</span
                    >
                </div>
            </div>

            <!-- Modal Body (Scrollable) -->
            <div class="p-6 overflow-y-auto flex-1 space-y-6">
                {#if formError}
                    <div
                        class="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2"
                    >
                        <i class="fa-solid fa-circle-exclamation text-red-400"
                        ></i>
                        <span>{formError}</span>
                    </div>
                {/if}

                {#if booking.submitting}
                    <div
                        class="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-3"
                    >
                        <i
                            class="fa-solid fa-circle-notch fa-spin text-cyan-400"
                        ></i>
                        <span>Procesando, por favor espera...</span>
                    </div>
                {/if}

                <!-- ================= STEP 1: EXTRAS & COBERTURAS ================= -->
                {#if booking.modalStep === 1}
                    <div class="space-y-6">
                        <div
                            class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                        >
                            <div class="flex items-center gap-2">
                                <i
                                    class="fa-solid fa-calendar-days text-orange-400"
                                ></i>
                                <span class="text-slate-300">
                                    {formatDatePretty(booking.pickupDate)} ➔ {formatDatePretty(
                                        booking.returnDate,
                                    )}
                                </span>
                            </div>
                            <div
                                class="px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 font-bold"
                            >
                                {booking.rentalDays} día{booking.rentalDays > 1
                                    ? "s"
                                    : ""}
                            </div>
                        </div>

                        <div class="space-y-3">
                            <h4
                                class="text-xs font-bold uppercase tracking-wider text-slate-300"
                            >
                                Selecciona tu Nivel de Cobertura
                            </h4>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    class="p-4 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer {booking.insuranceCoverage ===
                                    'total'
                                        ? 'bg-cyan-950/40 border-cyan-500 shadow-lg shadow-cyan-500/10'
                                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'}"
                                    onclick={() =>
                                        (booking.insuranceCoverage = "total")}
                                >
                                    <div>
                                        <span
                                            class="text-[10px] font-bold uppercase tracking-wider text-cyan-400"
                                            >Recomendado</span
                                        >
                                        <h5
                                            class="font-heading font-black text-base text-white mt-1"
                                        >
                                            Cobertura Total
                                        </h5>
                                        <p
                                            class="text-[11px] text-slate-400 mt-1"
                                        >
                                            Cero Deducible · Reducción del 30%
                                            en la garantía
                                        </p>
                                    </div>
                                    <p
                                        class="text-sm font-black text-cyan-400 mt-3"
                                    >
                                        {formatCurrency(
                                            35000,
                                            booking.currency,
                                            booking.usdRate,
                                        )}<span
                                            class="text-[11px] font-medium text-slate-400"
                                            >/día</span
                                        >
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    class="p-4 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer {booking.insuranceCoverage ===
                                    'basic'
                                        ? 'bg-cyan-950/40 border-cyan-500 shadow-lg shadow-cyan-500/10'
                                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'}"
                                    onclick={() =>
                                        (booking.insuranceCoverage = "basic")}
                                >
                                    <div>
                                        <span
                                            class="text-[10px] font-bold uppercase tracking-wider text-slate-500"
                                            >Estándar</span
                                        >
                                        <h5
                                            class="font-heading font-black text-base text-white mt-1"
                                        >
                                            Seguro Básico Legal
                                        </h5>
                                        <p
                                            class="text-[11px] text-slate-400 mt-1"
                                        >
                                            Deducible del 20% · Garantía
                                            completa requerida
                                        </p>
                                    </div>
                                    <p
                                        class="text-sm font-black text-emerald-400 mt-3"
                                    >
                                        Incluido
                                    </p>
                                </button>
                            </div>
                        </div>

                        <div class="space-y-3">
                            <h4
                                class="text-xs font-bold uppercase tracking-wider text-slate-300"
                            >
                                Adicionales Opcionales
                            </h4>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <button
                                    type="button"
                                    class="p-3 rounded-xl border text-left transition cursor-pointer {booking.extraBabySeat
                                        ? 'bg-orange-500/10 border-orange-500/50'
                                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'}"
                                    onclick={() =>
                                        (booking.extraBabySeat =
                                            !booking.extraBabySeat)}
                                >
                                    <i
                                        class="fa-solid fa-baby text-orange-400 text-lg"
                                    ></i>
                                    <p
                                        class="font-bold text-sm text-white mt-2"
                                    >
                                        Silla de Bebé
                                    </p>
                                    <p class="text-[11px] text-slate-400">
                                        {formatCurrency(
                                            20000,
                                            booking.currency,
                                            booking.usdRate,
                                        )}/día
                                    </p>
                                </button>
                                <button
                                    type="button"
                                    class="p-3 rounded-xl border text-left transition cursor-pointer {booking.extraSecondDriver
                                        ? 'bg-orange-500/10 border-orange-500/50'
                                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'}"
                                    onclick={() =>
                                        (booking.extraSecondDriver =
                                            !booking.extraSecondDriver)}
                                >
                                    <i
                                        class="fa-solid fa-users text-orange-400 text-lg"
                                    ></i>
                                    <p
                                        class="font-bold text-sm text-white mt-2"
                                    >
                                        2do Conductor
                                    </p>
                                    <p class="text-[11px] text-slate-400">
                                        {formatCurrency(
                                            15000,
                                            booking.currency,
                                            booking.usdRate,
                                        )}/día
                                    </p>
                                </button>
                                <button
                                    type="button"
                                    class="p-3 rounded-xl border text-left transition cursor-pointer {booking.extraFullTank
                                        ? 'bg-orange-500/10 border-orange-500/50'
                                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'}"
                                    onclick={() =>
                                        (booking.extraFullTank =
                                            !booking.extraFullTank)}
                                >
                                    <i
                                        class="fa-solid fa-gas-pump text-orange-400 text-lg"
                                    ></i>
                                    <p
                                        class="font-bold text-sm text-white mt-2"
                                    >
                                        Tanque Lleno
                                    </p>
                                    <p class="text-[11px] text-slate-400">
                                        {formatCurrency(
                                            140000,
                                            booking.currency,
                                            booking.usdRate,
                                        )} pago único
                                    </p>
                                </button>
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- ================= STEP 2: CONDUCTOR ================= -->
                {#if booking.modalStep === 2}
                    <div class="space-y-4">
                        <div>
                            <h4
                                class="font-heading font-black text-lg text-white"
                            >
                                Registro del Conductor Titular
                            </h4>
                            <p class="text-xs text-slate-400">
                                Estos datos se validarán en el mostrador al
                                entregar el vehículo.
                            </p>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div class="space-y-1.5">
                                <label
                                    for="d-names"
                                    class="text-xs font-bold text-slate-300"
                                    >Nombres *</label
                                >
                                <input
                                    id="d-names"
                                    type="text"
                                    bind:value={booking.driver.names}
                                    class="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 outline-none"
                                    placeholder="Ej: Juan Carlos"
                                />
                            </div>
                            <div class="space-y-1.5">
                                <label
                                    for="d-lastnames"
                                    class="text-xs font-bold text-slate-300"
                                    >Apellidos *</label
                                >
                                <input
                                    id="d-lastnames"
                                    type="text"
                                    bind:value={booking.driver.lastnames}
                                    class="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 outline-none"
                                    placeholder="Ej: Pérez López"
                                />
                            </div>
                            <div class="space-y-1.5">
                                <label
                                    for="d-doc-type"
                                    class="text-xs font-bold text-slate-300"
                                    >Tipo de Documento *</label
                                >
                                <select
                                    id="d-doc-type"
                                    bind:value={booking.driver.docType}
                                    class="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 outline-none"
                                >
                                    <option value="CC"
                                        >Cédula de Ciudadanía (CC)</option
                                    >
                                    <option value="CE"
                                        >Cédula de Extranjería (CE)</option
                                    >
                                    <option value="PAS">Pasaporte (PAS)</option>
                                    <option value="NIT">NIT (empresa)</option>
                                </select>
                            </div>
                            <div class="space-y-1.5">
                                <label
                                    for="d-doc-number"
                                    class="text-xs font-bold text-slate-300"
                                    >Número de Documento *</label
                                >
                                <input
                                    id="d-doc-number"
                                    type="text"
                                    bind:value={booking.driver.docNumber}
                                    class="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 outline-none"
                                    placeholder="Número sin puntos"
                                />
                            </div>
                            <div class="space-y-1.5">
                                <label
                                    for="d-phone"
                                    class="text-xs font-bold text-slate-300"
                                    >WhatsApp / Celular *</label
                                >
                                <input
                                    id="d-phone"
                                    type="tel"
                                    bind:value={booking.driver.phone}
                                    class="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 outline-none"
                                    placeholder="+57 300 000 0000"
                                />
                            </div>
                            <div class="space-y-1.5">
                                <label
                                    for="d-email"
                                    class="text-xs font-bold text-slate-300"
                                    >Correo Electrónico *</label
                                >
                                <input
                                    id="d-email"
                                    type="email"
                                    bind:value={booking.driver.email}
                                    class="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 outline-none"
                                    placeholder="tucorreo@email.com"
                                />
                            </div>
                            <div class="space-y-1.5">
                                <label
                                    for="d-license"
                                    class="text-xs font-bold text-slate-300"
                                    >Licencia de Conducción</label
                                >
                                <input
                                    id="d-license"
                                    type="text"
                                    bind:value={booking.driver.license}
                                    class="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 outline-none"
                                    placeholder="Número de licencia"
                                />
                            </div>
                            <div class="space-y-1.5">
                                <label
                                    for="d-license-exp"
                                    class="text-xs font-bold text-slate-300"
                                    >Vencimiento Licencia</label
                                >
                                <input
                                    id="d-license-exp"
                                    type="date"
                                    bind:value={booking.driver.licenseExp}
                                    class="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 outline-none"
                                />
                            </div>
                            <div class="space-y-1.5 sm:col-span-2">
                                <label
                                    for="d-hotel"
                                    class="text-xs font-bold text-slate-300"
                                    >Hotel / Airbnb (opcional)</label
                                >
                                <input
                                    id="d-hotel"
                                    type="text"
                                    bind:value={booking.driver.hotel}
                                    class="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 outline-none"
                                    placeholder="Nombre del hotel o dirección"
                                />
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- ================= STEP 3: FIRMA DIGITAL ================= -->
                {#if booking.modalStep === 3}
                    <div class="space-y-5">
                        <div>
                            <h4
                                class="font-heading font-black text-lg text-white"
                            >
                                Firma Digital del Titular
                            </h4>
                            <p class="text-xs text-slate-400">
                                Conforme a la Ley 527 de 1999 (comercio
                                electrónico en Colombia), tu firma tiene validez
                                pre-contractual.
                            </p>
                        </div>

                        <SignatureCanvas />

                        <div
                            class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 text-xs text-slate-300"
                        >
                            <h5
                                class="font-bold text-white uppercase tracking-wider text-[11px] border-b border-slate-800 pb-2"
                            >
                                Resumen a confirmar
                            </h5>
                            <div class="flex justify-between">
                                <span>Vehículo:</span><span
                                    class="font-semibold text-white"
                                    >{vehicle.name}</span
                                >
                            </div>
                            <div class="flex justify-between">
                                <span>Entrega:</span><span
                                    class="font-semibold text-white"
                                    >{formatDatePretty(booking.pickupDate)}
                                    {booking.pickupTime}</span
                                >
                            </div>
                            <div class="flex justify-between">
                                <span>Devolución:</span><span
                                    class="font-semibold text-white"
                                    >{formatDatePretty(booking.returnDate)}
                                    {booking.returnTime}</span
                                >
                            </div>
                            <div class="flex justify-between">
                                <span>Duración:</span><span
                                    class="font-semibold text-white"
                                    >{booking.rentalDays} día(s)</span
                                >
                            </div>
                            <div class="flex justify-between">
                                <span>Cobertura:</span><span
                                    class="font-semibold text-white"
                                    >{booking.insuranceCoverage === "total"
                                        ? "Total Cero Deducible"
                                        : "Básica Legal"}</span
                                >
                            </div>
                            <div
                                class="flex justify-between pt-2 border-t border-slate-800 text-sm font-black"
                            >
                                <span class="text-white">Total Alquiler:</span
                                ><span class="text-orange-400"
                                    >{formatCurrency(
                                        booking.grandTotal,
                                        booking.currency,
                                        booking.usdRate,
                                    )}</span
                                >
                            </div>
                            <div
                                class="flex justify-between text-[11px] text-slate-400"
                            >
                                <span>Bloqueo de Garantía en Mostrador:</span
                                ><span class="font-semibold text-cyan-300"
                                    >{formatCurrency(
                                        booking.depositAmount,
                                        booking.currency,
                                        booking.usdRate,
                                    )}</span
                                >
                            </div>
                        </div>

                        <label class="flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                bind:checked={termsAccepted}
                                class="mt-0.5 w-4 h-4 rounded text-orange-500 focus:ring-orange-500 bg-slate-800 border-slate-700 cursor-pointer"
                            />
                            <span
                                class="text-slate-300 text-[11px] leading-relaxed"
                            >
                                Declaro que la información suministrada es
                                verídica, autorizo el tratamiento de datos
                                personales conforme a la Ley 1581 de 2012 y
                                entiendo que al retirar el vehículo en mostrador
                                se requerirá presentar documento original,
                                licencia vigente y tarjeta de crédito para el
                                bloqueo de la garantía de <strong
                                    class="text-cyan-400"
                                    >{formatCurrency(
                                        booking.depositAmount,
                                        booking.currency,
                                        booking.usdRate,
                                    )}</strong
                                >.
                            </span>
                        </label>
                    </div>
                {/if}

                <!-- ================= STEP 4: PAGO (REDIRECCIÓN A PASARELA) ================= -->
                {#if booking.modalStep === 4}
                    <div class="space-y-5">
                        <div>
                            <h4
                                class="font-heading font-black text-lg text-white"
                            >
                                Pago Seguro del Alquiler
                            </h4>
                            <p class="text-xs text-slate-400">
                                Serás redirigido a la página segura de nuestra
                                pasarela de pagos para completar la transacción
                                con tu tarjeta de crédito o débito.
                            </p>
                        </div>

                        <!-- Resumen del pago -->
                        <div
                            class="p-5 rounded-2xl bg-gradient-to-br from-slate-950 to-blue-950/30 border border-slate-800 space-y-3"
                        >
                            <div class="flex items-center justify-between">
                                <span
                                    class="text-xs text-slate-400 uppercase tracking-wider"
                                    >Código de Reserva</span
                                >
                                <span
                                    class="font-mono font-bold text-white text-sm"
                                    >{booking.reservationId}</span
                                >
                            </div>
                            <div
                                class="flex items-center justify-between pt-3 border-t border-slate-800"
                            >
                                <span class="text-sm text-slate-300"
                                    >Total a Pagar</span
                                >
                                <span
                                    class="font-heading font-black text-3xl text-orange-400"
                                >
                                    {formatCurrency(
                                        booking.persistedReservation
                                            ?.totalAmount ?? booking.grandTotal,
                                        booking.currency,
                                        booking.usdRate,
                                    )}
                                </span>
                            </div>
                            <div
                                class="flex items-center justify-between text-[11px] text-slate-500"
                            >
                                <span
                                    >Incluye vehículo, seguro y adicionales</span
                                >
                                <span>{booking.rentalDays} día(s)</span>
                            </div>
                        </div>

                        <!-- Info de seguridad -->
                        <div
                            class="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 space-y-2.5 text-xs text-slate-300"
                        >
                            <div class="flex items-start gap-2">
                                <i
                                    class="fa-solid fa-shield-halved text-cyan-400 mt-0.5"
                                ></i>
                                <span
                                    ><strong class="text-white"
                                        >Pago 100% seguro:</strong
                                    > los datos de tu tarjeta se ingresan directamente
                                    en la pasarela certificado PCI-DSS, nunca pasan
                                    por nuestros servidores.</span
                                >
                            </div>
                            <div class="flex items-start gap-2">
                                <i
                                    class="fa-solid fa-credit-card text-cyan-400 mt-0.5"
                                ></i>
                                <span
                                    ><strong class="text-white"
                                        >Aceptamos:</strong
                                    > Visa, Mastercard, American Express y PSE (transferencia
                                    bancaria).</span
                                >
                            </div>
                            <div class="flex items-start gap-2">
                                <i class="fa-solid fa-lock text-cyan-400 mt-0.5"
                                ></i>
                                <span
                                    ><strong class="text-white"
                                        >Garantía:</strong
                                    > el bloqueo de cupo se realiza en mostrador
                                    al entregar el vehículo, no en este pago.</span
                                >
                            </div>
                        </div>

                        <!-- Aviso de redirección -->
                        <div
                            class="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300/80 flex items-start gap-2"
                        >
                            <i class="fa-solid fa-circle-info mt-0.5"></i>
                            <span
                                >Al hacer clic en "Pagar ahora" saldrás de
                                nuestra web y serás redirigido a la pasarela. Al
                                terminar, volverás automáticamente a tu
                                comprobante de reserva.</span
                            >
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Modal Footer -->
            {#if booking.modalStep <= 4}
                <div
                    class="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3"
                >
                    {#if booking.modalStep > 1}
                        <button
                            type="button"
                            onclick={prevStep}
                            disabled={booking.submitting}
                            class="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                            <i class="fa-solid fa-chevron-left text-[10px]"></i>
                            <span>Anterior</span>
                        </button>
                    {:else}
                        <div></div>
                    {/if}

                    <div class="text-right">
                        <span class="text-[10px] text-slate-400 block"
                            >Total Estimado</span
                        >
                        <span
                            class="font-heading font-black text-lg text-orange-400"
                        >
                            {formatCurrency(
                                booking.grandTotal,
                                booking.currency,
                                booking.usdRate,
                            )}
                        </span>
                    </div>

                    <button
                        type="button"
                        onclick={nextStep}
                        disabled={booking.submitting}
                        class="px-6 py-2.5 rounded-xl font-heading font-black text-xs uppercase tracking-wider text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition shadow-lg shadow-orange-500/20 active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:active:scale-100"
                    >
                        {#if booking.submitting}
                            <i class="fa-solid fa-circle-notch fa-spin"></i>
                            <span>Procesando...</span>
                        {:else if booking.modalStep === 3}
                            <span>Crear Reserva</span>
                            <i class="fa-solid fa-arrow-right text-[10px]"></i>
                        {:else if booking.modalStep === 4}
                            <i class="fa-solid fa-lock text-[10px]"></i>
                            <span>Pagar ahora</span>
                        {:else}
                            <span>Continuar</span>
                            <i class="fa-solid fa-arrow-right text-[10px]"></i>
                        {/if}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}
