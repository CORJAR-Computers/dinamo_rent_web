<script lang="ts">
  import {
    CONTACT_PHONES,
    OFFICE_ADDRESS,
    OFFICE_ADDRESS_CITY,
    telLink,
    whatsappLink
  } from '$lib/data/contact';

  const ultimaActualizacion = '5 de octubre de 2026';

  const secciones = [
    {
      titulo: '1. Objeto y alcance',
      parrafos: [
        'Estos Términos y Condiciones regulan la reserva, contratación y uso de los vehículos ofrecidos por Dinamo Rent a Car Cartagena (en adelante "la Rentadora") a través de su sitio web y canales de reserva directa. Al completar una reserva, el cliente acepta estas condiciones en su totalidad.',
        'Cualquier disposición acordada por escrito entre la Rentadora y el cliente prevalece sobre lo dispuesto aquí.'
      ]
    },
    {
      titulo: '2. Requisitos para conducir',
      parrafos: [
        'El conductor autorizado debe contar con mínimo 25 años de edad y con licencia de conducción categoría B1, B2 o superior, vigente por al menos dos (2) años.',
        'El conductor y los usuarios registrados deben figurar en el contrato de alquiler. La entrega del vehículo a una persona distinta del conductor autorizado está prohibida salvo autorización expresa por escrito de la Rentadora.',
        'El vehículo no puede ser operado bajo los efectos del alcohol, estupefacientes ni de sustancias que alteren la capacidad de conducción, ni por personas sin licencia vigente.'
      ]
    },
    {
      titulo: '3. Reservas, disponibilidad y pagos',
      parrafos: [
        'Una reserva se considera confirmada cuando la Rentadora emite la confirmación por escrito (correo electrónico o WhatsApp) y se ha completado el pago del anticipo o la totalidad acordada, según el plan tarifario.',
        'Los precios se expresan en pesos colombianos (COP) e incluyen los impuestos aplicables. Las tarifas pueden variar por temporada, anticipación y disponibilidad; la tarifa válida es la vigente al momento de la confirmación de la reserva.',
        'El pago en línea se procesa a través de la pasarela Placetopay. La Rentadora no almacena datos completos de tarjetas de crédito o débito.',
        'Al recoger el vehículo se constituye una garantía (depósito) que se bloquea como hold en la tarjeta del titular. El monto y la duración del bloqueo se informan antes de confirmar la reserva.'
      ]
    },
    {
      titulo: '4. Uso permitido del vehículo',
      parrafos: [
        'El vehículo está destinado exclusivamente al uso personal y comercial ligero del cliente, en territorio colombiano, salvo autorización previa y por escrito para cruzar fronteras internacionales.',
        'Queda prohibido: usarlo en competencias o pruebas de velocidad; subcontratarlo o arrendarlo a terceros; transportar mercancías peligrosas o exceder la capacidad de pasajeros indicada; utilizarlo para actividades ilícitas; realizar modificaciones mecánicas o estéticas; y abandonarlo fuera del territorio de Bolívar sin avisar.',
        'El incumplimiento de estas condiciones faculta a la Rentadora a dar por terminado el contrato sin reembolso y a perseguir las responsabilidades civiles y penales que correspondan.'
      ]
    },
    {
      titulo: '5. Combustible, kilometraje y devolución',
      parrafos: [
        'El vehículo se entrega con el tanque lleno y debe devolverse en las mismas condiciones. De lo contrario se cobra el tanqueo completo más un cargo administrativo de $30.000 COP por gestión.',
        'El kilometraje se registra en el contrato a la salida y a la entrada. Los planes con kilometraje ilimitado aplican a uso normal por carretera; el uso fuera de pavimento que genere desgaste prematuro puede generar cargos adicionales.',
        'La devolución fuera del horario pactado genera una penalidad proporcional a la hora adicional, salvo aviso previo y aceptación de la Rentadora. La devolución en lugar, fecha o hora distintos a los acordados debe autorizarse por escrito.'
      ]
    },
    {
      titulo: '6. Coberturas, daños y responsabilidad',
      parrafos: [
        'Los vehículos cuentan con responsabilidad civil extracontractual obligatoria (SOAT) y cobertura de daños propios según el plan contratado, detallado en la sección de Garantías y Coberturas del sitio web y en el contrato.',
        'El cliente es responsable por daños causados por uso indebido, negligencia, conducción bajo los efectos de sustancias, infracciones de tránsito, peajes y multas, las cuales se cobran junto con los gastos administrativos que generen.',
        'Los siniestros deben reportarse de inmediato a la Rentadora y a la aseguradora, con foto y parte de policía cuando aplique. El no reportar un daño se considera ocultamiento y faculta el cobro íntegro de la reparación.'
      ]
    },
    {
      titulo: '7. Cancelaciones, no-show y reembolsos',
      parrafos: [
        'Las cancelaciones con al menos 48 horas de anticipación a la hora de recogida generan reembolso total del anticipo. Entre 48 y 12 horas antes se retiene el 50% del anticipo. Menos de 12 horas antes o la no presentación (no-show) implica la retención del 100% del anticipo.',
        'Los reembolsos aprobados se procesan por el mismo medio de pago dentro de cinco (5) días hábiles, según los tiempos de la pasarela de pago.',
        'Si la Rentadora no puede disponer del vehículo reservado por causa propia, ofrecerá un vehículo equivalente o superior sin costo, o el reembolso total, a elección del cliente.'
      ]
    },
    {
      titulo: '8. Datos de contacto',
      parrafos: [
        'Estos Términos y Condiciones se interpretan conforme a la legislación de la República de Colombia. Para cualquier consulta sobre el contrato o estas condiciones, contáctanos.'
      ]
    }
  ];
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
      {#each secciones as seccion}
        <div class="space-y-3">
          <h2 class="font-heading font-bold text-lg text-white">{seccion.titulo}</h2>
          {#each seccion.parrafos as parrafo}
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
      {#each CONTACT_PHONES as phone}
        <p>
          <i class="fa-solid fa-phone text-orange-400 w-4"></i>
          <a href={telLink(phone)} class="hover:text-white transition">{phone}</a>
        </p>
      {/each}
      <p>
        <i class="fa-brands fa-whatsapp text-emerald-400 w-4"></i>
        <a
          href={whatsappLink('Hola%20Dinamo%20Rent%20a%20Car,%20tengo%20una%20consulta%20sobre%20los%20t%C3%A9rminos%20de%20alquiler')}
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-white transition">Escribir por WhatsApp</a
        >
      </p>
    </div>
  </div>
</section>
