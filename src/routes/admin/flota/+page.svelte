<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	interface VehicleData {
		id: string;
		name: string;
		brand: string;
		category: string;
		categoryLabel: string;
		badge: string;
		transmission: string;
		fuelType: string;
		seats: number;
		doors: number;
		ac: boolean;
		luggage: string;
		pricePerDay: number;
		deposit: number;
		image: string;
		features: string[];
		plate: string | null;
		available: boolean;
	}

	let { data } = $props();

	let vehicles = $derived(data.vehicles as VehicleData[]);

	// Filtros
	let search = $state('');
	let filterStatus = $state<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

	// Modal crear/editar
	let modalOpen = $state(false);
	let isEditing = $state(false);
	let saving = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// Formulario
	let formId = $state('');
	let formName = $state('');
	let formBrand = $state('');
	let formCategory = $state('ECONOMICO');
	let formCategoryLabel = $state('');
	let formBadge = $state('');
	let formPlate = $state('');
	let formPricePerDay = $state<number>(160000);
	let formDeposit = $state<number>(1000000);
	let formTransmission = $state('AUTOMATICA');
	let formFuelType = $state('GASOLINA');
	let formSeats = $state(5);
	let formDoors = $state(4);
	let formAc = $state(true);
	let formLuggage = $state('2 Maletas Grandes');
	let formImage = $state('');
	let formFeatures = $state('');
	let formAvailable = $state(true);

	// Contadores
	let totalVehicles = $derived(vehicles.length);
	let activeVehicles = $derived(vehicles.filter((v) => v.available).length);
	let inactiveVehicles = $derived(vehicles.filter((v) => !v.available).length);

	// Filtrados
	let filteredVehicles = $derived(
		vehicles.filter((v) => {
			const matchesSearch =
				search.trim() === '' ||
				v.name.toLowerCase().includes(search.toLowerCase()) ||
				(v.plate && v.plate.toLowerCase().includes(search.toLowerCase())) ||
				v.category.toLowerCase().includes(search.toLowerCase());

			const matchesStatus =
				filterStatus === 'ALL' ||
				(filterStatus === 'ACTIVE' && v.available) ||
				(filterStatus === 'INACTIVE' && !v.available);

			return matchesSearch && matchesStatus;
		})
	);

	function formatCOP(amount: number): string {
		return new Intl.NumberFormat('es-CO', {
			style: 'currency',
			currency: 'COP',
			maximumFractionDigits: 0
		}).format(amount);
	}

	function openCreateModal() {
		isEditing = false;
		formId = '';
		formName = '';
		formBrand = '';
		formCategory = 'ECONOMICO';
		formCategoryLabel = 'Económico • 2024';
		formBadge = '';
		formPlate = '';
		formPricePerDay = 160000;
		formDeposit = 1000000;
		formTransmission = 'AUTOMATICA';
		formFuelType = 'GASOLINA';
		formSeats = 5;
		formDoors = 4;
		formAc = true;
		formLuggage = '2 Maletas Grandes';
		formImage = 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=85';
		formFeatures = 'Apple CarPlay, Cámara de Reversa, Aire Acondicionado';
		formAvailable = true;
		errorMessage = '';
		modalOpen = true;
	}

	function openEditModal(v: VehicleData) {
		isEditing = true;
		formId = v.id;
		formName = v.name;
		formBrand = v.brand || '';
		formCategory = v.category;
		formCategoryLabel = v.categoryLabel || '';
		formBadge = v.badge || '';
		formPlate = v.plate || '';
		formPricePerDay = v.pricePerDay;
		formDeposit = v.deposit;
		formTransmission = v.transmission;
		formFuelType = v.fuelType;
		formSeats = v.seats;
		formDoors = v.doors;
		formAc = v.ac;
		formLuggage = v.luggage || '';
		formImage = v.image || '';
		formFeatures = Array.isArray(v.features) ? v.features.join(', ') : '';
		formAvailable = v.available;
		errorMessage = '';
		modalOpen = true;
	}

	async function toggleAvailability(v: VehicleData) {
		const newStatus = !v.available;
		try {
			const res = await fetch(`/api/vehicles/${v.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ available: newStatus })
			});

			if (res.ok) {
				await invalidateAll();
				successMessage = `Vehículo ${v.name} ${newStatus ? 'habilitado' : 'inhabilitado'}.`;
				setTimeout(() => (successMessage = ''), 3500);
			}
		} catch (err) {
			console.error('Error toggling availability:', err);
		}
	}

	async function saveVehicle(e: SubmitEvent) {
		e.preventDefault();
		if (!formName.trim() || !formPricePerDay) {
			errorMessage = 'Nombre y Precio por día son obligatorios.';
			return;
		}

		saving = true;
		errorMessage = '';

		const payload = {
			name: formName.trim(),
			brand: formBrand.trim(),
			category: formCategory,
			categoryLabel: formCategoryLabel.trim(),
			badge: formBadge.trim(),
			plate: formPlate.trim(),
			pricePerDay: Number(formPricePerDay),
			deposit: Number(formDeposit),
			transmission: formTransmission,
			fuelType: formFuelType,
			seats: Number(formSeats),
			doors: Number(formDoors),
			ac: formAc,
			luggage: formLuggage.trim(),
			image: formImage.trim(),
			features: formFeatures
				.split(',')
				.map((f) => f.trim())
				.filter(Boolean),
			available: formAvailable
		};

		try {
			const url = isEditing ? `/api/vehicles/${formId}` : '/api/vehicles';
			const method = isEditing ? 'PUT' : 'POST';

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const resData = await res.json();

			if (res.ok && resData.ok) {
				modalOpen = false;
				await invalidateAll();
				successMessage = isEditing ? 'Vehículo modificado con éxito.' : 'Vehículo creado con éxito.';
				setTimeout(() => (successMessage = ''), 3500);
			} else {
				errorMessage = resData.message || 'Error al guardar los datos.';
			}
		} catch {
			errorMessage = 'Error de conexión con el servidor.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
	<!-- Encabezado con Métricas y Botón Nuevo -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight">Gestión de Flota</h2>
			<p class="text-xs sm:text-sm text-slate-400 mt-1">
				Administra los vehículos visibles en la web, fotos, precios diarios y estado operativo.
			</p>
		</div>

		<button
			onclick={openCreateModal}
			class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-bold shadow-lg shadow-orange-500/25 transition-all cursor-pointer shrink-0"
		>
			<i class="fa-solid fa-plus"></i>
			<span>Nuevo Vehículo</span>
		</button>
	</div>

	<!-- Notificación de éxito -->
	{#if successMessage}
		<div class="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm flex items-center gap-3">
			<i class="fa-solid fa-circle-check text-base"></i>
			<span>{successMessage}</span>
		</div>
	{/if}

	<!-- Métricas rápidas -->
	<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
		<div class="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4">
			<div class="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-lg">
				<i class="fa-solid fa-car-side"></i>
			</div>
			<div>
				<p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Flota</p>
				<p class="text-2xl font-black text-white">{totalVehicles}</p>
			</div>
		</div>

		<div class="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4">
			<div class="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">
				<i class="fa-solid fa-circle-check"></i>
			</div>
			<div>
				<p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Habilitados en Web</p>
				<p class="text-2xl font-black text-emerald-400">{activeVehicles}</p>
			</div>
		</div>

		<div class="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4">
			<div class="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 text-lg">
				<i class="fa-solid fa-ban"></i>
			</div>
			<div>
				<p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Inhabilitados / Taller</p>
				<p class="text-2xl font-black text-rose-400">{inactiveVehicles}</p>
			</div>
		</div>
	</div>

	<!-- Barra de Búsqueda y Filtros -->
	<div class="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-3">
		<div class="relative w-full sm:max-w-xs">
			<i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
			<input
				type="text"
				bind:value={search}
				placeholder="Buscar por auto, placa o categoría..."
				class="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-orange-500"
			/>
		</div>

		<div class="flex items-center gap-1.5 w-full sm:w-auto">
			<button
				type="button"
				onclick={() => (filterStatus = 'ALL')}
				class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer {filterStatus === 'ALL' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}"
			>
				Todos ({totalVehicles})
			</button>
			<button
				type="button"
				onclick={() => (filterStatus = 'ACTIVE')}
				class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer {filterStatus === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}"
			>
				Habilitados ({activeVehicles})
			</button>
			<button
				type="button"
				onclick={() => (filterStatus = 'INACTIVE')}
				class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer {filterStatus === 'INACTIVE' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}"
			>
				Inhabilitados ({inactiveVehicles})
			</button>
		</div>
	</div>

	<!-- Tabla de Vehículos -->
	<div class="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
		<div class="overflow-x-auto">
			<table class="w-full text-left text-xs sm:text-sm">
				<thead class="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-800">
					<tr>
						<th class="py-3.5 px-4">Vehículo</th>
						<th class="py-3.5 px-4">Categoría / Placa</th>
						<th class="py-3.5 px-4">Precio / Día</th>
						<th class="py-3.5 px-4">Garantía</th>
						<th class="py-3.5 px-4 text-center">Estado Web</th>
						<th class="py-3.5 px-4 text-right">Acciones</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-800/60">
					{#each filteredVehicles as v (v.id)}
						<tr class="hover:bg-slate-800/30 transition-colors">
							<!-- Foto + Nombre -->
							<td class="py-3.5 px-4">
								<div class="flex items-center gap-3">
									<img
										src={v.image || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=200&q=80'}
										alt={v.name}
										class="w-14 h-10 object-cover rounded-lg bg-slate-950 border border-slate-800 shrink-0"
									/>
									<div>
										<p class="font-bold text-white text-sm">{v.name}</p>
										<p class="text-[11px] text-slate-400">{v.transmission} • {v.fuelType}</p>
									</div>
								</div>
							</td>

							<!-- Categoría + Placa -->
							<td class="py-3.5 px-4">
								<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
									{v.category}
								</span>
								{#if v.plate}
									<p class="text-xs font-mono font-bold text-orange-400 mt-1">{v.plate}</p>
								{:else}
									<p class="text-[11px] text-slate-500 mt-1">Sin placa asignada</p>
								{/if}
							</td>

							<!-- Tarifa día -->
							<td class="py-3.5 px-4">
								<span class="font-black text-white tabular-nums text-sm">{formatCOP(v.pricePerDay)}</span>
								<span class="text-[10px] text-slate-400 block">por día</span>
							</td>

							<!-- Depósito -->
							<td class="py-3.5 px-4">
								<span class="font-semibold text-slate-300 tabular-nums">{formatCOP(v.deposit)}</span>
								<span class="text-[10px] text-slate-500 block">bloqueo tarjeta</span>
							</td>

							<!-- Switch Disponibilidad -->
							<td class="py-3.5 px-4 text-center">
								<button
									type="button"
									onclick={() => toggleAvailability(v)}
									class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer {v.available
										? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
										: 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'}"
									title={v.available ? 'Clic para inhabilitar en la web' : 'Clic para habilitar en la web'}
								>
									<span class="w-2 h-2 rounded-full {v.available ? 'bg-emerald-400' : 'bg-rose-400'}"></span>
									<span>{v.available ? 'Habilitado' : 'Inhabilitado'}</span>
								</button>
							</td>

							<!-- Acciones -->
							<td class="py-3.5 px-4 text-right">
								<button
									onclick={() => openEditModal(v)}
									class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-orange-500 hover:text-white text-slate-300 transition-all cursor-pointer"
								>
									<i class="fa-solid fa-pen-to-square text-xs"></i>
									<span>Editar</span>
								</button>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6" class="py-12 text-center text-slate-500 text-sm">
								No se encontraron vehículos que coincidan con la búsqueda.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Modal Crear / Editar Vehículo -->
{#if modalOpen}
	<div class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
		<div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl space-y-5 my-8">
			<!-- Header -->
			<div class="flex items-center justify-between pb-4 border-b border-slate-800">
				<div>
					<h3 class="text-lg sm:text-xl font-black text-white">
						{isEditing ? 'Editar Vehículo' : 'Registrar Nuevo Vehículo'}
					</h3>
					<p class="text-xs text-slate-400 mt-0.5">
						Configura los detalles técnicos, precio y visibilidad en la web.
					</p>
				</div>
				<button
					type="button"
					onclick={() => (modalOpen = false)}
					aria-label="Cerrar ventana"
					class="text-slate-500 hover:text-white transition-colors cursor-pointer text-lg p-1"
				>
					<i class="fa-solid fa-xmark"></i>
				</button>
			</div>

			{#if errorMessage}
				<div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
					<i class="fa-solid fa-triangle-exclamation"></i>
					<span>{errorMessage}</span>
				</div>
			{/if}

			<form onsubmit={saveVehicle} class="space-y-4">
				<!-- Fila 1: Nombre y Marca -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<div>
						<label for="form-name" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
							Nombre Comercial *
						</label>
						<input
							id="form-name"
							type="text"
							bind:value={formName}
							placeholder="Ej: Chevrolet Onix Turbo"
							class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-orange-500 focus:outline-none"
							required
						/>
					</div>
					<div>
						<label for="form-brand" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
							Marca
						</label>
						<input
							id="form-brand"
							type="text"
							bind:value={formBrand}
							placeholder="Ej: Chevrolet, Renault, Nissan"
							class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-orange-500 focus:outline-none"
						/>
					</div>
				</div>

				<!-- Fila 2: Categoría y Placa -->
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
					<div>
						<label for="form-cat" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
							Categoría
						</label>
						<select
							id="form-cat"
							bind:value={formCategory}
							class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-orange-500 focus:outline-none"
						>
							<option value="ECONOMICO">Económico</option>
							<option value="SEDAN">Sedán</option>
							<option value="SUV">SUV / Camioneta</option>
							<option value="CAMIONETA">Camioneta Pick-up</option>
							<option value="VAN">Van / Pasajeros</option>
							<option value="PREMIUM">Gama Alta / Premium</option>
						</select>
					</div>
					<div>
						<label for="form-plate" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
							Placa Real
						</label>
						<input
							id="form-plate"
							type="text"
							bind:value={formPlate}
							placeholder="Ej: LMY-842"
							class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono font-bold uppercase focus:border-orange-500 focus:outline-none"
						/>
					</div>
					<div>
						<label for="form-badge" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
							Insignia / Badge
						</label>
						<input
							id="form-badge"
							type="text"
							bind:value={formBadge}
							placeholder="Ej: Más Alquilado"
							class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-orange-500 focus:outline-none"
						/>
					</div>
				</div>

				<!-- Fila 3: Precios -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl">
					<div>
						<label for="form-price" class="block text-[11px] font-bold uppercase tracking-wider text-orange-400 mb-1">
							Tarifa Diaria (COP) *
						</label>
						<input
							id="form-price"
							type="number"
							bind:value={formPricePerDay}
							min="50000"
							step="5000"
							class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-bold focus:border-orange-500 focus:outline-none"
							required
						/>
						<span class="text-[10px] text-slate-500">Valor cobrado por día de alquiler</span>
					</div>
					<div>
						<label for="form-dep" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
							Depósito Garantía (COP) *
						</label>
						<input
							id="form-dep"
							type="number"
							bind:value={formDeposit}
							min="100000"
							step="50000"
							class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-semibold focus:border-orange-500 focus:outline-none"
							required
						/>
						<span class="text-[10px] text-slate-500">Bloqueo con tarjeta en mostrador</span>
					</div>
				</div>

				<!-- Fila 4: Especificaciones Técnicas -->
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
					<div>
						<label for="form-trans" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
							Transmisión
						</label>
						<select
							id="form-trans"
							bind:value={formTransmission}
							class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-orange-500 focus:outline-none"
						>
							<option value="AUTOMATICA">Automática</option>
							<option value="MECANICA">Mecánica</option>
							<option value="AUTOMATICA_4X4">Automática 4x4</option>
						</select>
					</div>
					<div>
						<label for="form-fuel" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
							Combustible
						</label>
						<select
							id="form-fuel"
							bind:value={formFuelType}
							class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-orange-500 focus:outline-none"
						>
							<option value="GASOLINA">Gasolina</option>
							<option value="DIESEL">Diésel</option>
							<option value="HIBRIDO">Híbrido</option>
							<option value="ELECTRICO">Eléctrico</option>
						</select>
					</div>
					<div>
						<label for="form-seats" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
							Pasajeros
						</label>
						<input
							id="form-seats"
							type="number"
							bind:value={formSeats}
							min="2"
							max="15"
							class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-orange-500 focus:outline-none"
						/>
					</div>
					<div>
						<label for="form-luggage" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
							Maletas
						</label>
						<input
							id="form-luggage"
							type="text"
							bind:value={formLuggage}
							placeholder="Ej: 3 Maletas"
							class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-orange-500 focus:outline-none"
						/>
					</div>
				</div>

				<!-- Fila 5: URL de Foto + Vista Previa -->
				<div>
					<label for="form-img" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
						URL de la Foto del Vehículo
					</label>
					<div class="flex gap-3">
						<input
							id="form-img"
							type="url"
							bind:value={formImage}
							placeholder="https://images.unsplash.com/..."
							class="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-orange-500 focus:outline-none"
						/>
						{#if formImage}
							<img
								src={formImage}
								alt="Vista previa"
								class="w-12 h-9 object-cover rounded-lg border border-slate-700 shrink-0"
							/>
						{/if}
					</div>
				</div>

				<!-- Fila 6: Equipamiento -->
				<div>
					<label for="form-feat" class="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
						Características (Separadas por comas)
					</label>
					<input
						id="form-feat"
						type="text"
						bind:value={formFeatures}
						placeholder="Apple CarPlay, Cámara 360°, Frenado Autónomo, Vidrios Eléctricos"
						class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-orange-500 focus:outline-none"
					/>
				</div>

				<!-- Fila 7: Switch Habilitado -->
				<div class="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
					<div>
						<label for="form-avail" class="text-xs font-bold text-white block cursor-pointer">Disponible en la Web</label>
						<p class="text-[10px] text-slate-400">Si lo desactivas, los clientes no podrán verlo ni reservarlo en la página pública.</p>
					</div>
					<input
						id="form-avail"
						type="checkbox"
						bind:checked={formAvailable}
						class="w-5 h-5 accent-orange-500 cursor-pointer"
					/>
				</div>

				<!-- Acciones -->
				<div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
					<button
						type="button"
						onclick={() => (modalOpen = false)}
						class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
					>
						Cancelar
					</button>
					<button
						type="submit"
						disabled={saving}
						class="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
					>
						{#if saving}
							<i class="fa-solid fa-circle-notch fa-spin"></i>
							<span>Guardando...</span>
						{:else}
							<i class="fa-solid fa-check"></i>
							<span>{isEditing ? 'Guardar Cambios' : 'Crear Vehículo'}</span>
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
