/**
 * Texto canónico de los Términos y Condiciones.
 *
 * Lo renderiza `/terminos` y el servidor lo usa para calcular el SHA-256 que se
 * guarda con cada reserva. Al vivir en un solo sitio, el hash no puede describir
 * un texto distinto del que el cliente vio.
 *
 * AL EDITAR EL TEXTO: sube `TERMS_VERSION` y `TERMS_UPDATED_LABEL` a la fecha
 * del cambio. El hash se recalcula solo, pero la versión es lo que permite
 * decir qué documento aceptó cada reserva histórica.
 */
export const TERMS_VERSION = '2026-11-23';
export const TERMS_UPDATED_LABEL = '23 de noviembre de 2026';

/**
 * Mínimos del registro manual del consentimiento (responsable y soporte). Los
 * comparten el endpoint y el formulario del panel, para que el botón y el
 * servidor no exijan cosas distintas.
 */
export const MANUAL_CONSENT_MIN = { registeredBy: 3, note: 10 } as const;

export const TERMS_SECTIONS = [
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
      'Una reserva se considera confirmada cuando la Rentadora emite la confirmación por escrito (por WhatsApp o mediante el comprobante de la reserva en la web) y se ha completado el pago del anticipo o la totalidad acordada, según el plan tarifario.',
      'Los precios se expresan en pesos colombianos (COP) e incluyen los impuestos aplicables. Las tarifas pueden variar por temporada, anticipación y disponibilidad; la tarifa válida es la vigente al momento de la confirmación de la reserva.',
      'El pago en línea se procesa a través de la pasarela Placetopay. La Rentadora no almacena el número completo de la tarjeta, el código de seguridad ni la fecha de vencimiento: esos datos se capturan exclusivamente en la pasarela, certificada bajo PCI-DSS.',
      'La garantía del alquiler se constituye mediante la tokenización de la tarjeta del titular en Placetopay. Al pagar, el cliente autoriza la vinculación de su tarjeta como respaldo del depósito y de los deducibles del vehículo. Esto no es un bloqueo (hold) ni un cargo anticipado: no se congela cupo ni se debita suma alguna en el momento de la vinculación.',
      'Como resultado de esa vinculación, Placetopay entrega a la Rentadora un token de pago (identificador seguro que no contiene los datos de la tarjeta) y la tarjeta queda almacenada bajo ese token para efectuar cobros posteriores. La Rentadora conserva únicamente el token, la franquicia y los últimos cuatro dígitos enmascarados, nunca el número completo ni el código de seguridad.',
      'Los cobros posteriores sobre la tarjeta almacenada se limitan a hechos contractuales comprobados: deducibles o daños no cubiertos por la póliza con acta de entrega y devolución, faltante de combustible, días u horas adicionales de alquiler y comparendos o multas de tránsito (SIMIT) imputables al cliente. Cada cobro se informa al cliente con su concepto, valor y soporte, y queda registrado en el historial de la reserva.',
      'La autorización de almacenamiento se mantiene mientras subsista la relación contractual y hasta la liquidación final de la reserva. El token se invalida cuando el cliente lo solicite, cuando la tarjeta expire, o cuando la pasarela rechace un cobro por tarjeta reportada como robada, perdida, bloqueada o inválida. En caso de rechazo por fondos insuficientes se realizan como máximo tres (3) intentos antes de invalidarlo.'
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
] as const;

/**
 * Texto plano exacto que se hashea: título de cada sección y sus párrafos en
 * orden, separados por línea en blanco. Si se cambia el formato, todas las
 * reservas nuevas pasan a otra versión del hash (correcto: el documento cambió).
 */
export const TERMS_TEXT = TERMS_SECTIONS.map(
  (seccion) => `${seccion.titulo}\n\n${seccion.parrafos.join('\n\n')}`
).join('\n\n');
