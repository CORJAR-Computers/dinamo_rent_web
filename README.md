# 🚗 Dinamo Rent a Car — Plataforma Web de Reservas

[![Organization](https://img.shields.io/badge/Org-CORJAR--Computers-orange.svg)](https://github.com/CORJAR-Computers)
[![Framework](https://img.shields.io/badge/SvelteKit-2.x-FF3E00.svg)](https://kit.svelte.dev/)
[![Svelte](https://img.shields.io/badge/Svelte-5.x_(Runes)-FF3E00.svg)](https://svelte.dev/)
[![CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC.svg)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)

Plataforma web oficial de reservas en línea para **Dinamo Rent a Car** en Cartagena de Indias, Colombia. Diseñada como el canal comercial de cara al cliente y turistas, sincronizada con la aplicación de escritorio **[Dinamo Rent ERP](https://github.com/CORJAR-Computers/dinamo_rent_tr)** que opera como mostrador operativo.

---

## 🌟 Características Principales

- 📍 **Buscador Especializado para Cartagena**: Selector de entregas y devoluciones en el Aeropuerto Internacional Rafael Núñez (CTG), Bocagrande, Centro Histórico, Manga y hoteles.
- ⏱️ **Cotizador en Tiempo Real**: Cálculo preciso de tarifas por días de 24 horas y desglose transparente.
- 💵 **Moneda Dual (COP / USD)**: Conversión instantánea de tarifas y depósitos para turistas internacionales y clientes locales.
- 🚙 **Catálogo de Flota por Categorías**: Filtros para vehículos Económicos, Sedanes familiares, SUVs / Camionetas de turismo y Gama Alta 4x4.
- 📝 **Flujo de Check-in y Reserva en 4 Pasos**:
  1. **Coberturas y Adicionales**: Elección entre Seguro Básico Legal y *Cobertura Total Cero Deducible* (con reducción de garantía), más adicionales (sillas de bebé, segundo conductor, tanque lleno).
  2. **Registro del Conductor**: Captura validada de nombres, documento de identidad (CC, CE, Pasaporte), WhatsApp, email y licencia.
  3. **Canvas de Firma Digital Táctil**: Lienzo interactivo para que el usuario firme con su dedo desde cualquier teléfono inteligente o mouse en PC (conforme a la Ley 527 de 1999 de comercio electrónico en Colombia).
  4. **Voucher Digital & WhatsApp Directo**: Generación de código único de pre-reserva (`DIN-2026-XXXX`) con botón de enlace directo que envía todos los datos formateados al asesor de mostrador.
- 🛡️ **Políticas Claras de Garantía**: Información didáctica sobre la retención/bloqueo temporal en tarjeta de crédito (pre-autorización bancaria).

---

## 🏗️ Arquitectura del Ecosistema

El proyecto forma parte del ecosistema integral de Dinamo Rent a Car:

```
┌─────────────────────────────────────────────────────────────┐
│                        NUBE (WEB)                           │
│  Dinamo Rent Web (SvelteKit 2 + Svelte 5 + Tailwind CSS v4) │
│  - Catálogo online, cotizador y firma digital               │
│  - Checkout, vouchers y pasarela de pagos                   │
└──────────────────────────────┬──────────────────────────────┘
                               │ Sincronización Segura
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    MOSTRADOR (DESKTOP)                      │
│  Dinamo Rent ERP (Tauri V2 + Rust + SvelteKit + Firebird)   │
│  - Recepción de reservas web                                │
│  - Botón: [Convertir Reserva en Renta]                      │
│  - Inspección física, bloqueo con datáfono y contrato       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
| :--- | :--- |
| **Framework Web** | [SvelteKit 2](https://kit.svelte.dev/) |
| **Librería de Componentes** | [Svelte 5](https://svelte.dev/) (con sistema de *Runes*: `$state`, `$derived`, `$props`) |
| **Estilos y Diseño** | [Tailwind CSS v4](https://tailwindcss.com/) + `@tailwindcss/vite` |
| **Lenguaje** | [TypeScript](https://www.typescriptlang.org/) |
| **Tipografía e Íconos** | Google Fonts (*Outfit* & *Plus Jakarta Sans*) + FontAwesome 6 |
| **Despliegue** | Vercel / Cloudflare Pages con soporte SSR |

---

## 📂 Estructura del Proyecto

```
dinamo_rent_web/
├── Assets/                 # Recursos gráficos originales de alta resolución
│   ├── LogoDinamo.png      # Logo original
│   └── LogoDinamo_clean.png# Logo procesado con transparencia
├── static/                 # Archivos estáticos servidos públicamente
│   ├── favicon.png         # Escudo Dinamo como favicon
│   └── images/             # Logotipos y fotos optimizadas
├── src/
│   ├── app.css             # Estilos globales y tokens corporativos Tailwind v4
│   ├── app.html            # Plantilla HTML base con fuentes y metadatos SEO
│   ├── lib/
│   │   ├── components/     # Componentes modulares Svelte 5
│   │   │   ├── Navbar.svelte         # Barra de navegación con logo y moneda
│   │   │   ├── HeroSearch.svelte     # Hero y buscador de fechas/horas
│   │   │   ├── FleetCatalog.svelte   # Catálogo y pestañas de categorías
│   │   │   ├── CarCard.svelte        # Tarjeta individual con precio dinámico
│   │   │   ├── BookingModal.svelte   # Modal de reserva en 4 pasos
│   │   │   ├── SignatureCanvas.svelte# Lienzo táctil para firma digital
│   │   │   ├── ProcessSteps.svelte   # Cómo funciona el alquiler
│   │   │   ├── TrustBadges.svelte    # Garantías y requisitos
│   │   │   └── Footer.svelte         # Ubicaciones y datos de contacto
│   │   ├── data/
│   │   │   └── fleet.ts              # Catálogo de vehículos, categorías y tarifas
│   │   ├── stores/
│   │   │   └── bookingStore.svelte.ts# Store reactivo global con Svelte 5 runes
│   │   └── utils/
│   │       └── formatters.ts         # Formateadores de moneda (COP/USD) y fechas
│   └── routes/
│       ├── +layout.svelte  # Layout principal de la aplicación
│       └── +page.svelte    # Página de inicio con todas las secciones integradas
├── package.json
├── svelte.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## 🚀 Instalación y Desarrollo Local

### 1. Prerrequisitos
- [Node.js](https://nodejs.org/) v20 o superior
- [npm](https://www.npmjs.com/) v10 o superior

### 2. Clonar el Repositorio
```bash
git clone https://github.com/CORJAR-Computers/dinamo_rent_web.git
cd dinamo_rent_web
```

### 3. Instalar Dependencias
```bash
npm install
```

### 4. Iniciar Servidor de Desarrollo
```bash
npm run dev
```
La aplicación estará disponible de inmediato en `http://localhost:5174/`.

### 5. Verificación de Tipos y Sintaxis
```bash
npm run check
```

### 6. Compilar para Producción
```bash
npm run build
```

---

## 📄 Licencia y Créditos

Desarrollado por **CORJAR Computers** para **Dinamo Rent a Car** (Cartagena de Indias, Colombia).  
Todos los derechos reservados © 2026.
