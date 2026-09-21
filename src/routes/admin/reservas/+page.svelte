<script lang="ts">
	interface ReservationItem {
		id: string;
		code: string;
		status: string;
		totalAmount: number;
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
		customerHotel: string | null;
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

	function buildWhatsAppLink(r: ReservationItem): string {
		const cleanPhone = (r.customerPhone || '').replace(/\D/g, '');
		const intlPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
		const text = encodeURIComponent(
			`¡Hola ${r.customerName}! Te escribimos de Dinamo Rent a Car Cartagena sobre tu reserva #${r.code} para el ${r.vehicle.name}. ¿Tienes alguna inquietud sobre tu llegada al Aeropuerto Rafael Núñez?`
		);
		return `https://wa.me/${intlPhone}?text=${text}`;
	}

	// Estados del modal de cobro de garantía
	let collectModalOpen = $state(false);
	let selectedReservation = $state<ReservationItem | null>(null);
	let collectAmount = $state<number>(150000);
	let collectConcept = $state<string>('DEDUCIBLE');
	let collectDescription = $state('');
	let collectSubmitting = $state(false);
	let collectMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	function openCollectModal(r: ReservationItem) {
		selectedReservation = r;
		collectAmount = r.blockingAmount > 0 ? r.blockingAmount : 150000;
		collectConcept = 'DEDUCIBLE';
		collectDescription = '';
		collectMessage = null;
		collectModalOpen = true;
	}

	function closeCollectModal() {
		collectModalOpen = false;
		selectedReservation = null;
		collectMessage = null;
	}

	async function submitCollect() {
		if (!selectedReservation) return;
		collectSubmitting = true;
		collectMessage = null;
		try {
			const res = await fetch('/api/payments/collect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					reservationId: selectedReservation.id,
					amount: collectAmount,
					concept: collectConcept,
					description: collectDescription
				})
			});
			const data = await res.json();
			if (data.ok) {
				collectMessage = {
					type: 'success',
					text: `¡Cobro aprobado por pasarela! Código de autorización: ${data.charge?.authorization || 'AUTH-OK'}`
				};
				if (selectedReservation) {
					if (!selectedReservation.depositCharges) selectedReservation.depositCharges = [];
					selectedReservation.depositCharges.unshift(data.charge);
				}
			} else {
				collectMessage = {
					type: 'error',
					text: data.error || 'La pasarela rechazó el cobro con la tarjeta registrada.'
				};
			}
		} catch (err) {
			collectMessage = {
				type: 'error',
				text: (err as Error).message || 'Error de conexión con el servidor.'
			};
		} finally {
			collectSubmitting = false;
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
						<tr class="hover:bg-slate-800/30 transition-colors">
							<!-- Código + Fecha Registro -->
							<td class="py-3.5 px-4">
								<span class="font-black text-orange-400 font-mono text-sm">{r.code}</span>
								<p class="text-[11px] text-slate-500 mt-0.5">{formatDate(r.createdAt)}</p>
							</td>

							<!-- Cliente -->
							<td class="py-3.5 px-4">
								<p class="font-bold text-white text-sm">{r.customerName}</p>
								<p class="text-[11px] text-slate-400">Doc: <span class="font-mono font-semibold text-slate-300">{r.customerIdNumber}</span></p>
								<p class="text-[11px] text-slate-400">{r.customerPhone}</p>
								{#if r.customerHotel}
									<p class="text-[10px] text-amber-400/90 mt-0.5">🏨 {r.customerHotel}</p>
								{/if}
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
								<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
									<i class="fa-solid fa-circle-check text-[9px]"></i> Pagado Place to Pay
								</span>
								{#if p?.token || p?.tokenStatus === 'ACTIVO'}
									<div class="mt-1 pt-1 border-t border-slate-800 flex flex-col gap-0.5">
										<span class="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400">
											<i class="fa-solid fa-shield-halved text-[9px]"></i> Tarjeta Garantía
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
									{#if p?.token || p?.tokenStatus === 'ACTIVO'}
										<button
											type="button"
											onclick={() => openCollectModal(r)}
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
											rel="noopener noreferrer"
											class="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
											title="Contactar al cliente por WhatsApp"
										>
											<i class="fa-brands fa-whatsapp text-sm"></i>
										</a>
									{/if}
									{#if p?.p2pRequestId}
										<a
											href="/pago/retorno?requestId={p.p2pRequestId}"
											target="_blank"
											class="p-2 rounded-lg bg-slate-800 hover:bg-orange-500 hover:text-white text-slate-300 transition-colors"
											title="Ver Voucher Oficial"
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

	<!-- Modal de Cobro de Garantía (Place to Pay Collect) -->
	{#if collectModalOpen && selectedReservation}
		{@const resPayment = selectedReservation.payment}
		<div
			class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
			role="dialog"
			aria-modal="true"
		>
			<div class="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
				<!-- Header Modal -->
				<div class="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
					<div class="flex items-center gap-2.5">
						<div class="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center text-sm">
							<i class="fa-solid fa-credit-card"></i>
						</div>
						<div>
							<h3 class="font-heading font-black text-white text-sm">Cobro a Tarjeta de Garantía</h3>
							<p class="text-[11px] text-slate-400 font-mono">Reserva #{selectedReservation.code}</p>
						</div>
					</div>
					<button
						type="button"
						onclick={closeCollectModal}
						aria-label="Cerrar modal"
						class="text-slate-400 hover:text-white p-1 rounded-lg text-sm cursor-pointer"
					>
						<i class="fa-solid fa-xmark"></i>
					</button>
				</div>

				<!-- Contenido del Modal -->
				<div class="p-6 space-y-4">
					<!-- Info de Tarjeta Tokenizada -->
					<div class="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
						<div>
							<span class="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Instrumento Suscrito</span>
							<span class="font-bold text-white text-sm">{resPayment?.cardBrand || 'Tarjeta'} •••• {resPayment?.cardLast4 || '****'}</span>
						</div>
						<div class="text-right">
							<span class="text-emerald-400 font-bold text-[11px] block">
								<i class="fa-solid fa-shield-check text-[10px]"></i> Token Activo
							</span>
							<span class="text-slate-500 text-[10px]">Place to Pay PCI-DSS</span>
						</div>
					</div>

					{#if collectMessage}
						<div class="p-3 rounded-xl text-xs flex items-start gap-2 {collectMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}">
							<i class="fa-solid {collectMessage.type === 'success' ? 'fa-check' : 'fa-circle-exclamation'} mt-0.5"></i>
							<span>{collectMessage.text}</span>
						</div>
					{/if}

					<!-- Formulario de Cobro -->
					<div class="space-y-3">
						<div>
							<label for="collect-concept-select" class="block text-xs font-semibold text-slate-300 mb-1">Concepto del Cargo</label>
							<select
								id="collect-concept-select"
								bind:value={collectConcept}
								class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-orange-500 cursor-pointer"
							>
								<option value="DEDUCIBLE">Deducible por Siniestro o Daños Menores</option>
								<option value="GASOLINA">Combustible / Gasolina Faltante</option>
								<option value="DIAS_EXTRA">Día(s) u Horas Adicionales de Retraso</option>
								<option value="MULTA">Infracción o Fotomulta de Tránsito</option>
								<option value="OTRO">Otro Cargo Justificado en Contrato</option>
							</select>
						</div>

						<div>
							<label for="collect-amount-input" class="block text-xs font-semibold text-slate-300 mb-1">Monto a Cobrar (COP)</label>
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
							<label for="collect-desc-input" class="block text-xs font-semibold text-slate-300 mb-1">Detalle / Justificación</label>
							<input
								id="collect-desc-input"
								type="text"
								bind:value={collectDescription}
								placeholder="Ej. Daño en espejo retrovisor derecho reportado en acta de entrega"
								class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-orange-500"
							/>
						</div>
					</div>

					<!-- Advertencia de seguridad -->
					<div class="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300/90 flex items-start gap-2">
						<i class="fa-solid fa-triangle-exclamation mt-0.5"></i>
						<span>Esta operación ejecutará un cargo Server-to-Server real e irreversible contra la tarjeta bancaria del cliente mediante Place to Pay Collect. Asegúrate de contar con el soporte en el acta de entrega.</span>
					</div>

					<!-- Historial de cobros previos en esta reserva -->
					{#if selectedReservation.depositCharges && selectedReservation.depositCharges.length > 0}
						<div class="pt-2 border-t border-slate-800">
							<span class="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1.5">Cargos anteriores aplicados:</span>
							<div class="space-y-1 max-h-28 overflow-y-auto pr-1">
								{#each selectedReservation.depositCharges as ch}
									<div class="text-[11px] flex justify-between items-center py-1 px-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
										<span class="text-slate-300">{ch.concept}: {formatCOP(ch.amount)}</span>
										<span class="font-mono text-[10px] text-emerald-400 font-semibold">{ch.transactionId || ch.status}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<!-- Footer Modal -->
				<div class="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
					<button
						type="button"
						onclick={closeCollectModal}
						class="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
					>
						Cancelar
					</button>
					<button
						type="button"
						onclick={submitCollect}
						disabled={collectSubmitting || !collectAmount || collectAmount <= 0}
						class="px-5 py-2 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-400 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
					>
						{#if collectSubmitting}
							<i class="fa-solid fa-circle-notch fa-spin"></i>
							<span>Procesando cargo...</span>
						{:else}
							<i class="fa-solid fa-bolt"></i>
							<span>Confirmar y Cobrar {formatCOP(collectAmount || 0)}</span>
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
