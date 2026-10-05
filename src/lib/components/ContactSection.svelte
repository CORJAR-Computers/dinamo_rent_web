<script lang="ts">
  import {
    CONTACT_PHONES,
    OFFICE_ADDRESS_CITY,
    OFFICE_QUERY,
    telLink,
    whatsappLinkFor
  } from '$lib/data/contact';
  import { CONTACT_SECTION } from '$lib/data/sections';

  const WHATSAPP_TEXT = 'Hola%20Dinamo%20Rent%20a%20Car,%20deseo%20información%20para%20un%20alquiler';

  // URL de Google Maps de la oficina (la query viene de contact.ts)
  const MAPS_LINK = `https://www.google.com/maps/search/?api=1&query=${OFFICE_QUERY}`;
  const MAPS_EMBED = `https://www.google.com/maps?q=${OFFICE_QUERY}&hl=es&z=16&output=embed`;
</script>

<section id={CONTACT_SECTION.id} class="py-16 bg-slate-900/40 border-t border-slate-800">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center space-y-3">
      <div class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
        <i class="fa-solid fa-headset"></i> Contáctanos
      </div>
      <h2 class="font-heading font-black text-3xl sm:text-4xl text-white tracking-tight">
        Central de Reservas 24/7
      </h2>
      <p class="text-slate-400 text-sm max-w-xl mx-auto">
        Llámanos o escríbenos por WhatsApp: atendemos entregas en el aeropuerto, hoteles y toda Cartagena de Indias.
      </p>
    </div>

    <div class="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
      {#each CONTACT_PHONES as phone, i}
        <div class="rounded-2xl bg-slate-900 border border-slate-800 p-6 text-center space-y-4 hover:border-emerald-500/40 transition shadow-xl shadow-slate-950/40">
          <span class="inline-block px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-300">
            {i === 0 ? 'Línea Principal' : 'Línea Alternativa'}
          </span>

          <a
            href={telLink(phone)}
            class="flex items-center justify-center gap-2 font-heading font-black text-xl sm:text-2xl text-white hover:text-orange-400 transition"
          >
            <i class="fa-solid fa-phone text-orange-400 text-base"></i>
            {phone}
          </a>

          <div class="flex items-center justify-center gap-3">
            <a
              href={telLink(phone)}
              class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition active:scale-95"
            >
              <i class="fa-solid fa-phone mr-1.5"></i> Llamar
            </a>
            <a
              href={whatsappLinkFor(phone, WHATSAPP_TEXT)}
              target="_blank"
              rel="noopener noreferrer"
              class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition active:scale-95"
            >
              <i class="fa-brands fa-whatsapp mr-1.5"></i> WhatsApp
            </a>
          </div>
        </div>
      {/each}
    </div>

    <!-- Mapa embebido de la oficina -->
    <div class="mt-8 max-w-3xl mx-auto rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-xl shadow-slate-950/40">
      <div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-800">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-300">
          <i class="fa-solid fa-location-dot text-orange-400 mr-1.5"></i> Nuestra Oficina — Crespo
        </span>
        <a
          href={MAPS_LINK}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition whitespace-nowrap"
        >
          Cómo llegar <i class="fa-solid fa-arrow-up-right-from-square ml-1"></i>
        </a>
      </div>
      <iframe
        title="Mapa de la oficina Dinamo Rent a Car — {OFFICE_ADDRESS_CITY}"
        src={MAPS_EMBED}
        class="w-full h-72 sm:h-80 border-0"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        allowfullscreen
      ></iframe>
    </div>

    <p class="mt-8 text-center text-xs text-slate-500">
      <a
        href={MAPS_LINK}
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-white transition"
      >
        <i class="fa-solid fa-location-dot text-orange-400 mr-1.5"></i> Oficina: {OFFICE_ADDRESS_CITY}
      </a>
      <span class="text-slate-700 mx-2">•</span>
      <i class="fa-solid fa-envelope text-cyan-400 mr-1.5"></i> reservas@dinamorent.com
      <span class="text-slate-700 mx-2">•</span>
      <i class="fa-solid fa-clock text-emerald-400 mr-1.5"></i> Lunes a Domingo, 24 Horas
    </p>
  </div>
</section>
