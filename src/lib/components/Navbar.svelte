<script lang="ts">
  import { booking } from '$lib/stores/bookingStore.svelte';

  let isMobileMenuOpen = $state(false);

  function toggleMobileMenu() {
    isMobileMenuOpen = !isMobileMenuOpen;
  }
</script>

<header class="sticky top-0 z-50 w-full backdrop-blur-md bg-slate-950/90 border-b border-slate-800/80 transition-all duration-200 shadow-xl">
  <!-- Top announcement bar -->
  <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/40 text-xs py-1.5 px-4">
    <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-slate-300">
      <div class="flex items-center gap-4 text-xs font-medium">
        <span class="flex items-center gap-1.5 text-orange-400">
          <i class="fa-solid fa-location-dot"></i> Cartagena de Indias, Colombia
        </span>
        <span class="hidden md:inline text-slate-600">•</span>
        <span class="hidden md:flex items-center gap-1.5 text-cyan-400">
          <i class="fa-solid fa-plane-arrival"></i> Entregas en Aeropuerto Rafael Núñez y Hoteles
        </span>
      </div>
      
      <div class="flex items-center gap-3 ml-auto">
        <!-- Currency Selector -->
        <div class="flex items-center bg-slate-800/90 rounded-md p-0.5 border border-slate-700">
          <span class="text-[11px] text-slate-400 px-1.5 font-medium">Moneda:</span>
          <button 
            type="button"
            class="px-2 py-0.5 text-xs font-bold rounded transition {booking.currency === 'COP' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}"
            onclick={() => (booking.currency = 'COP')}
          >
            COP ($)
          </button>
          <button 
            type="button"
            class="px-2 py-0.5 text-xs font-bold rounded transition {booking.currency === 'USD' ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}"
            onclick={() => (booking.currency = 'USD')}
          >
            USD ($)
          </button>
        </div>

        <a 
          href="https://wa.me/573000000000?text=Hola%20Dinamo%20Rent%20a%20Car,%20deseo%20asistencia%20con%20un%20alquiler" 
          target="_blank"
          rel="noopener noreferrer"
          class="hidden sm:inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition text-xs font-semibold"
        >
          <i class="fa-brands fa-whatsapp"></i> +57 300 000 0000
        </a>
      </div>
    </div>
  </div>

  <!-- Main Navigation -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-20">
      
      <!-- Brand Logo -->
      <a href="/" class="flex items-center gap-3 group focus:outline-none">
        <div class="relative w-12 h-14 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
          <img 
            src="/images/logo-dinamo.png" 
            alt="Dinamo Rent a Car Logo" 
            class="w-full h-full object-contain drop-shadow-[0_4px_12px_rgba(255,107,0,0.3)]"
          />
        </div>
        <div class="flex flex-col">
          <span class="font-heading font-black text-2xl tracking-tight text-white flex items-center gap-1 leading-none">
            DINAMO <span class="text-orange-500 text-sm font-semibold tracking-normal uppercase px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/30">Rent a Car</span>
          </span>
          <span class="text-[11px] font-medium text-slate-400 tracking-wider uppercase mt-1">
            Cartagena de Indias
          </span>
        </div>
      </a>

      <!-- Desktop Links -->
      <nav class="hidden md:flex items-center gap-8">
        <a href="#flota" class="text-sm font-semibold text-slate-300 hover:text-orange-400 transition-colors">
          Nuestra Flota
        </a>
        <a href="#proceso" class="text-sm font-semibold text-slate-300 hover:text-orange-400 transition-colors">
          ¿Cómo Funciona?
        </a>
        <a href="#garantias" class="text-sm font-semibold text-slate-300 hover:text-cyan-400 transition-colors">
          Garantías & Coberturas
        </a>
        <a href="#ubicaciones" class="text-sm font-semibold text-slate-300 hover:text-orange-400 transition-colors">
          Ubicaciones
        </a>
      </nav>

      <!-- Desktop CTA Button -->
      <div class="hidden md:flex items-center gap-3">
        <a 
          href="#flota"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition shadow-lg shadow-orange-500/25 active:scale-95"
        >
          <i class="fa-solid fa-car-side"></i>
          <span>Cotizar Flota</span>
        </a>
      </div>

      <!-- Mobile Menu Toggle -->
      <div class="flex md:hidden items-center gap-2">
        <button 
          type="button" 
          class="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
          onclick={toggleMobileMenu}
          aria-label="Abrir menú"
        >
          <i class="fa-solid {isMobileMenuOpen ? 'fa-xmark' : 'fa-bars'} text-lg"></i>
        </button>
      </div>

    </div>
  </div>

  <!-- Mobile Dropdown -->
  {#if isMobileMenuOpen}
    <div class="md:hidden bg-slate-900 border-b border-slate-800 px-4 pt-2 pb-6 space-y-3">
      <a 
        href="#flota" 
        class="block py-2 text-base font-semibold text-slate-200 hover:text-orange-400"
        onclick={() => (isMobileMenuOpen = false)}
      >
        <i class="fa-solid fa-car w-6 text-orange-400"></i> Nuestra Flota
      </a>
      <a 
        href="#proceso" 
        class="block py-2 text-base font-semibold text-slate-200 hover:text-orange-400"
        onclick={() => (isMobileMenuOpen = false)}
      >
        <i class="fa-solid fa-circle-check w-6 text-cyan-400"></i> ¿Cómo Funciona?
      </a>
      <a 
        href="#garantias" 
        class="block py-2 text-base font-semibold text-slate-200 hover:text-cyan-400"
        onclick={() => (isMobileMenuOpen = false)}
      >
        <i class="fa-solid fa-shield-halved w-6 text-emerald-400"></i> Garantías & Coberturas
      </a>
      <a 
        href="#ubicaciones" 
        class="block py-2 text-base font-semibold text-slate-200 hover:text-orange-400"
        onclick={() => (isMobileMenuOpen = false)}
      >
        <i class="fa-solid fa-map-location-dot w-6 text-amber-400"></i> Ubicaciones en Cartagena
      </a>
      
      <div class="pt-3 border-t border-slate-800 flex flex-col gap-2">
        <a 
          href="https://wa.me/573000000000?text=Hola%20Dinamo%20Rent%20a%20Car,%20deseo%20cotizar%20un%20vehículo" 
          target="_blank"
          rel="noopener noreferrer"
          class="w-full text-center py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2"
        >
          <i class="fa-brands fa-whatsapp text-lg"></i> WhatsApp Directo
        </a>
      </div>
    </div>
  {/if}
</header>
