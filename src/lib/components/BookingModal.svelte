<script lang="ts">
  import { booking } from '$lib/stores/bookingStore.svelte';
  import { formatCurrency, formatDatePretty } from '$lib/utils/formatters';
  import SignatureCanvas from './SignatureCanvas.svelte';

  let vehicle = $derived(booking.selectedVehicle);
  let termsAccepted = $state(true);
  let formError = $state<string | null>(null);

  function validateStep2(): boolean {
    const d = booking.driver;
    if (!d.names.trim() || !d.lastnames.trim()) {
      formError = 'Por favor ingresa nombre y apellidos completos.';
      return false;
    }
    if (!d.docNumber.trim()) {
      formError = 'Por favor ingresa el número de documento de identidad.';
      return false;
    }
    if (!d.phone.trim() || d.phone.length < 7) {
      formError = 'Por favor ingresa un número de teléfono o WhatsApp válido.';
      return false;
    }
    if (!d.email.trim() || !d.email.includes('@')) {
      formError = 'Por favor ingresa un correo electrónico válido.';
      return false;
    }
    formError = null;
    return true;
  }

  function nextStep() {
    formError = null;
    if (booking.modalStep === 2) {
      if (!validateStep2()) return;
    }
    if (booking.modalStep === 3) {
      if (!booking.signatureDataUrl) {
        formError = 'Por favor realiza tu trazo de firma en el recuadro antes de continuar.';
        return;
      }
      if (!termsAccepted) {
        formError = 'Debes aceptar los términos y condiciones del servicio.';
        return;
      }
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

  function getWhatsAppUrl(): string {
    if (!vehicle) return '';
    const text = `*SOLICITUD DE RESERVA — DINAMO RENT A CAR*%0A` +
      `📌 *Código:* ${booking.reservationId}%0A` +
      `🚗 *Vehículo:* ${vehicle.name} (${vehicle.plate})%0A` +
      `🗓 *Entrega:* ${formatDatePretty(booking.pickupDate)} a las ${booking.pickupTime}%0A` +
      `📍 *Lugar Entrega:* ${booking.pickupPlace}%0A` +
      `🗓 *Devolución:* ${formatDatePretty(booking.returnDate)} a las ${booking.returnTime}%0A` +
      `⏱ *Duración:* ${booking.rentalDays} día(s)%0A` +
      `👤 *Conductor:* ${booking.driver.names} ${booking.driver.lastnames}%0A` +
      `🪪 *Documento:* ${booking.driver.docType} ${booking.driver.docNumber}%0A` +
      `📱 *WhatsApp:* ${booking.driver.phone}%0A` +
      `💰 *Total Alquiler:* ${formatCurrency(booking.grandTotal, 'COP')}%0A` +
      `🛡 *Garantía Requerida:* ${formatCurrency(booking.depositAmount, 'COP')}%0A%0A` +
      `_He completado el check-in digital y firmado mi solicitud. Deseo confirmar disponibilidad y pago._`;
    return `https://wa.me/573000000000?text=${text}`;
  }

  function handlePrint() {
    window.print();
  }
</script>

{#if booking.isModalOpen && vehicle}
  <!-- Backdrop -->
  <div 
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
    role="dialog"
    aria-modal="true"
  >
    <!-- Modal Dialog -->
    <div class="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
      
      <!-- Modal Header -->
      <div class="relative bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-12 flex items-center justify-center">
            <img src="/images/logo-dinamo.png" alt="Dinamo Logo" class="h-10 object-contain drop-shadow" />
          </div>
          <div>
            <span class="text-[10px] font-bold uppercase tracking-wider text-orange-400">
              Solicitud de Reserva #{booking.reservationId}
            </span>
            <h3 class="font-heading font-black text-lg text-white leading-tight">
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

      <!-- Step Indicator Bar -->
      <div class="bg-slate-950 px-6 py-2.5 border-b border-slate-800/80 flex items-center justify-between text-xs font-semibold">
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black {booking.modalStep >= 1 ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-500'}">1</span>
          <span class="{booking.modalStep === 1 ? 'text-white' : 'text-slate-500'}">Seguros</span>
        </div>
        <i class="fa-solid fa-chevron-right text-[10px] text-slate-700"></i>
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black {booking.modalStep >= 2 ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-500'}">2</span>
          <span class="{booking.modalStep === 2 ? 'text-white' : 'text-slate-500'}">Conductor</span>
        </div>
        <i class="fa-solid fa-chevron-right text-[10px] text-slate-700"></i>
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black {booking.modalStep >= 3 ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-500'}">3</span>
          <span class="{booking.modalStep === 3 ? 'text-white' : 'text-slate-500'}">Firma</span>
        </div>
        <i class="fa-solid fa-chevron-right text-[10px] text-slate-700"></i>
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black {booking.modalStep >= 4 ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'}">4</span>
          <span class="{booking.modalStep === 4 ? 'text-white' : 'text-slate-500'}">Voucher</span>
        </div>
      </div>

      <!-- Modal Body (Scrollable) -->
      <div class="p-6 overflow-y-auto flex-1 space-y-6">
        
        <!-- Error Alert if any -->
        {#if formError}
          <div class="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <i class="fa-solid fa-circle-exclamation text-red-400"></i>
            <span>{formError}</span>
          </div>
        {/if}

        <!-- ================= STEP 1: EXTRAS & COBERTURAS ================= -->
        {#if booking.modalStep === 1}
          <div class="space-y-6">
            
            <!-- Trip summary mini-bar -->
            <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div class="flex items-center gap-2">
                <i class="fa-solid fa-calendar-days text-orange-400"></i>
                <span class="text-slate-300">
                  {formatDatePretty(booking.pickupDate)} ➔ {formatDatePretty(booking.returnDate)}
                </span>
              </div>
              <div class="px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 font-bold">
                {booking.rentalDays} día{booking.rentalDays > 1 ? 's' : ''}
              </div>
            </div>

            <!-- Insurance options -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-300">
                Selecciona tu Nivel de Cobertura
              </h4>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <!-- Seguro Total (Recomendado) -->
                <button
                  type="button"
                  class="p-4 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer {booking.insuranceCoverage === 'total' ? 'bg-cyan-950/40 border-cyan-500 shadow-lg shadow-cyan-500/10' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}"
                  onclick={() => (booking.insuranceCoverage = 'total')}
                >
                  <div class="space-y-1.5">
                    <div class="flex items-center justify-between">
                      <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-cyan-500 text-slate-950">Recomendado</span>
                      <i class="fa-solid {booking.insuranceCoverage === 'total' ? 'fa-circle-check text-cyan-400' : 'fa-circle text-slate-700'}"></i>
                    </div>
                    <h5 class="font-heading font-black text-white text-base">Cobertura Total Cero Deducible</h5>
                    <p class="text-[11px] text-slate-400">Protección contra colisión, robo total y daños a terceros sin deducible. Reduce la garantía un 30%.</p>
                  </div>
                  <div class="mt-3 text-xs font-bold text-cyan-300">
                    + {formatCurrency(35000, booking.currency, booking.usdRate)} / día
                  </div>
                </button>

                <!-- Seguro Básico -->
                <button
                  type="button"
                  class="p-4 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer {booking.insuranceCoverage === 'basic' ? 'bg-slate-800/80 border-orange-500' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}"
                  onclick={() => (booking.insuranceCoverage = 'basic')}
                >
                  <div class="space-y-1.5">
                    <div class="flex items-center justify-between">
                      <span class="px-2 py-0.5 rounded text-[10px] font-semibold text-slate-400 bg-slate-800">Estándar</span>
                      <i class="fa-solid {booking.insuranceCoverage === 'basic' ? 'fa-circle-check text-orange-400' : 'fa-circle text-slate-700'}"></i>
                    </div>
                    <h5 class="font-heading font-bold text-white text-base">Seguro Básico Legal</h5>
                    <p class="text-[11px] text-slate-400">SOAT y responsabilidad civil incluidos. Aplica deducible de 20% en caso de siniestro.</p>
                  </div>
                  <div class="mt-3 text-xs font-bold text-emerald-400">
                    Incluido en la tarifa
                  </div>
                </button>
              </div>
            </div>

            <!-- Extras list -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-300">
                Adicionales para tu Comodidad
              </h4>

              <div class="space-y-2">
                <label class="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between cursor-pointer transition">
                  <div class="flex items-center gap-3">
                    <input type="checkbox" bind:checked={booking.extraBabySeat} class="w-4 h-4 rounded text-orange-500 focus:ring-orange-500 bg-slate-800 border-slate-700 cursor-pointer" />
                    <div>
                      <span class="text-xs font-bold text-white block">Silla de Bebé / Niño</span>
                      <span class="text-[11px] text-slate-400">Homologada para seguridad infantil</span>
                    </div>
                  </div>
                  <span class="text-xs font-bold text-slate-300">
                    +{formatCurrency(20000, booking.currency, booking.usdRate)}/día
                  </span>
                </label>

                <label class="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between cursor-pointer transition">
                  <div class="flex items-center gap-3">
                    <input type="checkbox" bind:checked={booking.extraSecondDriver} class="w-4 h-4 rounded text-orange-500 focus:ring-orange-500 bg-slate-800 border-slate-700 cursor-pointer" />
                    <div>
                      <span class="text-xs font-bold text-white block">Segundo Conductor Autorizado</span>
                      <span class="text-[11px] text-slate-400">Habilita a un acompañante con licencia</span>
                    </div>
                  </div>
                  <span class="text-xs font-bold text-slate-300">
                    +{formatCurrency(15000, booking.currency, booking.usdRate)}/día
                  </span>
                </label>

                <label class="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between cursor-pointer transition">
                  <div class="flex items-center gap-3">
                    <input type="checkbox" bind:checked={booking.extraFullTank} class="w-4 h-4 rounded text-orange-500 focus:ring-orange-500 bg-slate-800 border-slate-700 cursor-pointer" />
                    <div>
                      <span class="text-xs font-bold text-white block">Tanque Lleno Pre-pagado</span>
                      <span class="text-[11px] text-slate-400">Devuelve el auto sin preocuparte por tanquear</span>
                    </div>
                  </div>
                  <span class="text-xs font-bold text-slate-300">
                    +{formatCurrency(140000, booking.currency, booking.usdRate)} (Único)
                  </span>
                </label>
              </div>
            </div>

          </div>
        {/if}

        <!-- ================= STEP 2: DATOS DEL CONDUCTOR ================= -->
        {#if booking.modalStep === 2}
          <div class="space-y-4">
            
            <div class="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs flex items-center gap-2">
              <i class="fa-solid fa-id-card text-cyan-400"></i>
              <span>Ingresa los datos del conductor titular que retirará el vehículo en Cartagena.</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label for="d-names" class="text-xs font-bold text-slate-300">Nombres *</label>
                <input 
                  id="d-names"
                  type="text" 
                  bind:value={booking.driver.names} 
                  placeholder="Ej: Carlos Andrés"
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div class="space-y-1">
                <label for="d-lastnames" class="text-xs font-bold text-slate-300">Apellidos *</label>
                <input 
                  id="d-lastnames"
                  type="text" 
                  bind:value={booking.driver.lastnames} 
                  placeholder="Ej: Gómez Martínez"
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="space-y-1">
                <label for="d-doctype" class="text-xs font-bold text-slate-300">Tipo Doc. *</label>
                <select 
                  id="d-doctype"
                  bind:value={booking.driver.docType}
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none cursor-pointer"
                >
                  <option value="CC">Cédula Ciudadanía (CC)</option>
                  <option value="CE">Cédula Extranjería (CE)</option>
                  <option value="PASSPORT">Pasaporte</option>
                </select>
              </div>

              <div class="space-y-1 sm:col-span-2">
                <label for="d-docnum" class="text-xs font-bold text-slate-300">Número de Documento *</label>
                <input 
                  id="d-docnum"
                  type="text" 
                  bind:value={booking.driver.docNumber} 
                  placeholder="Ej: 1047458921"
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label for="d-phone" class="text-xs font-bold text-slate-300">WhatsApp / Celular *</label>
                <input 
                  id="d-phone"
                  type="tel" 
                  bind:value={booking.driver.phone} 
                  placeholder="+57 300 000 0000"
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div class="space-y-1">
                <label for="d-email" class="text-xs font-bold text-slate-300">Correo Electrónico *</label>
                <input 
                  id="d-email"
                  type="email" 
                  bind:value={booking.driver.email} 
                  placeholder="correo@ejemplo.com"
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label for="d-license" class="text-xs font-bold text-slate-300">N° Licencia de Conducción</label>
                <input 
                  id="d-license"
                  type="text" 
                  bind:value={booking.driver.license} 
                  placeholder="Ej: 13001-998822"
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div class="space-y-1">
                <label for="d-hotel" class="text-xs font-bold text-slate-300">Hotel / Alojamiento en Cartagena</label>
                <input 
                  id="d-hotel"
                  type="text" 
                  bind:value={booking.driver.hotel} 
                  placeholder="Ej: Hotel Almirante Bocagrande"
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>

          </div>
        {/if}

        <!-- ================= STEP 3: FIRMA DIGITAL ================= -->
        {#if booking.modalStep === 3}
          <div class="space-y-5">
            
            <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <div class="flex items-center justify-between font-bold text-white">
                <span>Resumen del Titular</span>
                <span class="text-orange-400">{booking.driver.names} {booking.driver.lastnames}</span>
              </div>
              <div class="text-[11px] text-slate-400">
                Documento: {booking.driver.docType} {booking.driver.docNumber} • Tel: {booking.driver.phone}
              </div>
            </div>

            <!-- Signature Canvas Component -->
            <SignatureCanvas />

            <!-- Legal Terms & Checkbox -->
            <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input 
                  type="checkbox" 
                  bind:checked={termsAccepted}
                  class="mt-0.5 w-4 h-4 rounded text-orange-500 focus:ring-orange-500 bg-slate-800 border-slate-700 cursor-pointer"
                />
                <span class="text-slate-300 text-[11px] leading-relaxed">
                  Declaro que la información suministrada es verídica, autorizo el tratamiento de datos personales conforme a la Ley 1581 de 2012 y entiendo que al retirar el vehículo en mostrador se requerirá presentar documento original, licencia vigente y tarjeta de crédito para el bloqueo de la garantía de <strong class="text-cyan-400">{formatCurrency(booking.depositAmount, booking.currency, booking.usdRate)}</strong>.
                </span>
              </label>
            </div>

          </div>
        {/if}

        <!-- ================= STEP 4: VOUCHER / CONFIRMACIÓN ================= -->
        {#if booking.modalStep === 4}
          <div class="space-y-6">
            
            <!-- Success Banner -->
            <div class="p-5 rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-emerald-950/60 border border-emerald-500/40 text-center space-y-2">
              <div class="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 text-2xl flex items-center justify-center mx-auto">
                <i class="fa-solid fa-check"></i>
              </div>
              <h4 class="font-heading font-black text-xl text-white">¡Pre-reserva Generada con Éxito!</h4>
              <p class="text-xs text-emerald-300/80">Código de Referencia: <span class="font-mono font-bold text-white">{booking.reservationId}</span></p>
            </div>

            <!-- Cost Breakdown Table -->
            <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <h5 class="font-bold text-white uppercase tracking-wider text-[11px] border-b border-slate-800 pb-2">
                Desglose de la Reserva
              </h5>

              <div class="flex justify-between text-slate-300">
                <span>Vehículo: {vehicle.name} ({booking.rentalDays} días)</span>
                <span class="font-semibold text-white">{formatCurrency(booking.baseVehicleTotal, booking.currency, booking.usdRate)}</span>
              </div>

              {#if booking.insuranceCoverage === 'total'}
                <div class="flex justify-between text-cyan-400">
                  <span>Cobertura Total Cero Deducible ({booking.rentalDays} días)</span>
                  <span class="font-semibold">{formatCurrency(booking.insuranceTotal, booking.currency, booking.usdRate)}</span>
                </div>
              {:else}
                <div class="flex justify-between text-slate-400">
                  <span>Seguro Básico Legal</span>
                  <span class="font-semibold text-emerald-400">Incluido</span>
                </div>
              {/if}

              {#if booking.extrasTotal > 0}
                <div class="flex justify-between text-amber-400">
                  <span>Adicionales seleccionados</span>
                  <span class="font-semibold">{formatCurrency(booking.extrasTotal, booking.currency, booking.usdRate)}</span>
                </div>
              {/if}

              <div class="pt-2 border-t border-slate-800 flex justify-between text-sm font-black">
                <span class="text-white">Total Estimado Alquiler:</span>
                <span class="text-orange-400 text-base">{formatCurrency(booking.grandTotal, booking.currency, booking.usdRate)}</span>
              </div>

              <div class="pt-2 border-t border-slate-800/60 flex justify-between text-[11px] text-slate-400">
                <span>Bloqueo de Garantía en Mostrador:</span>
                <span class="font-semibold text-cyan-300">{formatCurrency(booking.depositAmount, booking.currency, booking.usdRate)}</span>
              </div>
            </div>

            <!-- Signature preview thumbnail -->
            {#if booking.signatureDataUrl}
              <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <span class="text-slate-400">Firma Digital del Titular:</span>
                <img src={booking.signatureDataUrl} alt="Firma Conductor" class="h-8 max-w-[120px] object-contain invert opacity-80" />
              </div>
            {/if}

            <!-- CTAs -->
            <div class="space-y-3">
              <a 
                href={getWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                class="w-full py-3.5 px-4 rounded-xl font-heading font-black text-sm text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 text-center"
              >
                <i class="fa-brands fa-whatsapp text-lg"></i>
                <span>Enviar al Asesor de Mostrador por WhatsApp</span>
              </a>

              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={handlePrint}
                  class="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <i class="fa-solid fa-print"></i>
                  <span>Imprimir Voucher</span>
                </button>
                <button
                  type="button"
                  onclick={() => booking.closeModal()}
                  class="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <i class="fa-solid fa-check"></i>
                  <span>Finalizar</span>
                </button>
              </div>
            </div>

          </div>
        {/if}

      </div>

      <!-- Modal Footer (Navigation buttons) -->
      {#if booking.modalStep < 4}
        <div class="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
          {#if booking.modalStep > 1}
            <button
              type="button"
              onclick={prevStep}
              class="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            >
              <i class="fa-solid fa-chevron-left text-[10px]"></i>
              <span>Anterior</span>
            </button>
          {:else}
            <div></div>
          {/if}

          <!-- Live price total in footer -->
          <div class="text-right">
            <span class="text-[10px] text-slate-400 block">Total Estimado</span>
            <span class="font-heading font-black text-lg text-orange-400">
              {formatCurrency(booking.grandTotal, booking.currency, booking.usdRate)}
            </span>
          </div>

          <button
            type="button"
            onclick={nextStep}
            class="px-6 py-2.5 rounded-xl font-heading font-black text-xs uppercase tracking-wider text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition shadow-lg shadow-orange-500/20 active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <span>{booking.modalStep === 3 ? 'Confirmar y Firmar' : 'Continuar'}</span>
            <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </div>
      {/if}

    </div>
  </div>
{/if}
