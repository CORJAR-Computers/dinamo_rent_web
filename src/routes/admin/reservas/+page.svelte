<script lang="ts">
	import { resolve } from '$app/paths';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { isTokenExpired } from '#lib/utils/tokenValidity.js';

	interface ReservationItem {
		id: string;
		code: string;
		status: string;
		totalAmount: number;
		baseAmount: number;
		insuranceAmount: number;
		extrasAmount: number;
		blockingAmount: number;
		days: number;
		pickupDate: string;
		returnDate: string;
		pickupTime: string;
		returnTime: string;
		pickupLocation: string;
		returnLocation: string;
		insurancePlan: string;
		synced: boolean;
		desktopRef: string | null;
		createdAt: string;
		customerName: string;
		customerEmail: string;
		customerPhone: string;
		customerIdNumber: string;
		customer: {
			id: string;
			docNumber: string;
			fullName: string;
			phone: string;
			email: string;
			desktopId: number | null;
		} | null;
		vehicle: {
			id: string;
			name: string;
			category: string;
			plate: string | null;
			image: string;
		};
		payment?: {
			id: string;
			status: string;
			amount: number;
			transactionId: string | null;
			cardBrand: string | null;
			cardLast4: string | null;
			p2pRequestId: string | null;
			p2pStatusMessage?: string | null;
			createdAt: string;
			token?: string | null;
			tokenStatus?: string | null;
			tokenValidUntil?: string | null;
			tokenFranchise?: string | null;
		} | null;
		depositCharges?: Array<{
			id: string;
			amount: number;
			concept: string;
			description: string | null;
			status: string;
			transactionId: string | null;
			p2pStatusMessage?: string | null;
			executedBy?: string | null;
			createdAt: string;
		}>;
	}

	let { data } = $props();

	let reservations = $derived((data.reservations || []) as unknown as ReservationItem[]);

	let search = $state('');
	let filterSync = $state<'ALL' | 'SYNCED' | 'PENDING'>('ALL');

	let filteredReservations = $derived(
		reservations.filter((r) => {
			const query = search.toLowerCase().trim();
			const matchesSearch =
				query === '' ||
				r.code.toLowerCase().includes(query) ||
				r.customerName.toLowerCase().includes(query) ||
				r.customerIdNumber.includes(query) ||
				r.vehicle?.name.toLowerCase().includes(query);

			const matchesSync =
				filterSync === 'ALL' ||
				(filterSync === 'SYNCED' && r.synced) ||
				(filterSync === 'PENDING' && !r.synced);

			return matchesSearch && matchesSync;
		})
	);

	function formatCOP(amount: number): string {
		return new Intl.NumberFormat('es-CO', {
			style: 'currency',
			currency: 'COP',
			maximumFractionDigits: 0
		}).format(amount);
	}

	function formatDate(iso: string): string {
		if (!iso) return '—';
		const d = new Date(iso);
		return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function formatDateTime(iso: string): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString('es-CO', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	/** Estado del pago en la tabla: el badge no puede ser verde por defecto. */
	function paymentStatusBadge(status?: string | null): {
		text: string;
		short: string;
		icon: string;
		tone: string;
	} {
		if (status === 'APROBADO')
			return {
				text: 'Pagado Place to Pay',
				short: 'Pagado',
				icon: 'fa-circle-check',
				tone: 'text-emerald-400'
			};
		if (status === 'RECHAZADO')
			return {
				text: 'Pago rechazado',
				short: 'Rechazado',
				icon: 'fa-circle-xmark',
				tone: 'text-rose-400'
			};
		if (status === 'PENDIENTE')
			return {
				text: 'Pago pendiente',
				short: 'Pendiente',
				icon: 'fa-clock',
				tone: 'text-amber-400'
			};
		return {
			text: 'Sin pago registrado',
			short: 'Sin pago',
			icon: 'fa-circle-minus',
			tone: 'text-slate-400'
		};
	}

	function buildWhatsAppLink(r: ReservationItem): string {
		const cleanPhone = (r.customerPhone || '').replace(/\D/g, '');
		const intlPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
		const text = encodeURIComponent(
			`¡Hola ${r.customerName}! Te escribimos de Dinamo Rent a Car Cartagena sobre tu reserva #${r.code} para el ${r.vehicle.name}. ¿Tienes alguna inquietud sobre la entrega en nuestra oficina principal?`
		);
		return `https://wa.me/${intlPhone}?text=${text}`;
	}

	// Modal único de tarjeta de garantía: cobro con token y administración de la suscripción
	const CANCEL_REASONS = [
		'Fin del contrato de alquiler / devolución de garantía',
		'Solicitud expresa del cliente',
		'Reserva cancelada por el establecimiento',
		'Tarjeta reemplazada por un nuevo instrumento tokenizado',
		'Rechazo definitivo de la tarjeta (bloqueada, vencida, robada o de uso restringido)'
	];
	const COLLECT_CONCEPTS = [
		{ value: 'DEDUCIBLE', label: 'Deducible por Siniestro o Daños Menores' },
		{ value: 'GASOLINA', label: 'Combustible / Gasolina Faltante' },
		{ value: 'DIAS_EXTRA', label: 'Día(s) u Horas Adicionales de Retraso' },
		{ value: 'MULTA', label: 'Infracción o Fotomulta de Tránsito' },
		{ value: 'OTRO', label: 'Otro Cargo Justificado en Contrato' }
	];

	let cardModalOpen = $state(false);
	let cardReservation = $state<ReservationItem | null>(null);
	let cardMode = $state<'collect' | 'manage'>('manage');
	let actionMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let submitting = $state(false);

	let collectAmount = $state<number>(150000);
	let collectConcept = $state<string>('DEDUCIBLE');
	let collectDescription = $state('');
	let cancelReason = $state<string>(CANCEL_REASONS[0]);
	let retokenizing = $state(false);

	// Resultado de la sesión de tokenización sin cobro (retorno desde PlacetoPay).
	// Se lee una sola vez al montar y la URL se limpia enseguida: recargar o volver
	// al panel no debe repetir un aviso de una operación ya cerrada.
	function readTokenNotice() {
		const outcome = page.url.searchParams.get('token');
		if (!outcome) return null;
		if (outcome === 'actualizado') {
			const code = page.url.searchParams.get('reserva') || '';
			return {
				type: 'success' as const,
				text: `Medio de pago actualizado${code ? ` para la reserva ${code}` : ''}. El token quedó activo para cobros de garantía.`
			};
		}
		return {
			type: 'error' as const,
			text:
				page.url.searchParams.get('detalle') ||
				'No se pudo completar la tokenización del medio de pago.'
		};
	}

	let tokenNotice = $state(readTokenNotice());

	$effect(() => {
		// Solo se retiran los parámetros que consume el aviso: `reserva` acompaña a
		// `token` y por sí solo no aporta nada. replaceState no reejecuta el load ni
		// navega, así que el banner no parpadea; al quedar la URL limpia, la guardia
		// corta en la siguiente pasada y no hay bucle.
		const params = page.url.searchParams;
		if (!params.has('token') && !params.has('detalle')) return;
		replaceState(resolve('/admin/reservas'), page.state);
	});

	let cardPayment = $derived(cardReservation?.payment ?? null);
	// Un token con vigencia cumplida se trata como EXPIRADO aunque la base aún
	// no lo haya marcado (la sonda diaria lo hace a las 8:00): el panel no debe
	// ofrecer un cobro que el backend va a rechazar.
	let tokenExpired = $derived(
		isTokenExpired(cardPayment?.tokenValidUntil) && cardPayment?.tokenStatus !== 'CANCELADO'
	);
	let tokenActive = $derived(
		Boolean(cardPayment?.token) &&
			cardPayment?.tokenStatus !== 'CANCELADO' &&
			cardPayment?.tokenStatus !== 'EXPIRADO' &&
			!tokenExpired
	);
	let tokenStatusLabel = $derived(
		cardPayment?.tokenStatus === 'CANCELADO'
			? 'CANCELADA'
			: cardPayment?.tokenStatus === 'EXPIRADO' || tokenExpired
				? 'EXPIRADA'
				: 'ACTIVA'
	);

	function openCardModal(r: ReservationItem, mode: 'collect' | 'manage') {
		cardReservation = r;
		cardMode = mode;
		actionMessage = null;
		collectAmount = r.blockingAmount > 0 ? r.blockingAmount : 150000;
		collectConcept = 'DEDUCIBLE';
		collectDescription = '';
		cancelReason = CANCEL_REASONS[0];
		cardModalOpen = true;
	}

	function closeCardModal() {
		cardModalOpen = false;
		cardReservation = null;
		actionMessage = null;
	}

	/** POST JSON tolerante a respuestas no JSON de la pasarela o del proxy. */
	async function postJson(url: string, payload: unknown) {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const data = await res.json().catch(() => null);
		return { ok: res.ok && data?.ok === true, status: res.status, data };
	}

	async function submitCollect() {
		if (!cardReservation) return;
		submitting = true;
		actionMessage = null;
		try {
			const { ok, status, data } = await postJson('/api/payments/collect', {
				reservationId: cardReservation.id,
				amount: collectAmount,
				concept: collectConcept,
				description: collectDescription
			});
			if (ok) {
				actionMessage = {
					type: 'success',
					text: `Cobro aprobado por la pasarela. Autorización: ${data.charge?.authorization || '—'}.`
				};
				// La fila y el historial se releen de la base: un cargo armado en el cliente
				// con id inventado no actualizaba la tabla y desaparecía al recargar.
				await refreshCardReservation();
			} else {
				actionMessage = {
					type: 'error',
					text: data?.error || `La pasarela rechazó el cobro (HTTP ${status}).`
				};
			}
		} catch (err) {
			actionMessage = {
				type: 'error',
				text: (err as Error).message || 'Error de conexión con el servidor.'
			};
		} finally {
			submitting = false;
		}
	}

	async function startRetokenization() {
		if (!cardReservation) return;
		retokenizing = true;
		actionMessage = null;
		try {
			const res = await fetch('/api/payments/token/resubscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reservationId: cardReservation.id })
			});
			const data = await res.json().catch(() => null);
			if (res.ok && data?.ok && data.processUrl) {
				// Sesión de suscripción sin cobro: el administrador registra la tarjeta
				// en la pasarela y vuelve al panel para guardar el token.
				window.location.href = data.processUrl;
				return;
			}
			actionMessage = {
				type: 'error',
				text: data?.error || `No se pudo iniciar la tokenización (HTTP ${res.status}).`
			};
		} catch (err) {
			actionMessage = {
				type: 'error',
				text: (err as Error).message || 'Error de conexión con el servidor.'
			};
		} finally {
			retokenizing = false;
		}
	}

	/**
	 * Relee desde la base la reserva abierta (token y cargos) y la reengancha al
	 * modal: invalidateAll reemplaza los objetos del load, no la copia del modal.
	 */
	async function refreshCardReservation() {
		const id = cardReservation?.id;
		if (!id) return;
		try {
			await invalidateAll();
		} catch {
			// Sin recarga se conserva lo que el modal ya está mostrando.
			return;
		}
		// El modal pudo cerrarse o cambiar de reserva mientras recargaba.
		if (cardReservation?.id === id) {
			cardReservation = reservations.find((r) => r.id === id) ?? cardReservation;
		}
	}

	async function submitCancellation() {
		if (!cardReservation) return;
		submitting = true;
		actionMessage = null;
		try {
			const { ok, status, data } = await postJson('/api/payments/token/invalidate', {
				reservationId: cardReservation.id,
				reason: cancelReason
			});
			if (ok) {
				if (cardReservation.payment) {
					cardReservation.payment.tokenStatus = 'CANCELADO';
					cardReservation.payment.p2pStatusMessage = `Token invalidado: ${cancelReason}`;
				}
				actionMessage = {
					type: 'success',
					text: data.message || 'Suscripción cancelada y token invalidado correctamente.'
				};
				// El modal ya muestra el token cancelado; la recarga confirma desde la base
				// y, si falla, queda ese estado optimista hasta la próxima visita.
				await refreshCardReservation();
			} else {
				actionMessage = {
					type: 'error',
					text: data?.error || `La pasarela no confirmó la cancelación (HTTP ${status}).`
				};
			}
		} catch (err) {
			actionMessage = {
				type: 'error',
				text: (err as Error).message || 'Error de conexión con el servidor.'
			};
		} finally {
			submitting = false;
		}
	}
</script>

<div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight">Reservas Online</h2>
			<p class="text-xs sm:text-sm text-slate-400 mt-1">
				Monitoreo de pagos de Place to Pay y sincronización con el software de mostrador.
			</p>
		</div>
	</div>

	{#if tokenNotice}
		<div
			class="p-3 rounded-xl text-xs flex items-start gap-2 {tokenNotice.type === 'success'
				? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
				: 'bg-red-500/10 text-red-400 border border-red-500/20'}"
		>
			<i
				class="fa-solid {tokenNotice.type === 'success' ? 'fa-check' : 'fa-circle-exclamation'} mt-0.5"
			></i>
			<span>{tokenNotice.text}</span>
		</div>
	{/if}

	<!-- Barra de Búsqueda y Filtros -->
	<div class="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-3">
		<div class="relative w-full sm:max-w-xs">
			<i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
			<input
				type="text"
				bind:value={search}
				placeholder="Buscar por código, cliente o cédula..."
				class="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-orange-500"
			/>
		</div>

		<div class="flex items-center gap-1.5 w-full sm:w-auto">
			<button
				type="button"
				onclick={() => (filterSync = 'ALL')}
				class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer {filterSync === 'ALL' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}"
			>
				Todas ({reservations.length})
			</button>
			<button
				type="button"
				onclick={() => (filterSync = 'PENDING')}
				class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer {filterSync === 'PENDING' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}"
			>
				Pendientes Mostrador ({reservations.filter((r) => !r.synced).length})
			</button>
			<button
				type="button"
				onclick={() => (filterSync = 'SYNCED')}
				class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer {filterSync === 'SYNCED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}"
			>
				Sincronizadas ({reservations.filter((r) => r.synced).length})
			</button>
		</div>
	</div>

	<!-- Tabla de Reservas -->
	<div class="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
		<div class="overflow-x-auto">
			<table class="w-full text-left text-xs sm:text-sm">
				<thead class="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-800">
					<tr>
						<th class="py-3.5 px-4">Código / Fecha</th>
						<th class="py-3.5 px-4">Cliente (Documento)</th>
						<th class="py-3.5 px-4">Vehículo</th>
						<th class="py-3.5 px-4">Fechas Alquiler</th>
						<th class="py-3.5 px-4">Total Pagado</th>
						<th class="py-3.5 px-4 text-center">ERP Mostrador</th>
						<th class="py-3.5 px-4 text-right">Acciones</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-800/60">
					{#each filteredReservations as r (r.id)}
						{@const p = r.payment}
						{@const rowTokenExpired =
							Boolean(p?.token) && p?.tokenStatus !== 'CANCELADO' && isTokenExpired(p?.tokenValidUntil)}
						{@const rowTokenActive =
							Boolean(p?.token) &&
								p?.tokenStatus !== 'CANCELADO' &&
								p?.tokenStatus !== 'EXPIRADO' &&
								!rowTokenExpired}
						{@const pay = paymentStatusBadge(p?.status)}
						<tr class="hover:bg-slate-800/30 transition-colors">
							<!-- Código + Fecha Registro -->
							<td class="py-3.5 px-4">
								<span class="font-black text-orange-400 font-mono text-sm whitespace-nowrap">{r.code}</span>
								<p class="text-[11px] text-slate-500 mt-0.5">{formatDate(r.createdAt)}</p>
								<!-- En móvil el estado del pago vive en la columna "Total Pagado", fuera de la
								     vista: se repite aquí para que se lea sin desplazar la tabla. Es una copia
								     visual del badge de escritorio, así que se oculta a lectores de pantalla. -->
								<span
									class="sm:hidden flex items-center gap-1 text-[10px] font-bold mt-1 {pay.tone}"
									aria-hidden="true"
								>
									<i class="fa-solid {pay.icon} text-[9px]"></i>
									{pay.short}
								</span>
							</td>

							<!-- Cliente -->
							<td class="py-3.5 px-4">
								<p class="font-bold text-white text-sm">{r.customerName}</p>
								<p class="text-[11px] text-slate-400">Doc: <span class="font-mono font-semibold text-slate-300">{r.customerIdNumber}</span></p>
								<p class="text-[11px] text-slate-400">{r.customerPhone}</p>
							</td>

							<!-- Vehículo -->
							<td class="py-3.5 px-4">
								<p class="font-semibold text-white">{r.vehicle?.name || 'Vehículo'}</p>
								<span class="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{r.vehicle?.category}</span>
							</td>

							<!-- Fechas -->
							<td class="py-3.5 px-4 whitespace-nowrap">
								<p class="text-white font-medium">{formatDate(r.pickupDate)} ➔ {formatDate(r.returnDate)}</p>
								<p class="text-[11px] text-slate-400">{r.days} día{r.days === 1 ? '' : 's'}</p>
							</td>

							<!-- Monto Pagado + Garantía Tokenizada -->
							<td class="py-3.5 px-4">
								<p class="font-black text-white tabular-nums text-sm">{formatCOP(r.totalAmount)}</p>
								<p class="text-[10px] text-slate-400 tabular-nums mt-0.5">
									Subtotal: {formatCOP(r.baseAmount + r.insuranceAmount + r.extrasAmount)}
								</p>
								<p class="text-[10px] text-slate-400 tabular-nums">
									IVA 19%: {formatCOP(r.totalAmount - (r.baseAmount + r.insuranceAmount + r.extrasAmount))}
								</p>
								<span
									class="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-bold {pay.tone}"
								>
									<i class="fa-solid {pay.icon} text-[9px]"></i> {pay.text}
								</span>
								{#if p?.token}
									<div class="mt-1 pt-1 border-t border-slate-800 flex flex-col gap-0.5">
										<span
																								class="inline-flex items-center gap-1 text-[10px] font-bold {rowTokenActive
												? 'text-cyan-400'
												: 'text-rose-400'}"
										>
											<i class="fa-solid fa-shield-halved text-[9px]"></i> Tarjeta Garantía
																								{rowTokenActive
													? '(activa)'
													: rowTokenExpired
														? `(vencida el ${p?.tokenValidUntil})`
														: '(cancelada)'}
										</span>
										<span class="text-[10px] text-slate-400 font-mono">
											{p.cardBrand || 'Tarjeta'} •••• {p.cardLast4 || '****'}
										</span>
									</div>
								{/if}
								{#if r.depositCharges && r.depositCharges.length > 0}
									<div class="mt-1">
										<span class="inline-flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
											<i class="fa-solid fa-receipt text-[8px]"></i> {r.depositCharges.length} cargo(s) aplicado(s)
										</span>
									</div>
								{/if}
							</td>

							<!-- Sincronización ERP -->
							<td class="py-3.5 px-4 text-center">
								{#if r.synced}
									<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
										<i class="fa-solid fa-check"></i> {r.desktopRef || 'Sincronizado'}
									</span>
								{:else}
									<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
										<i class="fa-solid fa-clock"></i> Pendiente Mostrador
									</span>
								{/if}
							</td>

							<!-- Acciones: Cobro Garantía, WhatsApp y Voucher -->
							<td class="py-3.5 px-4 text-right">
								<div class="flex items-center justify-end gap-1.5">
									{#if p?.token || r.status !== 'CANCELADA'}
										<button
											type="button"
																								onclick={() => openCardModal(r, 'manage')}
										aria-label={rowTokenExpired
											? `Token vencido el ${p?.tokenValidUntil}: registrar nueva tarjeta de garantía`
											: `Tarjeta de garantía de la reserva ${r.code}`}
											class="p-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-white transition-colors cursor-pointer"
											title={rowTokenExpired
											? `Token vencido el ${p?.tokenValidUntil}: registrar una nueva tarjeta de garantía`
											: 'Tarjeta de Garantía: registrar o actualizar el medio de pago, aplicar cobros y cancelar la suscripción'}
										>
											<i class="fa-solid fa-shield-halved text-sm"></i>
										</button>
									{/if}
																			{#if rowTokenActive}
											<button
												type="button"
												onclick={() => openCardModal(r, 'collect')}
										aria-label={`Aplicar cobro a la garantía de la reserva ${r.code}`}
											class="p-2 rounded-lg bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white transition-colors cursor-pointer"
											title="Aplicar Cobro a Garantía con Token Place to Pay"
										>
											<i class="fa-solid fa-credit-card text-sm"></i>
										</button>
									{/if}
									{#if r.customerPhone}
										<a
											href={buildWhatsAppLink(r)}
											target="_blank"
											rel="noopener noreferrer external"
											class="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
											title="Contactar al cliente por WhatsApp"
										aria-label={`Contactar por WhatsApp al cliente de la reserva ${r.code}`}
										>
											<i class="fa-brands fa-whatsapp text-sm"></i>
										</a>
									{/if}
									{#if p?.p2pRequestId || r.code}
										<a
											href={resolve(`/pago/retorno?reference=${encodeURIComponent(r.code)}`)}
											target="_blank"
											class="p-2 rounded-lg bg-slate-800 hover:bg-orange-500 hover:text-white text-slate-300 transition-colors"
											title="Ver Voucher Oficial"
										aria-label={`Ver voucher de la reserva ${r.code}`}
										>
											<i class="fa-solid fa-file-invoice text-sm"></i>
										</a>
									{/if}
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="7" class="py-12 text-center text-slate-500 text-sm">
								No hay reservas online que coincidan con la búsqueda.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Modal de Tarjeta de Garantía: cobro con token y administración de la suscripción -->
	{#if cardModalOpen && cardReservation}
		<div
			class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
			role="dialog"
			aria-modal="true"
		>
			<div
				class="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
			>
				<div class="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
					<div class="flex items-center gap-2.5">
						<div
							class="w-8 h-8 rounded-xl flex items-center justify-center text-sm {cardMode ===
							'collect'
								? 'bg-orange-500/20 text-orange-400'
								: 'bg-cyan-500/20 text-cyan-400'}"
						>
							<i class="fa-solid {cardMode === 'collect' ? 'fa-credit-card' : 'fa-shield-halved'}"></i>
						</div>
						<div>
							<h3 class="font-heading font-black text-white text-sm">
								{cardMode === 'collect' ? 'Cobro a Tarjeta de Garantía' : 'Tarjeta de Garantía / Suscripción'}
							</h3>
							<p class="text-[11px] text-slate-400 font-mono">Reserva #{cardReservation.code}</p>
						</div>
					</div>
					<button
						type="button"
						onclick={closeCardModal}
						aria-label="Cerrar modal"
						class="text-slate-400 hover:text-white p-1 rounded-lg text-sm cursor-pointer"
					>
						<i class="fa-solid fa-xmark"></i>
					</button>
				</div>

				<div class="p-6 space-y-4">
					<!-- Instrumento y estado del token -->
					<div
						class="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
					>
						<div>
							<span class="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">
								Instrumento tokenizado
							</span>
							<span class="font-bold text-white text-sm">
								{cardPayment?.tokenFranchise || cardPayment?.cardBrand || 'Tarjeta'} •••• {cardPayment?.cardLast4 ||
									'****'}
							</span>
							<span class="text-slate-500 text-[10px] block mt-0.5 font-mono">
								{cardPayment?.token ? `Token ${cardPayment.token.slice(0, 12)}…` : 'Sin token'} · Sesión {cardPayment?.p2pRequestId ||
									'—'}
							</span>
						</div>
						<div class="text-right">
							<span
								class="inline-flex items-center gap-1.5 font-bold text-[11px] px-2 py-0.5 rounded-full border {tokenActive
									? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
									: 'bg-rose-500/10 text-rose-400 border-rose-500/30'}"
							>
								<i class="fa-solid fa-circle text-[6px]"></i> {tokenStatusLabel}
							</span>
							{#if cardPayment?.tokenValidUntil}
								<span class="text-slate-500 text-[10px] block mt-1">Vigencia: {cardPayment.tokenValidUntil}{tokenExpired ? ' (vencida)' : ''}</span>
							{/if}
						</div>
					</div>

					{#if tokenExpired}
						<div
							class="p-3.5 rounded-2xl bg-rose-500/5 border border-rose-500/20 text-[11px] text-rose-300/90 flex items-start gap-2"
						>
							<i class="fa-solid fa-calendar-xmark mt-0.5"></i>
							<span>
								Token <strong class="text-rose-200">vencido</strong> el
								<strong class="font-mono text-rose-200">{cardPayment?.tokenValidUntil}</strong>. La tarjeta
								de garantía no admite cobros: registra una nueva (re-tokenización) para volver a operar.
							</span>
						</div>
					{/if}

					{#if cardPayment?.p2pStatusMessage}
						<p class="text-[11px] text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2">
							<i class="fa-solid fa-info-circle mr-1 text-slate-500"></i>{cardPayment.p2pStatusMessage}
						</p>
					{/if}

					{#if actionMessage}
						<div
							class="p-3 rounded-xl text-xs flex items-start gap-2 {actionMessage.type === 'success'
								? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
								: 'bg-red-500/10 text-red-400 border border-red-500/20'}"
						>
							<i
								class="fa-solid {actionMessage.type === 'success' ? 'fa-check' : 'fa-circle-exclamation'} mt-0.5"
							></i>
							<span>{actionMessage.text}</span>
						</div>
					{/if}

					{#if cardMode === 'manage' || !tokenActive}
						<!-- Tokenización sin cobro: registra o reemplaza la tarjeta de garantía -->
						<div class="p-3.5 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 space-y-2">
							<p class="text-[11px] text-cyan-200/90 leading-relaxed">
								Registra una nueva tarjeta de garantía mediante una sesión de tokenización de
								Place to Pay <strong>sin ejecutar ningún cobro</strong>. Sirve para reemplazar una tarjeta
								rechazada, vencida o para registrar una tarjeta de prueba destinada a validar los
								escenarios de rechazo recuperable y no recuperable.
							</p>
							<button
								type="button"
								onclick={startRetokenization}
								disabled={submitting || retokenizing}
								class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
							>
								{#if retokenizing}
									<i class="fa-solid fa-circle-notch fa-spin"></i>
									<span>Abriendo tokenización...</span>
								{:else}
									<i class="fa-solid fa-arrows-rotate"></i>
									<span
										>{tokenExpired
											? 'Registrar nueva tarjeta (re-tokenización)'
											: cardPayment?.token
												? 'Actualizar medio de pago'
												: 'Registrar tarjeta de garantía'}</span
									>
								{/if}
							</button>
						</div>
					{/if}

					{#if cardMode === 'collect' && tokenActive}
						<!-- Cobro con el token activo -->
						<div class="space-y-3">
							<div>
								<label for="collect-concept-select" class="block text-xs font-semibold text-slate-300 mb-1">
									Concepto del Cargo
								</label>
								<select
									id="collect-concept-select"
									bind:value={collectConcept}
									class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-orange-500 cursor-pointer"
								>
									{#each COLLECT_CONCEPTS as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="collect-amount-input" class="block text-xs font-semibold text-slate-300 mb-1">
									Monto a Cobrar (COP)
								</label>
								<div class="relative">
									<span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">$</span>
									<input
										id="collect-amount-input"
										type="number"
										step="1000"
										bind:value={collectAmount}
										class="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold text-sm focus:outline-none focus:border-orange-500"
										placeholder="150000"
									/>
								</div>
								<span class="text-[10px] text-slate-500 mt-1 block">Equivalente a {formatCOP(collectAmount || 0)}</span>
							</div>

							<div>
								<label for="collect-desc-input" class="block text-xs font-semibold text-slate-300 mb-1">
									Detalle / Justificación
								</label>
								<input
									id="collect-desc-input"
									type="text"
									bind:value={collectDescription}
									placeholder="Ej. Daño en espejo retrovisor derecho reportado en acta de entrega"
									class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-orange-500"
								/>
							</div>
						</div>

						<div class="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300/90 flex items-start gap-2">
							<i class="fa-solid fa-triangle-exclamation mt-0.5"></i>
							<span>
								Esta operación ejecutará un cargo Server-to-Server real e irreversible contra la tarjeta bancaria
								del cliente mediante Place to Pay Collect. Asegúrate de contar con el soporte en el acta de entrega.
							</span>
						</div>
					{:else if !tokenActive}
						<div class="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 text-[11px] text-rose-300/90 flex items-start gap-2">
							<i class="fa-solid fa-ban mt-0.5"></i>
							<span>
								La suscripción de esta reserva no tiene un token activo (cancelada, vencida o aún no
								registrada): no admite nuevos cobros. Usa el botón de re-tokenización para
								registrar una tarjeta nueva.
							</span>
						</div>
					{:else}
						<!-- Cancelación de la suscripción -->
						<div class="space-y-2">
							<label for="token-reason-select" class="block text-xs font-semibold text-slate-300">
								Motivo de la cancelación de la suscripción
							</label>
							<select
								id="token-reason-select"
								bind:value={cancelReason}
								class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
							>
								{#each CANCEL_REASONS as reason (reason)}
									<option value={reason}>{reason}</option>
								{/each}
							</select>
							<div class="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300/90 flex items-start gap-2">
								<i class="fa-solid fa-triangle-exclamation mt-0.5"></i>
								<span>
									Se ejecutará la invalidación real del instrumento en Place to Pay. El token dejará de aceptar
									cobros y la operación queda registrada en la bitácora de auditoría.
								</span>
							</div>
						</div>
					{/if}

					<!-- Historial de cargos: evidencia de rechazos recuperables y no recuperables -->
					<div class="pt-2 border-t border-slate-800">
						<span class="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1.5">
							Cargos aplicados al token
						</span>
						{#if cardReservation.depositCharges && cardReservation.depositCharges.length > 0}
							<div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
								{#each cardReservation.depositCharges as ch (ch.id)}
									<div class="text-[11px] px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800/80">
										<div class="flex items-center justify-between gap-2">
											<span class="text-slate-200 font-semibold">{ch.concept} · {formatCOP(ch.amount)}</span>
											<span
												class="font-bold text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap {ch.status ===
												'APROBADO'
													? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
													: ch.status === 'RECHAZADO'
														? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
														: 'bg-amber-500/10 text-amber-400 border-amber-500/30'}"
											>
												{ch.status}
											</span>
										</div>
										<p class="text-[10px] text-slate-500 mt-0.5">
											{formatDateTime(ch.createdAt)} · {ch.executedBy || 'ADMIN'}
											{ch.transactionId ? ` · Autorización ${ch.transactionId}` : ''}
										</p>
										{#if ch.p2pStatusMessage}
											<p class="text-[10px] text-slate-400 mt-0.5">{ch.p2pStatusMessage}</p>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-[11px] text-slate-500 italic">Aún no se han ejecutado cobros sobre esta tarjeta.</p>
						{/if}
					</div>

					<p class="text-[10px] text-slate-500 leading-relaxed">
						Invalidación automática por rechazos: los rechazos definitivos (tarjeta robada, perdida, bloqueada,
						vencida, inválida o de uso restringido) invalidan el token de inmediato; los rechazos recuperables
						(fondos insuficientes, cupo o límites) permiten hasta 3 intentos consecutivos antes de invalidarlo.
					</p>
				</div>

				<div class="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
					<button
						type="button"
						onclick={closeCardModal}
						class="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
					>
						Cerrar
					</button>
					{#if cardMode === 'collect'}
						<button
							type="button"
							onclick={submitCollect}
							disabled={submitting || !collectAmount || collectAmount <= 0}
							class="px-5 py-2 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-400 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
						>
							{#if submitting}
								<i class="fa-solid fa-circle-notch fa-spin"></i>
								<span>Procesando cargo...</span>
							{:else}
								<i class="fa-solid fa-bolt"></i>
								<span>Confirmar y Cobrar {formatCOP(collectAmount || 0)}</span>
							{/if}
						</button>
					{:else if tokenActive}
						<button
							type="button"
							onclick={submitCancellation}
							disabled={submitting}
							class="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
						>
							{#if submitting}
								<i class="fa-solid fa-circle-notch fa-spin"></i>
								<span>Cancelando suscripción...</span>
							{:else}
								<i class="fa-solid fa-link-slash"></i>
								<span>Cancelar suscripción e invalidar token</span>
							{/if}
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
