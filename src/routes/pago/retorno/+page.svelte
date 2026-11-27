<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import {
        formatCurrency,
        formatDatePretty,
        formatDateTimePretty,
    } from "#lib/utils/formatters.js";
    import { whatsappLink, CONTACT_PHONES, OFFICE_ADDRESS_CITY } from "#lib/data/contact.js";
    import { FLEET_SECTION } from "#lib/data/sections.js";
    import { resolve } from "$app/paths";

    interface ReservationData {
        id: string;
        code: string;
        status: string;
        totalAmount: number;
        blockingAmount: number;
        baseAmount: number;
        insuranceAmount: number;
        extrasAmount: number;
        days: number;
        insurancePlan: string;
        pickupDate: string;
        returnDate: string;
        pickupLocation: string;
        customerName: string;
        customerLastname: string;
        pickupTime?: string;
        returnTime?: string;
        synced: boolean;
        desktopRef: string | null;
        createdAt?: string;
        updatedAt?: string;
        vehicle: {
            name: string;
            plate: string | null;
            image: string;
        };
        // Vista pública: sin token de tarjeta ni ids internos de la pasarela.
        payment: {
            status: string;
            transactionId?: string | null;
            p2pSessionStatus: string | null;
            cardBrand: string;
            cardLast4: string;
            amount: number;
            tokenStatus?: string | null;
            createdAt?: string;
            updatedAt?: string;
        } | null;
    }

    let reservation = $state<ReservationData | null>(null);
    let loading = $state<boolean>(true);
    let error = $state<string | null>(null);
    let syncing = $state<boolean>(false);
    let syncedNow = $state<boolean>(false);
    let copiedCode = $state<boolean>(false);

    /** Copia el código de reserva: es lo que el cliente pega en WhatsApp o dicta en mostrador. */
    async function copyReservationCode() {
        if (!reservation) return;
        try {
            await navigator.clipboard.writeText(reservation.code);
        } catch {
            // Fallback para navegadores sin Clipboard API o contexto no seguro.
            const aux = document.createElement("textarea");
            aux.value = reservation.code;
            aux.style.position = "fixed";
            aux.style.opacity = "0";
            document.body.appendChild(aux);
            aux.select();
            document.execCommand("copy");
            aux.remove();
        }
        copiedCode = true;
        setTimeout(() => (copiedCode = false), 2000);
    }

    // Parámetros que envía la pasarela al regresar o el panel administrativo.
    // Se leen durante el render del componente, no en un `$derived`: tras un HMR
    // el `$derived` se reevalúa fuera del contexto de la petición y SvelteKit 3
    // lanza `state_read_outside_render`.
    const returnParams = page.url.searchParams;
    const reference = returnParams.get("reference") || "";
    const requestId = returnParams.get("requestId") || "";

    // Fecha y hora reales de la transacción: instante en que la pasarela resolvió el pago
    // (webhook / sonda) y no el momento en que el usuario abre esta pantalla.
    let transactionDate = $derived(
        reservation?.payment?.updatedAt ||
            reservation?.updatedAt ||
            reservation?.createdAt ||
            "",
    );

    // Comprobante imprimible: solo se emite cuando el pago está aprobado.
    let printable = $derived(
        !!reservation &&
            (reservation.status === "PAGADA" ||
                reservation.payment?.status === "APROBADO"),
    );
    let subtotal = $derived(
        reservation
            ? reservation.baseAmount +
                  reservation.insuranceAmount +
                  reservation.extrasAmount
            : 0,
    );
    let rejected = $derived(
        !!reservation?.payment &&
            (reservation.payment.status === "RECHAZADO" ||
                reservation.payment.p2pSessionStatus === "REJECTED"),
    );
    let insuranceLabel = $derived(
        reservation?.insurancePlan === "TOTAL"
            ? "Cobertura Total Cero Deducible"
            : "Seguro Básico Legal",
    );

    async function loadReservation() {
        loading = true;
        error = null;
        try {
            // Busca por reference (código de reserva) o por requestId de PlacetoPay
            const queryParam = reference
                ? `code=${encodeURIComponent(reference)}`
                : requestId
                  ? `requestId=${encodeURIComponent(requestId)}`
                  : "";

            if (!queryParam) {
                error = "No se recibió la referencia de la reserva.";
                return;
            }
            const res = await fetch(`/api/reservations?${queryParam}`);
            const data = await res.json();
            if (!data?.ok || !data.reservations?.length) {
                error =
                    "No se encontró la reserva. Verifica el enlace o contacta al asesor.";
                return;
            }
            reservation = data.reservations[0];
            // NOTA (Certificación Evertec): La página de retorno NO consume la API de PlacetoPay.
            // La actualización del estado la realiza exclusivamente la URL de Notificación (Webhook)
            // o la Sonda/Cronjob de contingencia en el servidor.
        } catch (e) {
            error = (e as Error).message;
        } finally {
            loading = false;
        }
    }

    async function syncWithDesktop() {
        if (!reservation) return;
        syncing = true;
        try {
            const res = await fetch("/api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity: "RESERVATION",
                    entityId: reservation.id,
                }),
            });
            const data = await res.json();
            if (data?.ok) {
                syncedNow = true;
                if (reservation) {
                    reservation.synced = true;
                    reservation.desktopRef = data.desktopRef || null;
                }
            }
        } finally {
            syncing = false;
        }
    }

    function getWhatsAppUrl(): string {
        if (!reservation) return "";
        const text =
            `*SOLICITUD DE RESERVA — DINAMO RENT A CAR*%0A` +
            `📌 *Código:* ${reservation.code}%0A` +
            `🚗 *Vehículo:* ${reservation.vehicle.name} (${reservation.vehicle.plate || "N/A"})%0A` +
            `🗓 *Entrega:* ${formatDatePretty(reservation.pickupDate)}%0A` +
            `🗓 *Devolución:* ${formatDatePretty(reservation.returnDate)}%0A` +
            `⏱ *Duración:* ${reservation.days} día(s)%0A` +
            `👤 *Conductor:* ${reservation.customerName} ${reservation.customerLastname}%0A` +
            `💰 *Total Pagado:* ${formatCurrency(reservation.totalAmount, "COP")}%0A` +
            `✅ *Estado:* PAGADA (confirmado online)%0A%0A` +
            `_He completado el check-in digital, firmado y pagado. Deseo recoger el vehículo en mostrador._`;
        return whatsappLink(text);
    }

    onMount(loadReservation);
