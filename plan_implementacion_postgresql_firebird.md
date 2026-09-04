--- plan_implementacion_postgresql_firebird.md (原始)


+++ plan_implementacion_postgresql_firebird.md (修改后)
# Plan de Implementación: Plataforma Híbrida PostgreSQL + Firebird

## Resumen Ejecutivo
Implementación de arquitectura híbrida que combina **PostgreSQL** para la plataforma web (alta concurrencia) y **Firebird Embedded** para la aplicación de escritorio (gestión operativa), sincronizados mediante un servicio en Rust.

---

## 1. Arquitectura Propuesta

```
┌─────────────────┐         ┌──────────────────────┐         ┌──────────────────┐
│   Sitio Web     │         │   Servicio Rust      │         │  App Escritorio  │
│   (Next.js)     │◄───────►│   (Sincronizador)    │◄───────►│  (Delphi/Rust)   │
│                 │         │                      │         │                  │
│ - Reservas      │         │ - Cola de eventos    │         │ - Conversión     │
│ - Pagos         │         │ - Transformación     │         │   Reserva→Renta  │
│ - Garantías     │         │ - Reintentos         │         │ - Gestión flota  │
└────────┬────────┘         └──────────┬───────────┘         └────────┬─────────┘
         │                             │                              │
         ▼                             ▼                              ▼
┌─────────────────┐         ┌──────────────────────┐         ┌──────────────────┐
│   PostgreSQL    │         │   Redis (Opcional)   │         │  Firebird Emb.   │
│   (Web DB)      │         │   (Cola mensajes)    │         │  (Desktop DB)    │
└─────────────────┘         └──────────────────────┘         └──────────────────┘
```

### Flujo de Datos
1. **Cliente web** → Crea reserva → PostgreSQL
2. **Pago exitoso** → Webhook → Servicio Rust → Cola de sincronización
3. **Servicio Rust** → Transforma datos → Firebird (tabla `RESERVAS_WEB`)
4. **App Escritorio** → Lee `RESERVAS_WEB` → Convierte a `RENTAS_ACTIVAS`

---

## 2. Fases de Implementación

### Fase 1: Infraestructura Base (Semanas 1-2)

#### 2.1 Configuración PostgreSQL
```bash
# Instalación en servidor Linux
sudo apt install postgresql postgresql-contrib

# Creación de usuario y base de datos
sudo -u postgres psql
CREATE USER carrental_web WITH PASSWORD 'secure_password';
CREATE DATABASE carrental_web OWNER carrental_web;
GRANT ALL PRIVILEGES ON DATABASE carrental_web TO carrental_web;
```

**Esquema inicial PostgreSQL:**
```sql
-- Tabla de vehículos (sincronizada con Firebird)
CREATE TABLE vehiculos (
    id VARCHAR(50) PRIMARY KEY,
    modelo VARCHAR(100),
    marca VARCHAR(50),
    año INTEGER,
    placa VARCHAR(20),
    categoria VARCHAR(30),
    precio_diario DECIMAL(10,2),
    estado VARCHAR(20), -- 'DISPONIBLE', 'OCUPADO', 'MANTENIMIENTO'
    foto_url TEXT,
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- Tabla de reservas web
CREATE TABLE reservas_web (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID,
    vehiculo_id VARCHAR(50),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado VARCHAR(30), -- 'PENDIENTE_PAGO', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA'
    total DECIMAL(10,2),
    anticipo_pagado DECIMAL(10,2),
    garantia_bloqueada DECIMAL(10,2),
    id_transaccion_pago VARCHAR(100),
    datos_cliente JSONB,
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_en TIMESTAMP DEFAULT NOW(),
    sincronizado_en TIMESTAMP,
    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id)
);

-- Tabla de clientes web
CREATE TABLE clientes_web (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_completo VARCHAR(150),
    email VARCHAR(100) UNIQUE,
    telefono VARCHAR(20),
    documento_tipo VARCHAR(10),
    documento_numero VARCHAR(30),
    creado_en TIMESTAMP DEFAULT NOW()
);

-- Tabla de pagos
CREATE TABLE pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reserva_id UUID,
    monto DECIMAL(10,2),
    tipo VARCHAR(30), -- 'ANTICIPO', 'GARANTIA', 'SALDO'
    estado VARCHAR(20), -- 'PENDIENTE', 'APROBADO', 'RECHAZADO', 'REEMBOLSADO'
    id_transaccion_externa VARCHAR(100),
    pasarela VARCHAR(30), -- 'WOMPI', 'MERCADOPAGO', 'STRIPE'
    creado_en TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (reserva_id) REFERENCES reservas_web(id)
);

-- Índices para rendimiento
CREATE INDEX idx_reservas_fecha ON reservas_web(fecha_inicio, fecha_fin);
CREATE INDEX idx_reservas_estado ON reservas_web(estado);
CREATE INDEX idx_vehiculos_estado ON vehiculos(estado);
```

