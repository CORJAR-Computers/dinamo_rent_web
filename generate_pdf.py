import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    """
    Canvas de 2 pasadas para agregar encabezado y pie de página profesional
    con 'Página X de Y' en todas las páginas excepto la primera si se desea.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#475569"))

        # Decoraciones para páginas posteriores a la portada
        if self._pageNumber > 1:
            # Header
            self.drawString(54, 11 * 72 - 36, "DINAMO RENT A CAR  |  Plan Maestro de Transformación Digital & Integración")
            self.drawRightString(8.5 * 72 - 54, 11 * 72 - 36, "CONFIDENCIAL — CORJAR COMPUTERS")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.75)
            self.line(54, 11 * 72 - 42, 8.5 * 72 - 54, 11 * 72 - 42)

        # Footer
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.75)
        self.line(54, 45, 8.5 * 72 - 54, 45)
        
        self.drawString(54, 32, "Cartagena de Indias, Colombia  •  Documento Técnico-Comercial")
        page_text = f"Página {self._pageNumber} de {page_count}"
        self.drawRightString(8.5 * 72 - 54, 32, page_text)
        self.restoreState()


def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Colores de la paleta
    primary_color = colors.HexColor("#0F172A")    # Slate 900
    accent_blue = colors.HexColor("#1E40AF")      # Blue 800
    accent_gold = colors.HexColor("#D97706")      # Amber 600
    neutral_dark = colors.HexColor("#1E293B")     # Slate 800
    neutral_light = colors.HexColor("#F8FAFC")    # Slate 50
    border_color = colors.HexColor("#E2E8F0")     # Slate 200

    # Estilos tipográficos
    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=primary_color,
        alignment=TA_LEFT
    )

    subtitle_style = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#475569"),
        alignment=TA_LEFT
    )

    h1_style = ParagraphStyle(
        'CustomH1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=accent_blue,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'CustomH2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=neutral_dark,
        alignment=TA_JUSTIFY,
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'CustomBullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=neutral_dark,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#1E3A8A"),
        alignment=TA_JUSTIFY
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.white,
        alignment=TA_CENTER
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=neutral_dark
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11.5,
        textColor=neutral_dark
    )

    story = []

    # ==================== PORTADA / ENCABEZADO PRINCIPAL ====================
    # Badge superior
    badge_data = [[
        Paragraph("<b>DOCUMENTO TÉCNICO & ESTRATÉGICO</b>", ParagraphStyle('Badge', fontName='Helvetica-Bold', fontSize=8, textColor=accent_blue, alignment=TA_LEFT)),
        Paragraph("<b>CARTAGENA DE INDIAS, COLOMBIA</b>", ParagraphStyle('Badge2', fontName='Helvetica-Bold', fontSize=8, textColor=colors.HexColor("#64748B"), alignment=TA_RIGHT))
    ]]
    badge_table = Table(badge_data, colWidths=[250, 254])
    badge_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(badge_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph("PLAN MAESTRO DE TRANSFORMACIÓN DIGITAL", title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Integración Total: Portal Web PWA, Motor de Reservas y ERP de Escritorio", subtitle_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=2, color=accent_blue, spaceBefore=4, spaceAfter=12))

    # Metadatos del proyecto
    meta_data = [
        [
            Paragraph("<b>Cliente:</b> Dinamo Rent a Car", table_cell_style),
            Paragraph("<b>Preparado por:</b> CORJAR Computers & Full Stack Team", table_cell_style)
        ],
        [
            Paragraph("<b>Sector:</b> Renta de Vehículos en Cartagena", table_cell_style),
            Paragraph("<b>Alcance:</b> Web PWA + API Cloud + Sincronización ERP", table_cell_style)
        ],
        [
            Paragraph("<b>Garantía Central:</b> 100% Preservación de BD Firebird", table_cell_style),
            Paragraph("<b>Fecha:</b> Agosto 2026  |  <b>Versión:</b> 1.0 Final", table_cell_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[250, 254])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 14))

    # ==================== 1. RESUMEN EJECUTIVO ====================
    story.append(Paragraph("1. Resumen Ejecutivo y Visión Estratégica", h1_style))
    story.append(Paragraph(
        "<b>Dinamo Rent a Car</b> opera actualmente con una aplicación de escritorio de alto rendimiento basada en <b>Tauri V2, Rust, SvelteKit y Firebird 5.0</b>, la cual concentra todo el registro operativo de flota, clientes, contratos, finanzas y multas de tránsito. El objetivo del presente proyecto es dar el salto definitivo hacia la comercialización digital global mediante un <b>Portal Web Moderno (PWA)</b> con motor de reservas en tiempo real y pasarela de cobros, <b>sin perder ni un solo registro histórico de la base de datos actual</b> y unificando la operación del mostrador con el canal digital.",
        body_style
    ))

    # Callout box
    callout_data = [[
        Paragraph(
            "<b>Premisa Innegociable de Ingeniería:</b> Integrar la web y el sistema de escritorio garantizando sincronización en tiempo real sin riesgo de sobreventa (<i>overbooking</i>), con cero pérdida de datos históricos y máxima resiliencia ante cortes de conectividad local.",
            callout_style
        )
    ]]
    callout_table = Table(callout_data, colWidths=[504])
    callout_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#93C5FD")),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(callout_table)
    story.append(Spacer(1, 10))

    # ==================== 2. DIAGNÓSTICO DEL SISTEMA ACTUAL ====================
    story.append(Paragraph("2. Diagnóstico del Sistema Actual y Valor del Patrimonio de Datos", h1_style))
    story.append(Paragraph(
        "El análisis técnico del repositorio oficial (<code>dinamo_rent_tr</code>) evidencia una sólida estructura de base de datos con más de 20 migraciones consolidadas en Firebird 5.0:",
        body_style
    ))
    story.append(Paragraph("• <b>Flota de Autos (<code>AUTOS</code>):</b> Catálogo completo, control de kilometraje, estado de disponibilidad, mantenimientos y alertas de vencimiento de SOAT/Tecnomecánica.", bullet_style))
    story.append(Paragraph("• <b>Clientes (<code>CLIENTES</code>):</b> Cédulas, pasaportes, licencias, teléfonos, direcciones y perfil crediticio/histórico de alquiler.", bullet_style))
    story.append(Paragraph("• <b>Rentas y Reservas (<code>RENTAS</code>, <code>RESERVAS</code>):</b> Contratos anuales, cálculo de días, horas extra, recargos de gasolina, IVA opcional y pólizas de lucro cesante.", bullet_style))
    story.append(Paragraph("• <b>Inspecciones y Mantenimiento:</b> Actas de entrega/recepción con nivel de combustible, kilometraje y estado de carrocería.", bullet_style))
    story.append(Paragraph("• <b>Comparendos e Integración SIMIT:</b> Historial de infracciones de tránsito asignadas automáticamente al conductor responsable.", bullet_style))
    story.append(Spacer(1, 8))

    # ==================== 3. ARQUITECTURA DE INTEGRACIÓN ====================
    story.append(Paragraph("3. Arquitectura de Integración de Datos (Cero Pérdida)", h1_style))
    story.append(Paragraph(
        "Para lograr la interoperabilidad perfecta entre la Web pública y el software de oficina, se implementará una <b>Arquitectura Híbrida Cloud-First con API Unificada</b>:",
        body_style
    ))

    arch_data = [
        [
            Paragraph("<b>Componente</b>", table_header_style),
            Paragraph("<b>Tecnología</b>", table_header_style),
            Paragraph("<b>Función en el Ecosistema</b>", table_header_style)
        ],
        [
            Paragraph("<b>Portal Web Público</b>", table_cell_bold),
            Paragraph("Angular / Svelte PWA", table_cell_style),
            Paragraph("Vitrina interactiva, cotizador por fechas, reserva online y firma digital táctil.", table_cell_style)
        ],
        [
            Paragraph("<b>Backend API Central</b>", table_cell_bold),
            Paragraph("Rust (Axum) / Node.js", table_cell_style),
            Paragraph("Cerebro del sistema: valida disponibilidad en tiempo real, procesa pagos y emite contratos.", table_cell_style)
        ],
        [
            Paragraph("<b>Base de Datos Cloud</b>", table_cell_bold),
            Paragraph("PostgreSQL / Cloud DB", table_cell_style),
            Paragraph("Almacena la totalidad de datos migrados desde Firebird + nuevos registros web y de oficina.", table_cell_style)
        ],
        [
            Paragraph("<b>ERP de Escritorio</b>", table_cell_bold),
            Paragraph("Tauri V2 + SvelteKit", table_cell_style),
            Paragraph("Mantiene su interfaz intacta para los operadores, conectándose de forma segura a la nube.", table_cell_style)
        ]
    ]
    arch_table = Table(arch_data, colWidths=[110, 110, 284])
    arch_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), accent_blue),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, neutral_light]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(arch_table)
    story.append(Spacer(1, 10))

    # ==================== 4. MÓDULOS DEL NUEVO ECOSISTEMA ====================
    story.append(Paragraph("4. Módulos y Funcionalidades del Ecosistema Digital", h1_style))
    
    story.append(Paragraph("4.1. Portal Web y Motor de Reservas (Front-Facing)", h2_style))
    story.append(Paragraph("• <b>Optimización para Cartagena:</b> Puntos de entrega configurables (Aeropuerto Rafael Núñez, Bocagrande, Zona Norte, Centro Histórico y Hoteles).", bullet_style))
    story.append(Paragraph("• <b>Cotizador Inteligente:</b> Desglose automático de días de alquiler, depósito en garantía, seguro de lucro cesante y adicionales (sillas de bebé, GPS, conductor extra).", bullet_style))
    story.append(Paragraph("• <b>Carga de Documentación:</b> El usuario sube foto de cédula/pasaporte y licencia de conducción antes de llegar al mostrador.", bullet_style))

    story.append(Paragraph("4.2. Firma Digital en Pantalla Táctil y Contrato Electrónico", h2_style))
    story.append(Paragraph("• <b>Canvas de Firma:</b> Permite dibujar la firma con el dedo o stylus desde el celular o tablet en recepción.", bullet_style))
    story.append(Paragraph("• <b>Generación Automática de Contrato PDF:</b> Integra cláusulas legales, datos del conductor, trazo de firma, dirección IP y estampa de tiempo.", bullet_style))

    story.append(Paragraph("4.3. Pasarela de Pagos y Bloqueo de Garantía (Pre-autorización)", h2_style))
    story.append(Paragraph("• <b>Wompi (Bancolombia):</b> Ideal para clientes nacionales por soporte nativo de PSE, Tarjetas de Crédito, Débito y Nequi con las menores comisiones del mercado.", bullet_style))
    story.append(Paragraph("• <b>PayU / Placetopay:</b> Procesamiento internacional de alta seguridad y función de <i>pre-autorización (bloqueo de cupo)</i> para cubrir eventuales daños, multas o combustible.", bullet_style))

    story.append(Paragraph("4.4. Automatizaciones: Notificaciones y Agente SIMIT", h2_style))
    story.append(Paragraph("• <b>WhatsApp y Correo Automático:</b> Envío inmediato de confirmación de reserva, voucher y copia del contrato firmado vía Amazon SES.", bullet_style))
    story.append(Paragraph("• <b>Rastreo de Comparendos SIMIT:</b> Monitoreo automático de multas asociándolas a la renta activa en la fecha y hora de la infracción.", bullet_style))
    story.append(Spacer(1, 10))

    # ==================== 5. CRONOGRAMA POR FASES ====================
    story.append(Paragraph("5. Cronograma de Desarrollo por Fases y Entregables", h1_style))
    story.append(Paragraph("Metodología ágil enfocada en entregables funcionales verificables en cada etapa:", body_style))

    phases_data = [
        [
            Paragraph("<b>Fase</b>", table_header_style),
            Paragraph("<b>Plazo</b>", table_header_style),
            Paragraph("<b>Alcance Técnico</b>", table_header_style),
            Paragraph("<b>Entregable Tangible para Dinamo</b>", table_header_style)
        ],
        [
            Paragraph("<b>Fase 1: Vitrina Web & Catálogo</b>", table_cell_bold),
            Paragraph("Sem. 1 - 2", table_cell_style),
            Paragraph("Maquetación PWA, catálogo con fotos reales de la flota y cotizador visual.", table_cell_style),
            Paragraph("Enlace demo accesible en móviles y PC para validar diseño y flota.", table_cell_style)
        ],
        [
            Paragraph("<b>Fase 2: Reservas & Firma</b>", table_cell_bold),
            Paragraph("Sem. 3 - 4", table_cell_style),
            Paragraph("Check-in online, subida de documentos, canvas de firma táctil y render PDF.", table_cell_style),
            Paragraph("Flujo completo de prueba: reserva interactiva con firma en pantalla y PDF.", table_cell_style)
        ],
        [
            Paragraph("<b>Fase 3: Migración & API</b>", table_cell_bold),
            Paragraph("Sem. 5 - 6", table_cell_style),
            Paragraph("Migración de BD Firebird a Cloud, creación de API y enlace con app Tauri.", table_cell_style),
            Paragraph("ERP de escritorio y Web compartiendo la misma base de datos en tiempo real.", table_cell_style)
        ],
        [
            Paragraph("<b>Fase 4: Pagos & Notificaciones</b>", table_cell_bold),
            Paragraph("Sem. 7 - 8", table_cell_style),
            Paragraph("Integración de pasarela Wompi/PayU, Amazon SES y WhatsApp API.", table_cell_style),
            Paragraph("Cobro real de prueba ($1.000 COP) y despacho automático de voucher.", table_cell_style)
        ],
        [
            Paragraph("<b>Fase 5: Pruebas & Lanzamiento</b>", table_cell_bold),
            Paragraph("Semana 9", table_cell_style),
            Paragraph("Pruebas de estrés, auditoría de seguridad, capacitación y salida a producción.", table_cell_style),
            Paragraph("<b>Sistema 100% operativo en dominio oficial de Dinamo Rent.</b>", table_cell_bold)
        ]
    ]
    phases_table = Table(phases_data, colWidths=[95, 55, 184, 170])
    phases_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), accent_blue),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, neutral_light]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(phases_table)
    story.append(Spacer(1, 10))

    # ==================== 6. SEGURIDAD Y RESPALDOS ====================
    story.append(Paragraph("6. Seguridad, Respaldos y Continuidad Operativa", h1_style))
    story.append(Paragraph("• <b>Snapshot Inmutable de Firebird:</b> Respaldo integral del archivo <code>dinamo_rent_v3.fdb</code> antes de iniciar cualquier fase de migración.", bullet_style))
    story.append(Paragraph("• <b>Cumplimiento Ley 1581 (Habeas Data):</b> Cifrado TLS 1.3 en tránsito y encriptación de datos sensibles de clientes en reposo.", bullet_style))
    story.append(Paragraph("• <b>Respaldos Automáticos Diarios:</b> Copias de seguridad automáticas en la nube con retención programada de 30 días.", bullet_style))
    story.append(Paragraph("• <b>Operación Ininterrumpida:</b> Durante el despliegue, el mostrador físico continúa operando con normalidad.", bullet_style))
    story.append(Spacer(1, 10))

    # ==================== 7. RETORNO DE INVERSIÓN (ROI) ====================
    story.append(Paragraph("7. Propuesta de Valor y Retorno de Inversión (ROI)", h1_style))
    story.append(Paragraph("• <b>Canal Directo 24/7:</b> Captación de reservas con semanas de anticipación reduciendo comisiones de intermediarios y agencias.", bullet_style))
    story.append(Paragraph("• <b>Cero Sobreventa (<i>No Overbooking</i>):</b> Sincronización instantánea entre el mostrador de Cartagena y la web.", bullet_style))
    story.append(Paragraph("• <b>Agilidad en Entrega (< 3 minutos):</b> Conductor pre-verificado con documentos y firma digital listos.", bullet_style))
    story.append(Paragraph("• <b>Blindaje Financiero y Legal:</b> Depósitos en garantía pre-autorizados y contratos con trazabilidad electrónica.", bullet_style))
    story.append(Spacer(1, 14))

    # Bloque de firmas / cierre
    closing_data = [
        [
            Paragraph("<b>Presentado por:</b><br/>Equipo de Ingeniería Full Stack<br/>CORJAR Computers Solutions", table_cell_style),
            Paragraph("<b>Aceptado por:</b><br/>Dirección General / Gerencia<br/>Dinamo Rent a Car", table_cell_style)
        ]
    ]
    closing_table = Table(closing_data, colWidths=[250, 254])
    closing_table.setStyle(TableStyle([
        ('LINEABOVE', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(KeepTogether([closing_table]))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF generado exitosamente en: {filename}")


if __name__ == '__main__':
    target_path = os.path.join(r"d:\Proyectos\Dinamo_Rent_a_Car WEB", "Plan_de_Integracion_Web_Dinamo_Rent_a_Car.pdf")
    build_pdf(target_path)
