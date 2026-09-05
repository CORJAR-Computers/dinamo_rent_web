<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import { formatCurrency, formatDatePretty } from "$lib/utils/formatters";

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
        customerPhone: string;
        synced: boolean;
        desktopRef: string | null;
        vehicle: {
            name: string;
            plate: string | null;
            image: string;
        };
        payment: {
            status: string;
            p2pRequestId?: string | null;
            p2pOpType: string | null;
            p2pSessionStatus: string | null;
            p2pStatusMessage: string | null;
            cardBrand: string;
            cardLast4: string;
            amount: number;
        } | null;
    }

    let reservation = $state<ReservationData | null>(null);
    let loading = $state<boolean>(true);
    let error = $state<string | null>(null);
    let syncing = $state<boolean>(false);
    let syncedNow = $state<boolean>(false);

    // Lee los parámetros que envía la pasarela al regresar
    let requestId = $derived(page.url.searchParams.get("requestId") || "");
    let reference = $derived(page.url.searchParams.get("reference") || "");

    async function loadReservation() {
        loading = true;
        error = null;
        try {
            // Usa el code (reference) para obtener la reserva completa
            const code = reference || "";
            if (!code) {
                error = "No se recibió la referencia de la reserva.";
                return;
            }
            const res = await fetch(
                `/api/reservations?code=${encodeURIComponent(code)}`,
            );
            const data = await res.json();
            if (!data?.ok || !data.reservations?.length) {
                error =
                    "No se encontró la reserva. Verifica el enlace o contacta al asesor.";
                return;
            }
            reservation = data.reservations[0];

            // Si el pago sigue pendiente, fuerza una consulta en vivo a la pasarela
            if (
                reservation &&
                reservation.payment?.p2pSessionStatus === "PENDING" &&
                reservation.payment?.p2pRequestId
            ) {
                await refreshFromGateway();
            }
        } catch (e) {
            error = (e as Error).message;
        } finally {
            loading = false;
        }
    }

    async function refreshFromGateway() {
        if (!reservation) return;
        try {
            const res = await fetch(
                `/api/payments/status?reservationId=${reservation.id}`,
            );
            const data = await res.json();
            if (data?.ok && data.live) {
                // Recarga la reserva para reflejar el estado actualizado
                await loadReservation();
            }
        } catch {
            // silencioso — ya tenemos los datos base
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
            `📱 *WhatsApp:* ${reservation.customerPhone}%0A` +
            `💰 *Total Pagado:* ${formatCurrency(reservation.totalAmount, "COP")}%0A` +
            `✅ *Estado:* PAGADA (confirmado online)%0A%0A` +
            `_He completado el check-in digital, firmado y pagado. Deseo recoger el vehículo en mostrador._`;
        return `https://wa.me/573000000000?text=${text}`;
    }

    onMount(loadReservation);
</script>

<svelte:head>
    <title>Comprobante de Reserva — Dinamo Rent a Car</title>
</svelte:head>

<section class="min-h-[80vh] py-12 sm:py-16 bg-slate-950">
    <div class="max-w-2xl mx-auto px-4 sm:px-6">
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
                    href="/#flota"
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
            {@const isPending = !isPaid && !isRejected}

            <!-- Header de estado -->
            <div
                class="rounded-3xl p-6 text-center space-y-3 mb-6 {isPaid
                    ? 'bg-gradient-to-r from-emerald-950/60 via-slate-900 to-emerald-950/60 border border-emerald-500/40'
                    : isRejected
                      ? 'bg-gradient-to-r from-red-950/60 via-slate-900 to-red-950/60 border border-red-500/40'
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
                        Rechazado{:else}Pago en Proceso{/if}
                </h1>
                <p class="text-sm text-slate-300">
                    Código de Reserva: <span
                        class="font-mono font-bold text-orange-400"
                        >{reservation.code}</span
                    >
                </p>
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
                        <span
                            >{reservation.insurancePlan === "TOTAL"
                                ? "Cobertura Total Cero Deducible"
                                : "Seguro Básico Legal"}</span
                        >
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
                    <div
                        class="pt-2 border-t border-slate-800 flex justify-between text-sm font-black"
                    >
                        <span class="text-white">Total Pagado:</span>
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
                        <span>Bloqueo de Garantía en Mostrador:</span>
                        <span class="font-semibold text-cyan-300"
                            >{formatCurrency(
                                reservation.blockingAmount,
                                "COP",
                            )}</span
                        >
                    </div>
                </div>

                <!-- Info de tarjeta usada -->
                {#if reservation.payment?.cardBrand}
                    <div
                        class="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs mb-6"
                    >
                        <span class="text-slate-400">Pagado con:</span>
                        <span class="font-semibold text-white"
                            >{reservation.payment.cardBrand} •••• {reservation
                                .payment.cardLast4}</span
                        >
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

                <!-- Botones de acción -->
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
                            onclick={() => window.print()}
                            class="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                            <i class="fa-solid fa-print"></i>
                            <span>Imprimir Comprobante</span>
                        </button>
                        <a
                            href="/#flota"
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
                        Tu pago fue rechazado por la entidad financiera. {reservation
                            .payment?.p2pStatusMessage || ""}
                    </p>
                    <p class="text-xs text-slate-400">
                        La reserva <span class="font-mono text-white"
                            >{reservation.code}</span
                        > sigue activa. Puedes intentar pagar de nuevo con otra tarjeta.
                    </p>
                </div>
                <a
                    href="/#flota"
                    class="block w-full py-3.5 px-4 rounded-xl font-heading font-black text-sm text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition text-center"
                >
                    <i class="fa-solid fa-arrow-left mr-2"></i>Volver e intentar
                    de nuevo
                </a>
            {:else}
                <!-- Pendiente -->
                <div
                    class="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 space-y-3 mb-6"
                >
                    <p class="text-sm text-slate-300">
                        Tu pago está siendo procesado por la entidad financiera.
                        Esto puede tardar unos minutos.
                    </p>
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
</section>
