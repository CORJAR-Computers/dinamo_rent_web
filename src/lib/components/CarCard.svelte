<script lang="ts">
  import type { Vehicle } from '$lib/data/fleet';
  import { booking } from '$lib/stores/bookingStore.svelte';
  import { formatCurrency } from '$lib/utils/formatters';

  interface Props {
    vehicle: Vehicle;
  }

  let { vehicle }: Props = $props();

  let totalEstimated = $derived(vehicle.priceCOP * booking.rentalDays);
</script>

<div class="group relative rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-orange-500/50 transition-all duration-300 flex flex-col overflow-hidden hover:shadow-2xl hover:shadow-orange-500/10 hover:-translate-y-1">
  
  <!-- Image Container with Badge -->
  <div class="relative h-56 w-full overflow-hidden bg-slate-950">
    <img 
      src={vehicle.image} 
      alt={vehicle.name}
      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      loading="lazy"
    />
    <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent"></div>
    
    <!-- Top Badges -->
    <div class="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
      <span class="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-orange-500 text-white shadow-md">
        {vehicle.badge}
      </span>
      <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900/90 text-slate-300 border border-slate-700/80 backdrop-blur-md">
        {vehicle.categoryLabel}
      </span>
    </div>

    <!-- Plate snippet -->
    <div class="absolute bottom-3 left-4">
      <span class="text-[11px] font-mono text-slate-400 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded border border-white/10">
        Placa Ref: {vehicle.plate}
      </span>
    </div>
  </div>

  <!-- Content Section -->
  <div class="p-6 flex-1 flex flex-col justify-between space-y-5">
    
    <div>
      <h3 class="font-heading font-black text-xl text-white group-hover:text-orange-400 transition-colors">
        {vehicle.name}
      </h3>

      <!-- Vehicle Specs Grid -->
      <div class="mt-4 grid grid-cols-2 gap-2.5 text-xs text-slate-300">
        <div class="flex items-center gap-2 p-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
          <i class="fa-solid fa-users text-orange-400 w-4 text-center"></i>
          <span>{vehicle.passengers} Pasajeros</span>
        </div>
        <div class="flex items-center gap-2 p-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
          <i class="fa-solid fa-gears text-cyan-400 w-4 text-center"></i>
          <span>{vehicle.transmission}</span>
        </div>
        <div class="flex items-center gap-2 p-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
          <i class="fa-solid fa-suitcase text-amber-400 w-4 text-center"></i>
          <span>{vehicle.luggage}</span>
        </div>
        <div class="flex items-center gap-2 p-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
          <i class="fa-solid fa-snowflake text-sky-400 w-4 text-center"></i>
          <span>Aire Acondicionado</span>
        </div>
      </div>

      <!-- Feature Bullets -->
      <div class="mt-3.5 space-y-1">
        {#each vehicle.features.slice(0, 2) as feat}
          <div class="flex items-center gap-1.5 text-xs text-slate-400">
            <i class="fa-solid fa-check text-emerald-400 text-[10px]"></i>
            <span>{feat}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Pricing and Action -->
    <div class="pt-4 border-t border-slate-800 flex items-end justify-between gap-4">
      
      <div>
        <div class="flex items-baseline gap-1">
          <span class="font-heading font-black text-2xl sm:text-3xl text-white">
            {formatCurrency(vehicle.priceCOP, booking.currency, booking.usdRate)}
          </span>
          <span class="text-xs text-slate-400 font-medium">/ día</span>
        </div>
        
        <div class="text-[11px] text-slate-400 mt-0.5">
          Total {booking.rentalDays} día{booking.rentalDays > 1 ? 's' : ''}: 
          <strong class="text-orange-400 font-semibold">{formatCurrency(totalEstimated, booking.currency, booking.usdRate)}</strong>
        </div>

        <div class="text-[10px] text-slate-500">
          Garantía: {formatCurrency(vehicle.depositCOP, booking.currency, booking.usdRate)}
        </div>
      </div>

      <!-- Reserve CTA -->
      <button 
        type="button"
        onclick={() => booking.openBooking(vehicle)}
        class="px-5 py-2.5 rounded-xl font-heading font-bold text-sm text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition shadow-lg shadow-orange-500/20 active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
      >
        <span>Reservar</span>
        <i class="fa-solid fa-arrow-right text-xs"></i>
      </button>

    </div>

  </div>

</div>