</script>

<svelte:head>
    <title>Comprobante de Reserva — Dinamo Rent a Car</title>
</svelte:head>

<section class="min-h-[80vh] py-12 sm:py-16 bg-slate-950 print:bg-white print:py-0">
    <div class="max-w-2xl mx-auto px-4 sm:px-6 no-print">
        {#if loading}
            <div class="text-center space-y-4 py-16">
                <i
                    class="fa-solid fa-circle-notch fa-spin text-5xl text-orange-400"
                ></i>
                <h2 class="font-heading font-black text-xl text-white">
                    Verificando tu pago...
                </h2>
                <p class="text-sm text-slate-400">
                    Estamos confirmando la transacción con la pasarela. Esto
                    tomará unos segundos.
                </p>
            </div>
        {:else if error}
            <div class="text-center space-y-4 py-16">
                <div
                    class="w-16 h-16 rounded-full bg-red-500/20 text-red-400 text-3xl flex items-center justify-center mx-auto"
                >
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <h2 class="font-heading font-black text-xl text-white">
                    No pudimos verificar el pago
                </h2>
                <p class="text-sm text-slate-400 max-w-md mx-auto">{error}</p>
                <a
                    href={resolve(FLEET_SECTION.href)}
                    class="inline-block px-6 py-3 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
                >
                    Volver al inicio
                </a>
            </div>
        {:else if reservation}
            {@const isPaid =
                reservation.status === "PAGADA" ||
                reservation.payment?.status === "APROBADO"}
            {@const isRejected =
                reservation.payment?.status === "RECHAZADO" ||
                reservation.payment?.p2pSessionStatus === "REJECTED"}

            <!-- Header de estado -->
            <div
                class="rounded-3xl p-6 text-center space-y-3 mb-6 {isPaid
                    ? 'bg-linear-to-r from-emerald-950/60 via-slate-900 to-emerald-950/60 border border-emerald-500/40'
                    : isRejected
                      ? 'bg-linear-to-r from-red-950/60 via-slate-900 to-red-950/60 border border-red-500/40'
                      : 'bg-slate-900 border border-slate-700'}"
            >
                <div
                    class="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl {isPaid
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : isRejected
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-amber-500/20 text-amber-400'}"
                >
                    <i
                        class="fa-solid {isPaid
                            ? 'fa-check'
                            : isRejected
                              ? 'fa-xmark'
                              : 'fa-clock'}"
                    ></i>
                </div>
                <h1 class="font-heading font-black text-2xl text-white">
                    {#if isPaid}¡Reserva Confirmada y Pagada!{:else if isRejected}Pago
                        Rechazado{:else}Pago en Proceso (Pendiente){/if}
                </h1>
                <div class="space-y-1 text-sm text-slate-300">
                    <p>
                        Referencia de Pago: <span
                            class="font-mono font-bold text-orange-400"
                            >{reservation.code}</span
                        >
                    </p>
                    <p class="text-xs text-slate-400">
                        Fecha y hora de la transacción: <span class="text-white font-medium">{formatDateTimePretty(transactionDate)}</span> • Moneda: <span class="text-white font-semibold">COP (Pesos Colombianos)</span>
                    </p>
                    {#if reservation.payment?.transactionId}
                        <p class="text-xs text-slate-400">
                            Autorización / CUS: <span class="font-mono text-cyan-300">{reservation.payment.transactionId}</span>
                        </p>
                    {/if}
                </div>
            </div>

            {#if isPaid}
                <!-- Desglose completo -->
                <div
                    class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs mb-6"
                >
                    <h3
                        class="font-bold text-white uppercase tracking-wider text-[11px] border-b border-slate-800 pb-2"
                    >
                        Desglose de la Reserva
                    </h3>
                    <div class="flex justify-between text-slate-300">
                        <span
                            >Vehículo: {reservation.vehicle.name} ({reservation.days}
                            días)</span
                        >
                        <span class="font-semibold text-white"
                            >{formatCurrency(
                                reservation.baseAmount,
                                "COP",
                            )}</span
                        >
                    </div>
                    <div
                        class="flex justify-between {reservation.insurancePlan ===
                        'TOTAL'
                            ? 'text-cyan-400'
                            : 'text-slate-400'}"
                    >
                        <span>{insuranceLabel}</span>
                        <span class="font-semibold"
                            >{reservation.insuranceAmount > 0
                                ? formatCurrency(
                                      reservation.insuranceAmount,
                                      "COP",
                                  )
                                : "Incluido"}</span
                        >
                    </div>
                    {#if reservation.extrasAmount > 0}
                        <div class="flex justify-between text-amber-400">
                            <span>Adicionales</span>
                            <span class="font-semibold"
                                >{formatCurrency(
                                    reservation.extrasAmount,
                                    "COP",
                                )}</span
                            >
                        </div>
                    {/if}
                    <div class="flex justify-between text-[11px] text-slate-400">
                        <span>Subtotal (sin IVA)</span>
                        <span class="font-semibold text-slate-200"
                            >{formatCurrency(subtotal, "COP")}</span
                        >
                    </div>
                    <div class="flex justify-between text-[11px] text-slate-400">
                        <span>IVA 19%</span>
                        <span class="font-semibold text-slate-200"
                            >{formatCurrency(
                                reservation.totalAmount - subtotal,
                                "COP",
                            )}</span
                        >
                    </div>
                    <div
                        class="pt-2 border-t border-slate-800 flex justify-between text-sm font-black"
                    >
                        <span class="text-white">Total Pagado (IVA incluido):</span>
                        <span class="text-emerald-400 text-base"
                            >{formatCurrency(
                                reservation.totalAmount,
                                "COP",
                            )}</span
                        >
                    </div>
                    <div
                        class="pt-2 border-t border-slate-800/60 flex justify-between text-[11px] text-slate-400"
                    >
                        <span>Depósito / Garantía:</span>
                        <span class="font-semibold text-cyan-300">Según contrato de alquiler</span>
                    </div>
                </div>

                <!-- Info de tarjeta usada y garantía tokenizada -->
                {#if reservation.payment?.cardBrand}
                    <div
                        class="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs mb-6"
                    >
                        <div class="flex items-center justify-between">
                            <span class="text-slate-400">Método de pago del canon:</span>
                            <span class="font-semibold text-white"
                                >{reservation.payment.cardBrand} •••• {reservation.payment.cardLast4}</span
                            >
                        </div>
                        {#if reservation.payment.tokenStatus === 'ACTIVO'}
                            <div class="pt-2 border-t border-slate-800 flex items-center justify-between">
                                <span class="text-slate-400 flex items-center gap-1.5">
                                    <i class="fa-solid fa-shield-halved text-emerald-400"></i>
                                    Depósito de Garantía:
                                </span>
                                <span class="font-semibold text-emerald-400">Tarjeta Vinculada (Suscripción Segura)</span>
                            </div>
                            <p class="text-[11px] text-slate-400 leading-relaxed">
                                Tu tarjeta ha sido registrada de forma segura mediante Evertec Place to Pay como respaldo del depósito y deducibles del vehículo según lo estipulado en el contrato. No se ha descontado ni congelado cupo anticipadamente.
                            </p>
                            <p class="text-[11px] text-slate-400 leading-relaxed">
                                <i class="fa-solid fa-circle-info text-cyan-400 mr-1"></i>
                                La tarjeta <strong class="text-slate-200">queda almacenada</strong> como token de pago (franquicia y últimos 4 dígitos) para los cobros justificados del contrato. No guardamos el número completo, el código de seguridad ni la fecha de vencimiento.
                            </p>
                        {/if}
                    </div>
                {/if}

                <!-- Sincronización con mostrador -->
                <div
                    class="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-3 mb-6"
                >
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <i
                                class="fa-solid fa-rotate {syncedNow ||
                                reservation.synced
                                    ? 'text-emerald-400'
                                    : 'text-orange-400'} {syncing
                                    ? 'fa-spin'
                                    : ''}"
                            ></i>
                            <span class="text-sm font-bold text-white">
                                {syncedNow || reservation.synced
                                    ? "Sincronizado con mostrador"
                                    : "Sincronizar con la app de escritorio"}
                            </span>
                        </div>
                        {#if syncedNow || reservation.synced}
                            <span
                                class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300"
                                >LISTO</span
                            >
                        {:else}
                            <button
                                type="button"
                                onclick={syncWithDesktop}
                                disabled={syncing}
                                class="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-orange-500/50 text-orange-300 hover:bg-orange-500/10 transition cursor-pointer disabled:opacity-50"
                            >
                                Sincronizar ahora
                            </button>
                        {/if}
                    </div>
                    <p class="text-[11px] text-slate-400 leading-relaxed">
                        {#if (syncedNow || reservation.synced) && reservation.desktopRef}
                            La reserva <span class="font-mono text-white"
                                >{reservation.code}</span
                            >
                            ya está disponible en la app de mostrador. Ref:
                            <span class="font-mono text-white"
                                >{reservation.desktopRef}</span
                            >
                        {:else}
                            Al sincronizar, la reserva aparecerá en la app de
                            escritorio del mostrador para que el asistente la
                            convierta en una renta al entregar el vehículo.
                        {/if}
                    </p>
                </div>

                <!-- Qué sigue: código copiable y próximos pasos -->
                <div
                    class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 mb-6"
                >
                    <h3
                        class="font-bold text-white uppercase tracking-wider text-[11px] border-b border-slate-800 pb-2"
                    >
                        Código y próximos pasos
                    </h3>
                    <div class="flex items-center justify-between gap-3 flex-wrap">
                        <span class="font-mono font-black text-lg text-white tracking-wide"
                            >{reservation.code}</span
                        >
                        <button
                            type="button"
                            onclick={copyReservationCode}
                            aria-label={`Copiar el código de reserva ${reservation.code}`}
                            class="px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer {copiedCode
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'}"
                        >
                            <i
                                class="fa-solid {copiedCode
                                    ? 'fa-check'
                                    : 'fa-copy'}"
                            ></i>
                            <span>{copiedCode ? "Copiado" : "Copiar código"}</span>
                        </button>
                    </div>

                    <ol class="space-y-2.5">
                        <li class="flex items-start gap-3">
                            <span
                                class="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0"
                            >
                                <i class="fa-solid fa-check text-[10px]"></i>
                            </span>
                            <div>
                                <p class="text-xs font-bold text-white">Pago confirmado</p>
                                <p class="text-[11px] text-slate-400">
                                    Ya recibimos el pago del canon del alquiler.
                                </p>
                            </div>
                        </li>
                        <li class="flex items-start gap-3">
                            <span
                                class="w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-[10px] font-black flex items-center justify-center shrink-0"
                                >2</span
                            >
                            <div>
                                <p class="text-xs font-bold text-white">Guarda tu comprobante</p>
                                <p class="text-[11px] text-slate-400">
                                    Puedes imprimirlo con «Imprimir Comprobante» o enviar los
                                    datos de tu reserva a tu asesor por WhatsApp.
                                </p>
                            </div>
                        </li>
                        <li class="flex items-start gap-3">
                            <span
                                class="w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-[10px] font-black flex items-center justify-center shrink-0"
                                >3</span
                            >
                            <div>
                                <p class="text-xs font-bold text-white">
                                    Preséntate en la oficina
                                </p>
                                <p class="text-[11px] text-slate-400">
                                    Con tu cédula y licencia de conducción en
                                    {OFFICE_ADDRESS_CITY}. Nuestro equipo te entrega el vehículo.
                                </p>
                            </div>
                        </li>
                    </ol>
                </div>

                <!-- Botones de acción -->
                <div class="space-y-3">
                    <a
                        href={getWhatsAppUrl()}
                        target="_blank"
                        rel="noopener noreferrer external"
                        class="w-full py-3.5 px-4 rounded-xl font-heading font-black text-sm text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 text-center"
                    >
                        <i class="fa-brands fa-whatsapp text-lg"></i>
                        <span>Enviar al Asesor de Mostrador por WhatsApp</span>
                    </a>
                    <div class="flex gap-2">
                        <button
                            type="button"
                            onclick={() => window.print()}
                            class="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                            <i class="fa-solid fa-print"></i>
                            <span>Imprimir Comprobante</span>
                        </button>
                        <a
                            href={resolve(FLEET_SECTION.href)}
                            class="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5"
                        >
                            <i class="fa-solid fa-house"></i>
                            <span>Volver al Inicio</span>
                        </a>
                    </div>
                </div>
            {:else if isRejected}
                <div
                    class="p-5 rounded-2xl bg-slate-900 border border-red-500/30 space-y-3 mb-6"
                >
                    <p class="text-sm text-slate-300">
                        Tu pago fue rechazado por la entidad financiera.
                    </p>
                    <p class="text-xs text-slate-400">
                        La reserva <span class="font-mono text-white"
                            >{reservation.code}</span
                        > sigue activa. Puedes intentar pagar de nuevo con otra tarjeta.
                    </p>
                </div>
                <a
                    href={resolve(FLEET_SECTION.href)}
                    class="block w-full py-3.5 px-4 rounded-xl font-heading font-black text-sm text-white bg-linear-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition text-center"
                >
                    <i class="fa-solid fa-arrow-left mr-2"></i>Volver e intentar
                    de nuevo
                </a>
            {:else}
                <!-- Pendiente: Mensaje informativo exigido por Certificación Evertec WC (Sección 6.3.3) -->
                <div
                    class="p-5 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-3 mb-6"
                >
                    <div class="flex items-start gap-3">
                        <i class="fa-solid fa-clock-rotate-left text-amber-400 text-lg mt-0.5"></i>
                        <div class="space-y-1">
                            <h4 class="font-bold text-white text-sm">Transacción en Estado Pendiente</h4>
                            <p class="text-xs text-slate-300 leading-relaxed">
                                En este momento tu pedido con referencia <strong class="text-orange-400 font-mono">#{reservation.code}</strong> y valor de <strong class="text-emerald-400">{formatCurrency(reservation.totalAmount, "COP")}</strong> se encuentra en un estado de <strong>PENDIENTE</strong>.
                            </p>
                            <p class="text-[11px] text-slate-400 leading-relaxed pt-1">
                                De no recibir confirmación inmediata por parte de tu entidad financiera, por favor espera unos minutos y vuelve a consultar para verificar si tu pago fue confirmado de forma exitosa.
                            </p>
                        </div>
                    </div>

                    <div class="pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                        <p>Si deseas más información sobre el estado actual de tu operación puedes comunicarte a nuestras líneas de atención al cliente <a href="tel:+573004567890" class="text-cyan-400 font-semibold hover:underline">(+57) 300 456 7890</a> o escribirnos a <a href="mailto:reservas@dinamorentacar.com" class="text-cyan-400 font-semibold hover:underline">reservas@dinamorentacar.com</a> indicando tu código de referencia o autorización.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onclick={loadReservation}
                    class="block w-full py-3.5 px-4 rounded-xl font-heading font-black text-sm text-white bg-slate-800 hover:bg-slate-700 transition text-center cursor-pointer"
                >
                    <i class="fa-solid fa-rotate-right mr-2"></i>Verificar
                    estado nuevamente
                </button>
            {/if}
        {/if}
    </div>

    <!-- Comprobante imprimible: único contenido que sale en papel (Ctrl/Cmd + P) -->
    {#if reservation}
        {@const paid = reservation.payment}
        <article
            class="print-only mx-auto max-w-3xl text-slate-900 text-[11px] leading-snug"
        >
            {@render receiptHeader(
                printable
                    ? "Comprobante de reserva"
                    : rejected
                      ? "Comprobante de intento de pago"
                      : "Comprobante de solicitud de reserva",
                printable
                    ? reservation.status
                    : rejected
                      ? "RECHAZADO"
                      : "PENDIENTE",
            )}
            {@render receiptTrip(reservation)}
            {@render receiptAmounts(
                reservation,
                printable
                    ? "Total pagado (IVA incluido)"
                    : "Total (IVA incluido)",
            )}

            {#if printable}
                {#if paid}
                    <div class="mt-3 grid grid-cols-2 gap-8">
                        <p>
                            <span class="text-slate-500">Medio de pago:</span>
                            {paid.cardBrand} •••• {paid.cardLast4}
                        </p>
                        {#if paid.transactionId}
                            <p>
                                <span class="text-slate-500">Autorización / CUS:</span>
                                <span class="font-mono">{paid.transactionId}</span>
                            </p>
                        {/if}
                    </div>
                {/if}
                <p class="mt-4 border border-slate-300 bg-slate-50 px-2.5 py-2">
                    El depósito de garantía se rige por el contrato de alquiler y
                    no se cobra al reservar. Presenta este comprobante al recibir
                    el vehículo.
                </p>
            {:else}
                <p class="mt-4 border border-slate-300 bg-slate-50 px-2.5 py-2">
                    {#if rejected}
                        El pago del total fue rechazado por la entidad financiera y
                        no se realizó ningún cobro. La reserva sigue activa: puede
                        pagarse de nuevo con otra tarjeta desde el sitio web. Este
                        documento no acredita pago.
                    {:else}
                        El pago del total se encuentra pendiente de confirmación por
                        la entidad financiera. Este documento acredita únicamente la
                        solicitud de reserva, no el pago: verifica el estado antes de
                        presentarte o comunícate con la central de reservas.
                    {/if}
                </p>
            {/if}

            <footer
                class="mt-5 pt-3 border-t border-slate-300 text-[10px] text-slate-600 flex items-start justify-between gap-6"
            >
                <p>
                    {printable
                        ? "Comprobante informativo de la reserva y su pago en línea. No constituye factura de venta."
                        : "Documento informativo del estado de la reserva. No constituye factura de venta ni comprobante de pago."}
                </p>
                <p class="text-right shrink-0">
                    Dinamo Rent a Car · Cartagena de Indias
                </p>
            </footer>
        </article>
    {:else if error}
        <!-- Error de consulta: solo un aviso, nunca la interfaz del sitio -->
        <article
            class="print-only mx-auto max-w-3xl text-slate-900 text-[11px] leading-snug"
        >
            {@render receiptHeader("Consulta de reserva", "no verificada")}
            <p class="mt-6 text-sm font-bold">
                No fue posible verificar la reserva en este intento.
            </p>
            <p class="mt-1">{error}</p>
            {#if reference || requestId}
                <p class="mt-1">
                    <span class="text-slate-500">Referencia consultada:</span>
                    <span class="font-mono">{reference || requestId}</span>
                </p>
            {/if}
            <p class="mt-3">
                Comunícate con la central de reservas: {CONTACT_PHONES.join(
                    " · ",
                )} · reservas@dinamorent.com
            </p>
        </article>
    {/if}
</section>

{#snippet receiptHeader(titulo: string, estado: string)}
    <header
        class="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4"
    >
        <div>
            <p class="font-heading font-black text-base leading-tight">
                DINAMO RENT A CAR S.A.S.
            </p>
            <p>NIT 900694866-3</p>
            <p>{OFFICE_ADDRESS_CITY}, Colombia</p>
            <p>Tel. {CONTACT_PHONES.join(" · ")}</p>
            <p>reservas@dinamorent.com</p>
        </div>
        <div class="text-right">
            <p class="font-heading font-black text-base uppercase">{titulo}</p>
            {#if reservation}
                <p class="mt-1">
                    No. <span class="font-mono font-bold">{reservation.code}</span>
                </p>
                <p>Emitido: {formatDateTimePretty(transactionDate)}</p>
            {/if}
            <p class="mt-1 font-bold uppercase">Estado: {estado}</p>
        </div>
    </header>
{/snippet}

{#snippet receiptTrip(r: ReservationData)}
    <div class="grid grid-cols-2 gap-8 pt-4">
        <div class="space-y-0.5">
            <h3
                class="font-heading font-bold uppercase border-b border-slate-300 pb-1 mb-2"
            >
                Conductor
            </h3>
            <p>
                <span class="text-slate-500">Nombre:</span>
                {r.customerName} {r.customerLastname}
            </p>
        </div>
        <div class="space-y-0.5">
            <h3
                class="font-heading font-bold uppercase border-b border-slate-300 pb-1 mb-2"
            >
                Vehículo y entrega
            </h3>
            <p>
                <span class="text-slate-500">Vehículo:</span> {r.vehicle.name}{#if r.vehicle.plate}<span
                        > · Placa {r.vehicle.plate}</span
                    >{/if}
            </p>
            <p>
                <span class="text-slate-500">Entrega:</span>
                {formatDatePretty(r.pickupDate)}{#if r.pickupTime}<span
                        > · {r.pickupTime}</span
                    >{/if}
            </p>
            <p>
                <span class="text-slate-500">Devolución:</span>
                {formatDatePretty(r.returnDate)}{#if r.returnTime}<span
                        > · {r.returnTime}</span
                    >{/if}
            </p>
            <p>
                <span class="text-slate-500">Duración:</span>
                {r.days} día(s)
            </p>
            <p>
                <span class="text-slate-500">Lugar:</span> {r.pickupLocation}
            </p>
        </div>
    </div>
{/snippet}

{#snippet receiptAmounts(r: ReservationData, totalLabel: string)}
    <table class="w-full mt-5 border-collapse">
        <thead>
            <tr class="border-b border-slate-900 text-left">
                <th class="py-1.5 font-heading uppercase">Concepto</th>
                <th class="py-1.5 text-right font-heading uppercase">
                    Valor (COP)
                </th>
            </tr>
        </thead>
        <tbody>
            <tr class="border-b border-slate-200">
                <td class="py-1.5">
                    Alquiler {r.vehicle.name} — {r.days} día(s)
                </td>
                <td class="py-1.5 text-right">
                    {formatCurrency(r.baseAmount, "COP")}
                </td>
            </tr>
            <tr class="border-b border-slate-200">
                <td class="py-1.5">{insuranceLabel}</td>
                <td class="py-1.5 text-right">
                    {r.insuranceAmount > 0
                        ? formatCurrency(r.insuranceAmount, "COP")
                        : "Incluido"}
                </td>
            </tr>
            {#if r.extrasAmount > 0}
                <tr class="border-b border-slate-200">
                    <td class="py-1.5">Adicionales</td>
                    <td class="py-1.5 text-right">
                        {formatCurrency(r.extrasAmount, "COP")}
                    </td>
                </tr>
            {/if}
            <tr class="border-b border-slate-200">
                <td class="py-1.5">Subtotal (sin IVA)</td>
                <td class="py-1.5 text-right">
                    {formatCurrency(subtotal, "COP")}
                </td>
            </tr>
            <tr class="border-b border-slate-200">
                <td class="py-1.5">IVA 19%</td>
                <td class="py-1.5 text-right">
                    {formatCurrency(r.totalAmount - subtotal, "COP")}
                </td>
            </tr>
            <tr class="border-b-2 border-slate-900 font-bold">
                <td class="py-2">{totalLabel}</td>
                <td class="py-2 text-right">
                    {formatCurrency(r.totalAmount, "COP")}
                </td>
            </tr>
        </tbody>
    </table>
{/snippet}
