<script lang="ts">
  import {
    CONTACT_PHONES,
    OFFICE_ADDRESS_CITY,
    telLink,
    whatsappLink
  } from '#lib/data/contact.js';
  // El texto vive en un módulo compartido: el servidor hashea exactamente lo
  // que esta página renderiza y guarda ese hash con la reserva.
  import {
    TERMS_SECTIONS as secciones,
    TERMS_UPDATED_LABEL as ultimaActualizacion
  } from '#lib/data/terms.js';
</script>

<svelte:head>
  <title>Términos y Condiciones | Dinamo Rent a Car</title>
  <meta
    name="description"
    content="Condiciones de alquiler de Dinamo Rent a Car Cartagena: requisitos, reservas, pagos, uso del vehículo, coberturas y cancelaciones."
  />
</svelte:head>

<section class="py-16 md:py-24 bg-slate-950">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center space-y-3">
      <div
        class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-bold uppercase tracking-wider"
      >
        <i class="fa-solid fa-file-contract"></i> Legal
      </div>
      <h1 class="font-heading font-black text-3xl sm:text-4xl text-white tracking-tight">
        Términos y Condiciones
      </h1>
      <p class="text-slate-400 text-sm">Última actualización: {ultimaActualizacion}</p>
    </div>

    <div class="mt-12 space-y-10">
      {#each secciones as seccion (seccion.titulo)}
        <div class="space-y-3">
          <h2 class="font-heading font-bold text-lg text-white">{seccion.titulo}</h2>
          {#each seccion.parrafos as parrafo (parrafo)}
            <p class="text-slate-400 text-sm leading-relaxed">{parrafo}</p>
          {/each}
        </div>
      {/each}
    </div>

    <div
      class="mt-12 rounded-2xl bg-slate-900 border border-slate-800 p-6 text-sm text-slate-400 space-y-2"
    >
      <p class="font-semibold text-white">Dinamo Rent a Car Cartagena</p>
      <p>
        <i class="fa-solid fa-location-dot text-orange-400 w-4"></i>
        {OFFICE_ADDRESS_CITY}
      </p>
      {#each CONTACT_PHONES as phone (phone)}
        <p>
          <i class="fa-solid fa-phone text-orange-400 w-4"></i>
          <a href={telLink(phone)} rel="external" class="hover:text-white transition">{phone}</a>
        </p>
      {/each}
      <p>
        <i class="fa-brands fa-whatsapp text-emerald-400 w-4"></i>
        <a
          href={whatsappLink('Hola%20Dinamo%20Rent%20a%20Car,%20tengo%20una%20consulta%20sobre%20los%20t%C3%A9rminos%20de%20alquiler')}
          target="_blank"
          rel="noopener noreferrer external"
          class="hover:text-white transition">Escribir por WhatsApp</a
        >
      </p>
    </div>
  </div>
</section>
