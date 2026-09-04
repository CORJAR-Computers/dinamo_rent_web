<script lang="ts">
  import { FLEET_DATABASE, type Vehicle } from '$lib/data/fleet';
  import CarCard from './CarCard.svelte';

  let selectedCategory = $state<'all' | 'economico' | 'sedan' | 'suv' | 'premium'>('all');

  let filteredFleet = $derived(
    selectedCategory === 'all'
      ? FLEET_DATABASE
      : FLEET_DATABASE.filter((v: Vehicle) => v.category === selectedCategory)
  );

  const CATEGORIES = [
    { id: 'all', label: 'Toda la Flota', icon: 'fa-car' },
    { id: 'economico', label: 'Económicos', icon: 'fa-gas-pump' },
    { id: 'sedan', label: 'Sedanes', icon: 'fa-car-side' },
    { id: 'suv', label: 'SUVs / Camionetas', icon: 'fa-mountain' },
    { id: 'premium', label: 'Gama Alta / 4x4', icon: 'fa-crown' }
  ] as const;
</script>

<section id="flota" class="py-16 md:py-24 bg-slate-950 relative">
  <!-- Subtle ambient glow -->
  <div class="absolute top-1/2 left-0 w-96 h-96 bg-blue-600/5 blur-[120px] rounded-full pointer-events-none"></div>

  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    
    <!-- Section Title -->
    <div class="text-center max-w-3xl mx-auto space-y-3">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-bold uppercase tracking-wider">
        <i class="fa-solid fa-car-rear"></i> Flota Disponible en Cartagena
      </div>
      
      <h2 class="font-heading font-black text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight">
        Elige el Auto Perfecto para tu Viaje
      </h2>
      
      <p class="text-slate-400 text-sm sm:text-base">
        Vehículos modernos, mantenidos rigurosamente, con aire acondicionado de alto rendimiento para el clima de Cartagena.
      </p>
    </div>

    <!-- Category Filter Tabs -->
    <div class="mt-10 flex items-center justify-center flex-wrap gap-2 sm:gap-3">
      {#each CATEGORIES as cat}
        <button
          type="button"
          class="px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all duration-200 flex items-center gap-2 cursor-pointer border {selectedCategory === cat.id ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/25 scale-105' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'}"
          onclick={() => (selectedCategory = cat.id)}
        >
          <i class="fa-solid {cat.icon} text-xs"></i>
          <span>{cat.label}</span>
        </button>
      {/each}
    </div>

    <!-- Vehicles Grid -->
    <div class="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {#each filteredFleet as vehicle (vehicle.id)}
        <CarCard {vehicle} />
      {/each}
    </div>

    <!-- Guarantee Callout -->
    <div class="mt-16 rounded-3xl bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 border border-slate-800 p-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
      <div class="flex items-center gap-5">
        <div class="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-2xl shrink-0">
          <i class="fa-solid fa-file-contract"></i>
        </div>
        <div>
          <h4 class="font-heading font-black text-lg text-white">¿Necesitas un vehículo por semanas o meses?</h4>
          <p class="text-slate-400 text-xs sm:text-sm mt-0.5">Tenemos tarifas especiales corporativas y para alquileres de largo plazo en Cartagena.</p>
        </div>
      </div>
      <a 
        href="https://wa.me/573000000000?text=Hola%20Dinamo%20Rent,%20deseo%20cotizar%20un%20alquiler%20de%20largo%20plazo" 
        target="_blank"
        rel="noopener noreferrer"
        class="px-6 py-3 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition whitespace-nowrap active:scale-95"
      >
        <i class="fa-brands fa-whatsapp mr-2 text-emerald-400"></i> Cotizar Largo Plazo
      </a>
    </div>

  </div>
</section>