#### 2.2 Configuración del Servidor
- **Proveedor recomendado**: Railway, Render o DigitalOcean Droplet
- **Especificaciones mínimas**: 2GB RAM, 1 vCPU, 25GB SSD
- **Backup automático**: Configurar pg_dump diario
- **SSL**: Certificado Let's Encrypt obligatorio

---

### Fase 2: Servicio de Sincronización en Rust (Semanas 3-4)

#### 2.1 Estructura del Proyecto Rust
```
sync-service/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── config.rs
│   ├── db/
│   │   ├── postgres.rs
│   │   └── firebird.rs
│   ├── models/
│   │   ├── reserva.rs
│   │   └── vehiculo.rs
│   ├── sync/
│   │   ├── web_to_desktop.rs
│   │   └── desktop_to_web.rs
│   └── api/
│       └── webhook.rs
└── .env
```

#### 2.2 Dependencias Cargo.toml
```toml
[package]
name = "carrental-sync"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
dotenv = "0.15"
tracing = "0.1"
tracing-subscriber = "0.3"

# PostgreSQL
sqlx = { version = "0.7", features = ["runtime-tokio-native-tls", "postgres", "uuid", "chrono", "decimal"] }

# Firebird
fb-client = "0.10"

# Cola de mensajes (opcional)
lapin = "2.0" # RabbitMQ

# HTTP Server para webhooks
axum = "0.7"
tower-http = { version = "0.5", features = ["cors", "trace"] }

# Utilidades
uuid = { version = "1.0", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
rust_decimal = { version = "1.0", features = ["serde"] }
thiserror = "1.0"
anyhow = "1.0"
```

#### 2.3 Implementación del Sincronizador
```rust
// src/main.rs
use tokio::time::{interval, Duration};
use tracing::{info, error};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let config = config::load()?;
    let mut interval = interval(Duration::from_secs(30)); // Sync cada 30 segundos

    loop {
        interval.tick().await;

        if let Err(e) = sync::web_to_desktop::sincronizar_reservas(&config).await {
            error!("Error sincronizando web→desktop: {}", e);
        }

        if let Err(e) = sync::desktop_to_web::sincronizar_inventario(&config).await {
            error!("Error sincronizando desktop→web: {}", e);
        }
    }
}
```

