<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { booking } from '$lib/stores/bookingStore.svelte';
  import { PRIMARY_PHONE, whatsappLink } from '$lib/data/contact';
  import {
    SECTIONS,
    FLEET_SECTION,
    PROCESS_SECTION,
    GUARANTEES_SECTION,
    CONTACT_SECTION,
    LOCATIONS_SECTION,
    type Section
  } from '$lib/data/sections';

  let isMobileMenuOpen = $state(false);
  let activeSection = $state('');

  /** Altura del header sticky (~110px) + margen: la sección es "activa" al cruzar esta línea. */
  const HEADER_OFFSET = 140;

  type LinkStyle = { active: string; inactive: string };
  type MobileStyle = { icon: string } & LinkStyle;

  /**
   * Color de los enlaces del menú, indexado por el objeto sección (no por el id)
   * para que renombrar una sección no pierda sus estilos. Por defecto: naranja.
   */
  const DESKTOP_STYLE = new Map<Section, LinkStyle>([
    [
      GUARANTEES_SECTION,
      {
        active: 'text-cyan-400 underline decoration-cyan-500/60 underline-offset-8',
        inactive: 'text-slate-300 hover:text-cyan-400'
      }
    ],
    [
      CONTACT_SECTION,
      {
        active: 'text-emerald-400 underline decoration-emerald-500/60 underline-offset-8',
        inactive: 'text-slate-300 hover:text-emerald-400'
      }
    ]
  ]);
  const DEFAULT_DESKTOP_STYLE: LinkStyle = {
    active: 'text-orange-400 underline decoration-orange-500/60 underline-offset-8',
    inactive: 'text-slate-300 hover:text-orange-400'
  };

  /** Icono y color de cada enlace en el menú móvil (por defecto: naranja). */
  const MOBILE_STYLE = new Map<Section, MobileStyle>([
    [FLEET_SECTION, { icon: 'fa-car w-6 text-orange-400', active: 'bg-slate-800 text-orange-400', inactive: 'text-slate-200 hover:text-orange-400' }],
    [PROCESS_SECTION, { icon: 'fa-circle-check w-6 text-cyan-400', active: 'bg-slate-800 text-orange-400', inactive: 'text-slate-200 hover:text-orange-400' }],
    [GUARANTEES_SECTION, { icon: 'fa-shield-halved w-6 text-emerald-400', active: 'bg-slate-800 text-cyan-400', inactive: 'text-slate-200 hover:text-cyan-400' }],
    [LOCATIONS_SECTION, { icon: 'fa-map-location-dot w-6 text-amber-400', active: 'bg-slate-800 text-orange-400', inactive: 'text-slate-200 hover:text-orange-400' }],
    [CONTACT_SECTION, { icon: 'fa-headset w-6 text-emerald-400', active: 'bg-slate-800 text-emerald-400', inactive: 'text-slate-200 hover:text-emerald-400' }]
  ]);
  const DEFAULT_MOBILE_STYLE: MobileStyle = {
    icon: 'fa-circle w-6 text-orange-400',
    active: 'bg-slate-800 text-orange-400',
    inactive: 'text-slate-200 hover:text-orange-400'
  };

  const desktopStyle = (s: Section): LinkStyle => DESKTOP_STYLE.get(s) ?? DEFAULT_DESKTOP_STYLE;
  const mobileStyle = (s: Section): MobileStyle => MOBILE_STYLE.get(s) ?? DEFAULT_MOBILE_STYLE;

  function toggleMobileMenu() {
    isMobileMenuOpen = !isMobileMenuOpen;
  }

  /** Marca como activa la sección cuyo inicio esté más cerca de cruzar la línea del header. */
  function updateActiveSection() {
    let best = '';
    let bestDistance = Infinity;
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (!el) continue;
      const crossedBy = HEADER_OFFSET - el.getBoundingClientRect().top;
      if (crossedBy > 0 && crossedBy < bestDistance) {
        bestDistance = crossedBy;
        best = s.href;
      }
    }
    // Al llegar al final de la página, activa la última sección (el footer es
    // más bajo que el viewport, así que su inicio nunca cruza la línea del header).
    const last = SECTIONS[SECTIONS.length - 1];
    const nearBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (nearBottom && document.getElementById(last.id)) best = last.href;

    if (best !== activeSection) activeSection = best;
  }

  onMount(() => {
    // Se actualiza directo en el evento scroll: la medición es barata (5 rects)
    // y así no depende de requestAnimationFrame, que puede quedar pausado si la
    // pestaña está en segundo plano (dejaría el menú "congelado").
    const onScroll = () => updateActiveSection();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    updateActiveSection();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  });

  // Recalcula al navegar entre rutas (las secciones solo existen en la home).
  afterNavigate(updateActiveSection);
</script>

<header class="sticky top-0 z-50 w-full backdrop-blur-md bg-slate-950/90 border-b border-slate-800/80 transition-all duration-200 shadow-xl">
  <!-- Top announcement bar -->
  <div class="bg-linear-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/40 text-xs py-1.5 px-4">
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
          href={whatsappLink('Hola%20Dinamo%20Rent%20a%20Car,%20deseo%20asistencia%20con%20un%20alquiler')}
          target="_blank"
          rel="noopener noreferrer"
          class="hidden sm:inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition text-xs font-semibold"
        >
          <i class="fa-brands fa-whatsapp"></i> {PRIMARY_PHONE}
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
        {#each SECTIONS as s (s.id)}
          {@const st = desktopStyle(s)}
          <a
            href={s.href}
            aria-current={activeSection === s.href ? 'true' : undefined}
            class="text-sm font-semibold transition-colors {activeSection === s.href ? st.active : st.inactive}"
          >
            {s.label}
          </a>
        {/each}
      </nav>

      <!-- Desktop CTA Button -->
      <div class="hidden md:flex items-center gap-3">
        <a 
          href={FLEET_SECTION.href}
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-linear-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition shadow-lg shadow-orange-500/25 active:scale-95"
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
      {#each SECTIONS as s (s.id)}
        {@const st = mobileStyle(s)}
        <a 
          href={s.href} 
          aria-current={activeSection === s.href ? 'true' : undefined}
          class="block py-2 px-3 -mx-3 rounded-lg text-base font-semibold transition-colors {activeSection === s.href ? st.active : st.inactive}"
          onclick={() => (isMobileMenuOpen = false)}
        >
          <i class="fa-solid {st.icon}"></i> {s.label}
        </a>
      {/each}
      
      <div class="pt-3 border-t border-slate-800 flex flex-col gap-2">
        <a 
          href={whatsappLink('Hola%20Dinamo%20Rent%20a%20Car,%20deseo%20cotizar%20un%20vehículo')}
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
