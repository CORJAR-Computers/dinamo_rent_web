<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	interface RateItem {
		id: string;
		name: string;
		category: string;
		plate: string | null;
		image: string;
		pricePerDay: number;
		deposit: number;
		available: boolean;
	}

	let { data } = $props();

	// Clon local editable
	let rates = $state<RateItem[]>([]);

	$effect(() => {
		if (data.vehicles) {
			rates = (data.vehicles as RateItem[]).map((v: RateItem) => ({ ...v }));
		}
	});

	let savingId = $state<string | null>(null);
	let successMsg = $state('');

	function formatCOP(amount: number): string {
		return new Intl.NumberFormat('es-CO', {
			style: 'currency',
			currency: 'COP',
			maximumFractionDigits: 0
		}).format(amount);
	}

	async function updateRate(item: RateItem) {
		savingId = item.id;
		try {
			const res = await fetch(`/api/vehicles/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					pricePerDay: Number(item.pricePerDay),
					deposit: Number(item.deposit)
				})
			});

			if (res.ok) {
				await invalidateAll();
				successMsg = `Precios de ${item.name} actualizados.`;
				setTimeout(() => (successMsg = ''), 3000);
			}
		} catch (err) {
			console.error('Error actualizando tarifa:', err);
		} finally {
			savingId = null;
		}
	}
</script>

<div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight">Tarifas y Precios</h2>
			<p class="text-xs sm:text-sm text-slate-400 mt-1">
				Ajusta rápidamente el valor por día y las garantías con tarjeta para temporadas altas o bajas.
			</p>
		</div>
	</div>

	{#if successMsg}
		<div class="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm flex items-center gap-3">
			<i class="fa-solid fa-circle-check text-base"></i>
			<span>{successMsg}</span>
		</div>
	{/if}

	<!-- Matriz de Tarifas -->
	<div class="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
		<div class="overflow-x-auto">
			<table class="w-full text-left text-xs sm:text-sm">
				<thead class="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-800">
					<tr>
						<th class="py-3.5 px-4">Vehículo</th>
						<th class="py-3.5 px-4">Categoría</th>
						<th class="py-3.5 px-4 w-48">Tarifa / Día (COP)</th>
						<th class="py-3.5 px-4 w-48">Depósito Garantía (COP)</th>
						<th class="py-3.5 px-4 text-right">Guardar</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-800/60">
					{#each rates as r (r.id)}
						<tr class="hover:bg-slate-800/30 transition-colors">
							<td class="py-3.5 px-4">
								<div class="flex items-center gap-3">
									<img
										src={r.image || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=150&q=80'}
										alt={r.name}
										class="w-12 h-9 object-cover rounded-lg bg-slate-950 border border-slate-800 shrink-0"
									/>
									<div>
										<p class="font-bold text-white text-sm">{r.name}</p>
										<p class="text-[11px] font-mono text-orange-400 font-semibold">{r.plate || 'Sin placa'}</p>
									</div>
								</div>
							</td>

							<td class="py-3.5 px-4">
								<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300">
									{r.category}
								</span>
							</td>

							<td class="py-3.5 px-4">
								<div class="relative">
									<span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">$</span>
									<input
										type="number"
										step="5000"
										min="50000"
										bind:value={r.pricePerDay}
										class="w-full pl-7 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-bold text-xs focus:border-orange-500 focus:outline-none"
									/>
								</div>
								<span class="text-[10px] text-slate-500 mt-0.5 block">{formatCOP(r.pricePerDay)}</span>
							</td>

							<td class="py-3.5 px-4">
								<div class="relative">
									<span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">$</span>
									<input
										type="number"
										step="50000"
										min="100000"
										bind:value={r.deposit}
										class="w-full pl-7 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-bold text-xs focus:border-orange-500 focus:outline-none"
									/>
								</div>
								<span class="text-[10px] text-slate-500 mt-0.5 block">{formatCOP(r.deposit)}</span>
							</td>

							<td class="py-3.5 px-4 text-right">
								<button
									type="button"
									disabled={savingId === r.id}
									onclick={() => updateRate(r)}
									class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
								>
									{#if savingId === r.id}
										<i class="fa-solid fa-circle-notch fa-spin text-xs"></i>
										<span>Guardando...</span>
									{:else}
										<i class="fa-solid fa-floppy-disk text-xs"></i>
										<span>Actualizar</span>
									{/if}
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