```rust
// src/sync/web_to_desktop.rs
use sqlx::{PgPool, Row};
use fb_client::{FbConnection, FbStatement};

pub async fn sincronizar_reservas(config: &Config) -> anyhow::Result<()> {
    let pg_pool = postgres::connect(&config.postgres_url).await?;
    let mut fb_conn = firebird::connect(&config.firebird_path)?;

    // Obtener reservas web no sincronizadas
    let reservas = sqlx::query!(
        r#"SELECT id, cliente_id, vehiculo_id, fecha_inicio, fecha_fin,
                  total, anticipo_pagado, datos_cliente
           FROM reservas_web
           WHERE estado = 'CONFIRMADA' AND sincronizado_en IS NULL"#
    )
    .fetch_all(&pg_pool)
    .await?;

    for reserva in reservas {
        // Transformar datos al formato Firebird
        let stmt = FbStatement::prepare(&mut fb_conn,
            "INSERT INTO RESERVAS_WEB (ID, CLIENTE_NOMBRE, VEHICULO_ID,
             FECHA_INICIO, FECHA_FIN, TOTAL, ANTICIPO, ESTADO, ORIGEN)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'WEB', ?)"
        )?;

        stmt.execute(&[
            reserva.id.to_string().into(),
            reserva.datos_cliente["nombre"].as_str().unwrap().into(),
            reserva.vehiculo_id.into(),
            reserva.fecha_inicio.into(),
            reserva.fecha_fin.into(),
            reserva.total.into(),
            reserva.anticipo_pagado.into(),
            "CONFIRMADA".into()
        ])?;

        // Marcar como sincronizada en PostgreSQL
        sqlx::query!(
            "UPDATE reservas_web SET sincronizado_en = NOW() WHERE id = $1",
            reserva.id
        )
        .execute(&pg_pool)
        .await?;

        info!("Reserva {} sincronizada exitosamente", reserva.id);
    }

    Ok(())
}
```

#### 2.4 Endpoint para Webhooks de Pago
```rust
// src/api/webhook.rs
use axum::{routing::post, Router, Json, extract::State};
use serde::Deserialize;

#[derive(Deserialize)]
struct WompiWebhook {
    transaction_id: String,
    status: String,
    amount_in_cents: u64,
    reference: String,
}

pub fn crear_router(pool: PgPool) -> Router {
    Router::new()
        .route("/webhook/wompi", post(manejar_webhook_wompi))
        .with_state(pool)
}

async fn manejar_webhook_wompi(
    State(pool): State<PgPool>,
    Json(payload): Json<WompiWebhook>,
) -> axum::http::StatusCode {
    if payload.status == "APPROVED" {
        // Actualizar reserva como confirmada
        let result = sqlx::query!(
            r#"UPDATE reservas_web
               SET estado = 'CONFIRMADA',
                   id_transaccion_pago = $1,
                   actualizado_en = NOW()
               WHERE id_transaccion_pago = $1"#,
            payload.transaction_id
        )
        .execute(&pool)
        .await;

        match result {
            Ok(_) => axum::http::StatusCode::OK,
            Err(_) => axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        }
    } else {
        axum::http::StatusCode::BAD_REQUEST
    }
}
```

---

### Fase 3: Modificaciones a la Base de Datos Firebird (Semana 5)

#### 3.1 Nueva Tabla para Reservas Web
```sql
-- Ejecutar en la base de datos Firebird existente
CREATE TABLE RESERVAS_WEB (
    ID VARCHAR(50) NOT NULL PRIMARY KEY,
    CLIENTE_NOMBRE VARCHAR(150),
    CLIENTE_EMAIL VARCHAR(100),
    CLIENTE_TELEFONO VARCHAR(20),
    CLIENTE_DOCUMENTO VARCHAR(30),
    VEHICULO_ID VARCHAR(50),
    FECHA_INICIO DATE NOT NULL,
    FECHA_FIN DATE NOT NULL,
    TOTAL DECIMAL(18,2),
    ANTICIPO DECIMAL(18,2),
    GARANTIA_BLOQUEADA DECIMAL(18,2),
    ESTADO VARCHAR(30) DEFAULT 'PENDIENTE',
    ORIGEN VARCHAR(20) DEFAULT 'WEB',
    ID_TRANSACCION_PAGO VARCHAR(100),
    FECHA_SINCRONIZACION TIMESTAMP,
    OBSERVACIONES BLOB SUB_TYPE TEXT,
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT TIMESTAMP
);

CREATE INDEX IDX_RESERVAS_WEB_ESTADO ON RESERVAS_WEB(ESTADO);
CREATE INDEX IDX_RESERVAS_WEB_FECHAS ON RESERVAS_WEB(FECHA_INICIO, FECHA_FIN);

-- Vista para facilitar la conversión a rentas
CREATE VIEW V_RESERVAS_POR_CONVERTIR AS
SELECT * FROM RESERVAS_WEB
WHERE ESTADO = 'CONFIRMADA'
  AND FECHA_INICIO <= CURRENT_DATE + 3
  AND ID NOT IN (SELECT RESERVA_ID FROM RENTAS WHERE RESERVA_ID IS NOT NULL);
```

