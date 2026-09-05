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
		} | null;
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

							<!-- Monto Pagado + Pasarela -->
							<td class="py-3.5 px-4">
								<p class="font-black text-white tabular-nums text-sm">{formatCOP(r.totalAmount)}</p>
								<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
									<i class="fa-solid fa-circle-check text-[9px]"></i> Pagado Place to Pay
								</span>
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

							<!-- Acciones: WhatsApp y Voucher -->
							<td class="py-3.5 px-4 text-right">
								<div class="flex items-center justify-end gap-1.5">
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
</div>
