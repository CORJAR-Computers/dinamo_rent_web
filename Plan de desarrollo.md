

Plan de Desarrollo
(CORJAR Computers - Alexis Corpas)

Estrategia de desarrollo: "Frontend First" (Angular PWA) para generar confianza
inmediata mediante avances tangibles fase por fase.

Fase 1: Identidad y Catálogo (La "Vitrina")
Objetivo: Que el cliente vea su sitio web publicado con su logo y flota, aunque los
datos sean estáticos.

## 1.1. Configuración Express
● Crear proyecto Angular e instalar librerías de diseño (Angular Material / Tailwind).
● Configurar Firebase Hosting (solo para subir la web, sin lógica aún).
● Hito Visual: El cliente recibe un link (https://avance.tunegocio.com) que ya abre
en su celular.

1.2. Desarrollo de la Home y Búsqueda
● Maquetar la página de inicio con el banner principal y el buscador de fechas
## (visual).
● Crear las "Tarjetas de Vehículos" con fotos reales de su flota.
● Implementar la navegación: Home -> Detalle del Auto -> Solicitar.

Entregable al Cliente:
"Ya puedes entrar al link desde tu iPhone/Android. Puedes ver el diseño final,
navegar por el catálogo de autos y probar cómo se ve el buscador de fechas."



Fase 2: La Experiencia de Reserva y Firma (Hito)
Objetivo: Mostrar la funcionalidad estrella (Firma Digital) funcionando visualmente.

2.1. Formulario de Check-in (Frontend)
● Diseñar el formulario de "Registro de Conductor" (Cédula, Licencia, Datos).
● Maquetar el componente de Tarjeta de Crédito (Visualmente).
● Integrar el Canvas de Firma Digital:
○ Permitir que el cliente dibuje su firma con el dedo en la pantalla.
○ Botón "Limpiar firma" y "Aceptar".

2.2. Flujo de Pantallas
● Conectar el botón "Solicitar Reserva" a la página de "Gracias / Esperando
## Aprobación".
● Crear la vista de "Contrato PDF" (una vista previa web del documento).

Entregable al Cliente:
"Prueba hacer una reserva. Llena tus datos y, lo más importante: **firma con tu
dedo en la pantalla**. Verás cómo el sistema captura tu trazo. Así será la
experiencia exacta de tus usuarios."




Fase 3: El Panel de Control (Su Herramienta)
Objetivo: Que el cliente sienta el control de la operación.

3.1. Dashboard Administrativo (Frontend)
● Maquetar la tabla de "Solicitudes Recientes".
● Diseñar los botones de acción: "Aprobar", "Rechazar", "Ver Garantía".
● Crear la vista de "Calendario de Ocupación" (con datos de prueba).

3.2. Simulación de Flujo
● Hacer que cuando se dé clic en "Aprobar" en el Admin, cambie visualmente el
estado a "Enviado".
● (Sin conexión real a base de datos aún, usamos datos locales en el navegador
para la demo).

Entregable al Cliente:
"Esta es tu oficina virtual. Mira cómo te llegarán las solicitudes. Prueba los
botones de Aprobar y Rechazar para que te familiarices con tu futuro panel de
control."




Fase 4: Conexión "Cerebral" (Backend Core)
Objetivo: Conectamos lo visual con lo no visual para que sea real.

4.1. Persistencia de Datos (Firestore)
● Conectar el formulario de Angular con Cloud Firestore.
● Hacer que las reservas creadas en el celular aparezcan realmente en el Panel
## Admin.
● Configurar el inicio de sesión real (Login) para Admin y Clientes.

4.2. Lógica de Negocio (Cloud Functions)
● Programar las reglas de seguridad (para que nadie vea datos ajenos).
● Programar la validación de fechas (que no se crucen reservas).

Entregable al Cliente:
"El sistema ya tiene memoria. Crea una reserva real, cierra el navegador y vuelve
a entrar al Admin. Verás que la información ya queda guardada en la nube de
## Google."




Fase 5: Integraciones Críticas (mucho ojo y cuidado,
muchas pruebas) (Pagos y Legalidades)
Objetivo: Activar el dinero y los contratos legales.

5.1. Pasarela de Pagos (PayU / Placetopay)
● Reemplazar el formulario visual de tarjeta por el Secure Iframe real de la
pasarela.
● Conectar la función de Pre-autorización (Bloqueo).
● Realizar pruebas de bloqueo de dinero (monto bajo) con tarjeta real.

5.2. Legalidad y Notificaciones
● Conectar el trazo de la firma con la API de HelloSign/AutenTic para generar el
certificado legal.
● Activar Amazon SES para que lleguen los correos reales a la bandeja de entrada.

Entregable al Cliente:
"Hito final. Acabamos de procesar un pago real de $1.000 pesos y generamos
este contrato PDF legal con tu firma y dirección IP. El sistema está 100%
operativo."


Fase 6: Pruebas y Lanzamiento
● Pruebas de estrés (varios usuarios a la vez).
● Revisión final de textos y legales.
● Capacitación al personal.
● Paso a Producción (Dominio oficial).


Este documento contiene información técnica, diseños de arquitectura y metodologías operativas desarrolladas
exclusivamente por CORJAR Computers Solutions. Su contenido se entrega con el único propósito de ser
evaluado comercialmente por el Sr. Gerson David Corpas Romero. Agradezco mantener esta información bajo
estricta confidencialidad y no reproducirla, compartirla o utilizarla como base para desarrollos con terceros sin
nuestra autorización previa. Valoramos la confianza y el respeto mutuo por el trabajo intelectual aquí
presentado.