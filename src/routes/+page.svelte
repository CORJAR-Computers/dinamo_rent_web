<script lang="ts">
  import HeroSearch from '$lib/components/HeroSearch.svelte';
  import FleetCatalog from '$lib/components/FleetCatalog.svelte';
  import ProcessSteps from '$lib/components/ProcessSteps.svelte';
  import TrustBadges from '$lib/components/TrustBadges.svelte';

  let { data } = $props();

  let openFaq = $state<number | null>(0);

  const FAQS = [
    {
      q: '¿Cómo funciona la entrega del auto en el Aeropuerto Rafael Núñez?',
      a: 'Nuestro asesor te esperará en la sala de llegadas nacionales o internacionales con un cartel a tu nombre. Realizamos la inspección digital con fotos en tu presencia y te entregamos las llaves inmediatamente, sin filas ni traslados a oficinas externas.'
    },
    {
      q: '¿Qué es el bloqueo de garantía y qué tarjetas aceptan?',
      a: 'Para la entrega de cualquier vehículo se requiere una tarjeta de crédito física (Visa, MasterCard o American Express) a nombre del titular. Se realiza una pre-autorización temporal de cupo que oscila entre $900.000 y $3.500.000 COP según la categoría del auto. No es un cobro y se libera al devolver el auto en el mismo estado.'
    },
    {
      q: '¿Puedo pagar el valor del alquiler en efectivo, débito o transferencia bancaria?',
      a: 'Sí. El costo de los días de alquiler puedes pagarlo en efectivo (COP o USD), tarjeta de débito, transferencia bancaria (Bancolombia, Nequi, Daviplata) o pasarela digital. La tarjeta de crédito se solicita únicamente para respaldar la garantía temporal.'
    },
    {
      q: '¿Los vehículos cuentan con kilometraje ilimitado?',
      a: 'Sí, todas nuestras tarifas estándar para alquileres de 2 o más días incluyen kilometraje libre dentro del territorio de la Costa Caribe colombiana.'
    },
    {
      q: '¿Puedo salir de Cartagena y viajar a Barranquilla, Santa Marta o La Guajira?',
      a: 'Sí, puedes circular libremente por los departamentos de Bolívar, Atlántico y Magdalena. Si planeas viajar a La Guajira o el interior del país, indícalo al reservar para verificar la cobertura de asistencia vial.'
    }
  ];

  function toggleFaq(index: number) {
    openFaq = openFaq === index ? null : index;
  }
</script>

<svelte:head>
  <title>Dinamo Rent a Car | Alquiler de Autos en Cartagena de Indias</title>
</svelte:head>

<!-- Hero Section with Search Engine -->
<HeroSearch />

<!-- Fleet Catalog Section -->
<FleetCatalog vehicles={data.vehicles} />

<!-- 3 Steps Process -->
<ProcessSteps />

<!-- Guarantees & Transparency -->
<TrustBadges />

<!-- FAQ Section -->
<section class="py-16 md:py-24 bg-slate-950 relative">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
    
    <div class="text-center space-y-3">
      <div class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-bold uppercase tracking-wider">
        <i class="fa-solid fa-circle-question"></i> Preguntas Frecuentes
      </div>
      <h2 class="font-heading font-black text-3xl sm:text-4xl text-white tracking-tight">
        Resolvemos tus Dudas al Instante
      </h2>
      <p class="text-slate-400 text-sm">
        Todo lo que necesitas saber antes de rentar tu vehículo en Cartagena.
      </p>
    </div>

    <!-- FAQ Accordion List -->
    <div class="mt-12 space-y-4">
      {#each FAQS as faq, i}
        <div class="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden transition-colors hover:border-slate-700">
          <button
            type="button"
            class="w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none"
            onclick={() => toggleFaq(i)}
          >
            <span class="font-heading font-bold text-base text-white">
              {faq.q}
            </span>
            <span class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs text-orange-400 shrink-0 transition-transform duration-200 {openFaq === i ? 'rotate-180 bg-orange-500 text-white' : ''}">
              <i class="fa-solid fa-chevron-down"></i>
            </span>
          </button>

          {#if openFaq === i}
            <div class="px-5 pb-5 text-xs sm:text-sm text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3">
              {faq.a}
            </div>
          {/if}
        </div>
      {/each}
    </div>

  </div>
</section>

<!-- Bottom CTA Banner -->
<section class="py-16 bg-gradient-to-b from-slate-950 via-blue-950/40 to-slate-950 border-t border-slate-800">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
    <div class="w-16 h-16 rounded-3xl bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center text-3xl mx-auto">
      <i class="fa-solid fa-key"></i>
    </div>

    <h2 class="font-heading font-black text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight">
      ¿Listo para Iniciar tu Recorrido por Cartagena?
    </h2>

    <p class="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">
      Reserva en menos de 2 minutos y asegura tu vehículo antes de que se agote la disponibilidad para tu fecha.
    </p>

    <div class="pt-2 flex flex-wrap items-center justify-center gap-4">
      <a 
        href="#flota"
        class="px-8 py-3.5 rounded-xl font-heading font-black text-base text-white bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition shadow-xl shadow-orange-500/25 active:scale-95"
      >
        <i class="fa-solid fa-car-side mr-2"></i> Elegir mi Vehículo
      </a>
      <a 
        href="https://wa.me/573000000000?text=Hola%20Dinamo%20Rent%20a%20Car,%20deseo%20asesoría%20para%20un%20alquiler"
        target="_blank"
        rel="noopener noreferrer"
        class="px-8 py-3.5 rounded-xl font-heading font-bold text-base text-emerald-400 bg-slate-900 border border-emerald-500/30 hover:bg-slate-800 transition"
      >
        <i class="fa-brands fa-whatsapp mr-2"></i> Hablar con un Asesor
      </a>
    </div>
  </div>
</section>