#### 3.2 Modificación a Tabla de Vehículos (Agregar campo de control)
```sql
ALTER TABLE VEHICULOS ADD COLUMN DISPONIBILIDAD_WEB VARCHAR(10) DEFAULT 'SI';
ALTER TABLE VEHICULOS ADD COLUMN ULTIMA_SYNC_WEB TIMESTAMP;
```

---

### Fase 4: Aplicación Web Frontend (Semanas 6-9)

#### 4.1 Stack Tecnológico
- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **Estado**: Zustand o React Query
- **Formularios**: React Hook Form + Zod

#### 4.2 Estructura de Páginas
```
/app
  /reservar
    /paso-1-vehiculos/page.tsx
    /paso-2-datos/page.tsx
    /paso-3-pago/page.tsx
    /confirmacion/[id]/page.tsx
  /mi-reserva/[id]/page.tsx
  /api
    /reservas/route.ts
    /pagos/iniciar/route.ts
    /webhook/wompi/route.ts
```

#### 4.3 Componentes Clave
- Buscador de vehículos por fechas
- Selector de seguros y adicionales
- Formulario de datos del cliente con validación
- Integración con pasarela de pagos (Wompi/MercadoPago)
- Dashboard de estado de reserva
- Sistema de notificaciones por email (Resend o SendGrid)

---

### Fase 5: Integración con App de Escritorio (Semana 10)

#### 5.1 Modificaciones en Delphi/Rust Desktop
```pascal
// Agregar nuevo módulo para gestionar reservas web
unit uGestorReservasWeb;

interface

type
  TGestorReservasWeb = class
    procedure CargarReservasPendientes;
    procedure ConvertirReservaARenta(AReservaID: string);
    function VerificarDisponibilidad(AFechainicio, AFechaFin: TDate): Boolean;
  end;

implementation

procedure TGestorReservasWeb.ConvertirReservaARenta(AReservaID: string);
begin
  // Leer datos de RESERVAS_WEB
  // Validar documentos del cliente
  // Crear registro en RENTAS
  // Asignar vehículo específico
  // Registrar pago de garantía (bloqueo tarjeta)
  // Actualizar estado en RESERVAS_WEB a 'CONVERTIDA'
  // Generar contrato digital
end;
```

#### 5.2 Flujo de Conversión
1. Usuario abre app desktop → Filtra "Reservas Web Pendientes"
2. Selecciona reserva → Verifica documentos físicos del cliente
3. Confirma vehículo específico (puede diferir del reservado)
4. Realiza bloqueo de garantía con datáfono/terminal
5. Sistema crea registro en tabla `RENTAS`
6. Actualiza `RESERVAS_WEB.ESTADO = 'CONVERTIDA'`
7. Genera contrato y lo envía por email

---

### Fase 6: Pruebas y Despliegue (Semanas 11-12)

#### 6.1 Checklist de Pruebas
- [ ] Conexión simultánea de 50 usuarios web
- [ ] Sincronización web→desktop en < 60 segundos
- [ ] Sincronización desktop→web (inventario) en tiempo real
- [ ] Proceso completo de reserva + pago
- [ ] Webhook de pasarela de pagos
- [ ] Conversión reserva→renta en desktop
- [ ] Rollback en caso de fallo de sincronización
- [ ] Backup y restauración de ambas BD

#### 6.2 Estrategia de Despliegue
1. **Despliegue en staging**: Réplica exacta de producción
2. **Pruebas piloto**: 5-10 reservas reales controladas
3. **Migración incremental**: Mantener Firebird como fuente de verdad inicial
4. **Corte definitivo**: Cuando estabilidad sea > 99%

---

## 3. Consideraciones de Seguridad

### 3.1 Protección de Datos
- **Encriptación**: TLS 1.3 para todas las comunicaciones
- **Datos sensibles**: Encriptar números de tarjeta en reposo (AES-256)
- **Cumplimiento**: PCI-DSS Level 4 (usando pasarelas certificadas)

