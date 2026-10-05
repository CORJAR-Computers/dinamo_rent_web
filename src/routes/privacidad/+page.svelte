<script lang="ts">
  import {
    CONTACT_PHONES,
    OFFICE_ADDRESS_CITY,
    telLink,
    whatsappLink
  } from '$lib/data/contact';

  const ultimaActualizacion = '5 de octubre de 2026';

  const datos = [
    'Datos de identificación y contacto (nombre, documento, correo, teléfono).',
    'Datos de la reserva: fechas, lugares de recogida y devolución, y preferencias de vehículo.',
    'Datos de conducción: número y categoría de la licencia.',
    'Datos de pago y transacciones (la tarjeta completa no se almacena: el procesamiento lo hace la pasarela Placetopay).',
    'Datos de uso del servicio: contrato, kilometraje, incidentes y comunicaciones de soporte.',
    'Datos técnicos de navegación en el sitio (dirección IP, tipo de navegador y páginas visitadas).'
  ];

  const finalidades = [
    'Gestionar reservas, contratos de alquiler, entregas, devoluciones y cobros.',
    'Verificar identidad y habilitación legal para conducir.',
    'Procesar pagos y prevenir fraude a través de la pasarela Placetopay.',
    'Atender consultas, reclamos y solicitudes de soporte.',
    'Cumplir obligaciones legales, contables y de autoridades competentes.',
    'Enviar información comercial y promociones, solo si has dado tu consentimiento expreso, el cual puedes revocar en cualquier momento.'
  ];

  const derechos = [
    'Conocer qué datos personales tuyos tenemos y para qué los usamos.',
    'Solicitar la actualización o rectificación de datos inexactos.',
    'Solicitar la prueba del tratamiento autorizado cuando sea requerido.',
    'Solicitar la supresión de tus datos cuando ya no sean necesarios (derecho al olvido).',
    'Revocar en cualquier momento el consentimiento otorgado para tratamientos específicos.'
  ];
</script>

<svelte:head>
  <title>Política de Privacidad | Dinamo Rent a Car</title>
  <meta
    name="description"
    content="Política de tratamiento de datos personales y habeas data de Dinamo Rent a Car Cartagena, conforme a la Ley 1581 de 2012."
  />
</svelte:head>

<section class="py-16 md:py-24 bg-slate-950">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center space-y-3">
      <div
        class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-wider"
      >
        <i class="fa-solid fa-user-shield"></i> Habeas Data
      </div>
      <h1 class="font-heading font-black text-3xl sm:text-4xl text-white tracking-tight">
        Política de Privacidad
      </h1>
      <p class="text-slate-400 text-sm">
        Tratamiento de datos personales conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013.
        <br />Última actualización: {ultimaActualizacion}
      </p>
    </div>

    <div class="mt-12 space-y-10">
      <div class="space-y-3">
        <h2 class="font-heading font-bold text-lg text-white">1. Responsable del tratamiento</h2>
        <p class="text-slate-400 text-sm leading-relaxed">
          Dinamo Rent a Car Cartagena es responsable del tratamiento de tus datos personales. Puedes
          ejercer tus derechos o consultar esta política en {OFFICE_ADDRESS_CITY} o a través de
          nuestros canales de contacto al final de esta página.
        </p>
      </div>

      <div class="space-y-3">
        <h2 class="font-heading font-bold text-lg text-white">2. Datos que recopilamos</h2>
        <ul class="space-y-2 text-slate-400 text-sm leading-relaxed">
          {#each datos as item}
            <li class="flex items-start gap-2">
              <i class="fa-solid fa-database text-cyan-400 mt-1 text-xs"></i>
              <span>{item}</span>
            </li>
          {/each}
        </ul>
      </div>

      <div class="space-y-3">
        <h2 class="font-heading font-bold text-lg text-white">3. Finalidades del tratamiento</h2>
        <ul class="space-y-2 text-slate-400 text-sm leading-relaxed">
          {#each finalidades as item}
            <li class="flex items-start gap-2">
              <i class="fa-solid fa-check text-emerald-400 mt-1 text-xs"></i>
              <span>{item}</span>
            </li>
          {/each}
        </ul>
      </div>

      <div class="space-y-3">
        <h2 class="font-heading font-bold text-lg text-white">
          4. Autorización, conservación y transferencia
        </h2>
        <p class="text-slate-400 text-sm leading-relaxed">
          Al reservar autorizas el tratamiento de tus datos para las finalidades indicadas. Conservamos
          la información mientras dure la relación comercial y por los plazos que exijan la normativa
          tributaria y comercial. No vendemos tus datos personales. Solo los compartimos con quien sea
          estrictamente necesario: la pasarela de pago, las aseguradoras cuando haya un siniestro, y las
          autoridades cuando exista un requerimiento legal.
        </p>
      </div>

      <div class="space-y-3">
        <h2 class="font-heading font-bold text-lg text-white">5. Tus derechos</h2>
        <ul class="space-y-2 text-slate-400 text-sm leading-relaxed">
          {#each derechos as item}
            <li class="flex items-start gap-2">
              <i class="fa-solid fa-shield-halved text-cyan-400 mt-1 text-xs"></i>
              <span>{item}</span>
            </li>
          {/each}
        </ul>
        <p class="text-slate-400 text-sm leading-relaxed">
          Para ejercer cualquiera de estos derechos, escríbenos indicando tu nombre, documento y la
          solicitud. Respondemos en los términos que establece la Ley 1581 de 2012.
        </p>
      </div>

      <div class="space-y-3">
        <h2 class="font-heading font-bold text-lg text-white">6. Cookies</h2>
        <p class="text-slate-400 text-sm leading-relaxed">
          Usamos cookies técnicas necesarias para el funcionamiento del sitio (sesión, carrito de
          reserva y seguridad). Puedes deshabilitarlas desde la configuración de tu navegador, sabiendo
          que algunas funciones dejarán de operar correctamente.
        </p>
      </div>

      <div class="space-y-3">
        <h2 class="font-heading font-bold text-lg text-white">7. Cambios a esta política</h2>
        <p class="text-slate-400 text-sm leading-relaxed">
          Podemos actualizar esta política para reflejar cambios normativos u operativos. La fecha de
          última actualización al inicio de la página indica cuándo entró en vigencia la versión vigente.
        </p>
      </div>
    </div>

    <div
      class="mt-12 rounded-2xl bg-slate-900 border border-slate-800 p-6 text-sm text-slate-400 space-y-2"
    >
      <p class="font-semibold text-white">Contacto para ejercer tus derechos</p>
      {#each CONTACT_PHONES as phone}
        <p>
          <i class="fa-solid fa-phone text-cyan-400 w-4"></i>
          <a href={telLink(phone)} class="hover:text-white transition">{phone}</a>
        </p>
      {/each}
      <p>
        <i class="fa-brands fa-whatsapp text-emerald-400 w-4"></i>
        <a
          href={whatsappLink('Hola%20Dinamo%20Rent%20a%20Car,%20quiero%20ejercer%20mis%20derechos%20de%20datos%20personales')}
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-white transition">Escribir por WhatsApp</a
        >
      </p>
    </div>
  </div>
</section>