### 3.2 Control de Acceso
```sql
-- Roles en PostgreSQL
CREATE ROLE web_readonly;
CREATE ROLE web_app;
CREATE ROLE sync_service;

GRANT SELECT ON vehiculos TO web_readonly;
GRANT SELECT, INSERT, UPDATE ON reservas_web, clientes_web, pagos TO web_app;
GRANT ALL ON reservas_web TO sync_service;
```

### 3.3 Auditoría
```sql
CREATE TABLE auditoria_sync (
    id SERIAL PRIMARY KEY,
    tabla_origen VARCHAR(50),
    id_registro VARCHAR(50),
    accion VARCHAR(20),
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    usuario_sistema VARCHAR(50),
    fecha TIMESTAMP DEFAULT NOW()
);
```

---

## 4. Monitoreo y Mantenimiento

### 4.1 Métricas Clave
- Tiempo promedio de sincronización
- Tasa de errores de sincronización
- Reservas pendientes de conversión
- Disponibilidad de servicios (uptime)

### 4.2 Herramientas Recomendadas
- **Logs**: Grafana Loki + Promtail
- **Métricas**: Prometheus + Grafana
- **Alertas**: PagerDuty o Telegram bot
- **APM**: Sentry o New Relic

### 4.3 Plan de Contingencia
- Si falla sincronización: Operar manualmente desde desktop
- Si cae PostgreSQL: Modo mantenimiento en web, desktop sigue operando
- Backup hourly de PostgreSQL + daily de Firebird

---

## 5. Costos Estimados Mensuales

| Concepto | Costo (COP) | Notas |
|----------|-------------|-------|
| Servidor PostgreSQL (2GB) | $80,000 | Railway/Render |
| Dominio + SSL | $50,000 | Namecheap + Let's Encrypt |
| Pasarela de pagos | Variable | 2.5% + $1,500 por transacción |
| Email transaccional | $30,000 | Resend/SendGrid (10k emails) |
| Monitoreo | $0-50,000 | Grafana Cloud free tier |
| **Total estimado** | **~$160,000** | Sin contar transacciones |

---

## 6. Cronograma Resumido

| Fase | Duración | Entregables |
|------|----------|-------------|
| 1. Infraestructura | 2 semanas | PostgreSQL configurado, esquemas creados |
| 2. Servicio Rust | 2 semanas | Sincronizador funcional, webhooks |
| 3. Firebird Mods | 1 semana | Tablas nuevas, vistas, triggers |
| 4. Frontend Web | 4 semanas | Sitio completo con pagos |
| 5. Desktop Integration | 1 semana | Módulo conversión reservas |
| 6. Pruebas + Deploy | 2 semanas | Sistema en producción |
| **Total** | **12 semanas** | **~3 meses** |

---

## 7. Riesgos y Mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Pérdida de datos en sync | Baja | Alto | Cola persistente, reintentos, logs detallados |
| Inconsistencia inventario | Media | Medio | Sync bidireccional cada 30s, validación antes de confirmar |
| Caída pasarela pagos | Media | Alto | Múltiples pasarelas, modo manual temporal |
| Resistencia al cambio | Alta | Bajo | Capacitación, interfaz familiar en desktop |

---

## 8. Próximos Pasos Inmediatos

1. **Definir proveedor de hosting** para PostgreSQL
2. **Obtener credenciales sandbox** de Wompi/MercadoPago
3. **Configurar repositorio Git** para servicio Rust y frontend
4. **Crear wireframes** del flujo de reserva web
5. **Reunión con banco** para definir proceso de garantías

---

## 9. Recursos Adicionales

- [Documentación SQLx](https://docs.rs/sqlx/latest/sqlx/)
- [FB Client Rust](https://crates.io/crates/fb-client)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Wompi API](https://docs.wompi.co/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)

---

**Nota**: Este plan asume que el equipo tiene conocimientos básicos de Rust, TypeScript y administración de bases de datos. Se recomienda asignar 1 desarrollador full-time para las fases críticas (2-4).
