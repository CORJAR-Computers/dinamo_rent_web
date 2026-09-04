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
from reportlab.graphics.shapes import Drawing, Rect, Circle, String, Group, Line, Polygon

class DinamoNumberedCanvas(canvas.Canvas):
    """
    Canvas corporativo de 2 pasadas para Dinamo Rent a Car.
    Dibuja membrete con la paleta oficial (Azul Marino + Naranja Dinamo) y numeración 'Página X de Y'.
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
            self.draw_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_decorations(self, page_count):
        self.saveState()
        
        # Paleta oficial Dinamo
        c_navy = colors.HexColor("#0A2540")
        c_orange = colors.HexColor("#FF6B00")
        c_cyan = colors.HexColor("#0080FF")
        c_slate = colors.HexColor("#475569")
        c_border = colors.HexColor("#E2E8F0")

        page_w = 8.5 * 72
        page_h = 11.0 * 72

        # Portada (Página 1) tiene diseño especial
        if self._pageNumber > 1:
            # Header Superior
            self.setFillColor(c_navy)
            self.setFont("Helvetica-Bold", 8)
            self.drawString(54, page_h - 36, "DINAMO RENT A CAR")
            
            self.setFont("Helvetica", 8)
            self.setFillColor(c_slate)
            self.drawString(160, page_h - 36, "|   Plan Maestro de Integración Web PWA & ERP Escritorio")
            
            self.drawRightString(page_w - 54, page_h - 36, "CONFIDENCIAL — CORJAR COMPUTERS")

            # Líneas de acento header
            self.setStrokeColor(c_navy)
            self.setLineWidth(1.5)
            self.line(54, page_h - 42, page_w - 120, page_h - 42)
            
            self.setStrokeColor(c_orange)
            self.setLineWidth(1.5)
            self.line(page_w - 116, page_h - 42, page_w - 54, page_h - 42)

        # Footer en todas las páginas
        self.setStrokeColor(c_border)
        self.setLineWidth(0.75)
        self.line(54, 46, page_w - 54, 46)

        # Acento naranja en footer
        self.setStrokeColor(c_orange)
        self.setLineWidth(2)
        self.line(54, 46, 120, 46)

        self.setFont("Helvetica", 7.5)
        self.setFillColor(c_slate)
        self.drawString(54, 32, "Dinamo Rent a Car • Cartagena de Indias, Colombia • Arquitectura de Software & Pasarelas de Pago")
        
        page_str = f"Página {self._pageNumber} de {page_count}"
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(c_navy)
        self.drawRightString(page_w - 54, 32, page_str)

        self.restoreState()


def draw_logo_drawing():
    """Genera un dibujo vectorial representativo del logo oficial de Dinamo Rent."""
    d = Drawing(120, 70)
    
    # Colores
    c_navy = colors.HexColor("#0A2540")
    c_orange = colors.HexColor("#FF6B00")
    c_cyan = colors.HexColor("#0080FF")
    c_light_bg = colors.HexColor("#F8FAFC")
    
    # Escudo exterior
    points = [60, 68, 105, 56, 96, 12, 60, 2, 24, 12, 15, 56]
    d.add(Polygon(points, fillColor=c_navy, strokeColor=c_orange, strokeWidth=2))
    
    # Escudo interior blanco
    points_in = [60, 64, 100, 53, 92, 15, 60, 6, 28, 15, 20, 53]
    d.add(Polygon(points_in, fillColor=c_light_bg, strokeColor=colors.HexColor("#CBD5E1"), strokeWidth=0.5))
    
    # Arco de velocímetro naranja
    d.add(Line(40, 45, 80, 45, strokeColor=c_orange, strokeWidth=3))
    d.add(Line(60, 45, 72, 53, strokeColor=c_orange, strokeWidth=2.5))
    d.add(Circle(60, 45, 2.5, fillColor=c_navy, strokeColor=c_orange, strokeWidth=1))
    
    # Texto DINAMO
    d.add(String(34, 28, "DINAMO", fontName="Helvetica-Bold", fontSize=13, fillColor=c_navy))
    d.add(String(32, 17, "Rent a Car", fontName="Helvetica-Bold", fontSize=8.5, fillColor=c_cyan))
    
    return d


def generate_consolidated_pdf(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Paleta Dinamo Rent
    c_navy = colors.HexColor("#0A2540")
    c_orange = colors.HexColor("#FF6B00")
    c_cyan = colors.HexColor("#0080FF")
    c_slate_dark = colors.HexColor("#1E293B")
    c_slate_light = colors.HexColor("#F8FAFC")
    c_border = colors.HexColor("#E2E8F0")
    c_green = colors.HexColor("#059669")
    c_red = colors.HexColor("#DC2626")

    # Estilos Tipográficos
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=c_navy,
        alignment=TA_LEFT
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=c_orange,
        alignment=TA_LEFT
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12.5,
        leading=16,
        textColor=c_navy,
        spaceBefore=12,
        spaceAfter=5,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13.5,
        textColor=c_cyan,
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.8,
        leading=12.5,
        textColor=c_slate_dark,
        alignment=TA_JUSTIFY,
        spaceAfter=5
    )

    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.8,
        leading=12.5,
        textColor=c_slate_dark,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3
    )

    callout_style = ParagraphStyle(
        'Callout_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.8,
        leading=12.5,
        textColor=c_navy,
        alignment=TA_JUSTIFY
    )

    table_hdr = ParagraphStyle(
        'TableHdr',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.2,
        leading=11,
        textColor=colors.white,
        alignment=TA_CENTER
    )

    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=c_slate_dark
    )

    table_cell_bold = ParagraphStyle(
        'TableCellB',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        textColor=c_navy
    )

    legal_style = ParagraphStyle(
        'LegalText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#334155"),
        alignment=TA_JUSTIFY
    )

    story = []

    # ==================== PORTADA Y HEADER EJECUTIVO ====================
    # Fila superior: Logo y Datos Principales
    logo_draw = draw_logo_drawing()
    
    header_info = [
        [
            logo_draw,
            [
                Paragraph("<b>DINAMO RENT A CAR — CARTAGENA</b>", ParagraphStyle('H1Top', fontName='Helvetica-Bold', fontSize=14, leading=17, textColor=c_navy)),
                Paragraph("<b>PLAN MAESTRO DE INTEGRACIÓN TECNOLÓGICA & WEB</b>", ParagraphStyle('H2Top', fontName='Helvetica-Bold', fontSize=10, leading=13, textColor=c_orange)),
                Paragraph("Portal Web PWA • Motor On-Request • Pagos & Garantías • Sincronización ERP Desktop", ParagraphStyle('SubTop', fontName='Helvetica', fontSize=8, leading=11, textColor=colors.HexColor("#64748B"))),
                Paragraph("<b>Garantía Central:</b> 100% de Preservación de la Base de Datos Firebird", ParagraphStyle('SubTop2', fontName='Helvetica-Bold', fontSize=8, leading=11, textColor=c_cyan))
            ]
        ]
    ]
    header_table = Table(header_info, colWidths=[110, 394])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=2, color=c_orange, spaceBefore=4, spaceAfter=8))

    # Ficha técnica del proyecto
    ficha_data = [
        [
            Paragraph("<b>Empresa:</b> Dinamo Rent a Car (Cartagena, Col.)", table_cell),
            Paragraph("<b>Equipo:</b> CORJAR Computers & Full Stack Team", table_cell),
            Paragraph("<b>Fecha:</b> Agosto 2026", table_cell)
        ],
        [
            Paragraph("<b>ERP Actual:</b> Tauri V2 + Rust + Firebird 5.0", table_cell),
            Paragraph("<b>Nueva Web:</b> PWA + API Cloud + Wompi/PayU", table_cell),
            Paragraph("<b>Versión:</b> 2.0 Consolidada", table_cell)
        ]
    ]
    ficha_table = Table(ficha_data, colWidths=[175, 205, 124])
    ficha_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(ficha_table)
    story.append(Spacer(1, 8))

    # ==================== 1. VISIÓN DEL PROYECTO ====================
    story.append(Paragraph("1. Resumen Ejecutivo y Premisa de Integración", h1_style))
    story.append(Paragraph(
        "El presente plan consolida la estrategia técnica y operativa para dotar a <b>Dinamo Rent a Car</b> de una presencia digital de alto nivel en Cartagena de Indias, permitiendo la captación directa de reservas turísticas y corporativas sin intermediarios, a la vez que se conecta de forma bidireccional con el software de escritorio que la rentadora ya utiliza.",
        body_style
    ))
    
    # Callout de preservación
    callout_data = [[
        Paragraph(
            "<b>Compromiso de Ingeniería y Continuidad:</b> Todos los datos existentes en el ERP (autos, clientes, contratos, finanzas y multas SIMIT) se mantendrán 100% íntegros. La aplicación de escritorio mantendrá su interfaz para los operadores, pero se conectará a una base de datos central en la nube compartida con la web, eliminando el riesgo de sobreventa (<i>overbooking</i>).",
            callout_style
        )
    ]]
    c_table = Table(callout_data, colWidths=[504])
    c_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#93C5FD")),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(c_table)
    story.append(Spacer(1, 8))

    # ==================== 2. FLUJO OPERATIVO ON-REQUEST ====================
    story.append(Paragraph("2. Flujo Operativo del Negocio: 'Reserva On-Request' & Garantías", h1_style))
    story.append(Paragraph(
        "Siguiendo las mejores prácticas de la industria de alquiler de autos en Colombia (modelo AOA / RentSyst), el sistema operará bajo el flujo de <b>Reserva con Autorización Previa y Pre-autorización Bancaria</b>:",
        body_style
    ))

    flow_data = [
        [
            Paragraph("<b>Paso</b>", table_hdr),
            Paragraph("<b>Acción del Cliente / Sistema</b>", table_hdr),
            Paragraph("<b>Proceso Técnico & Operativo</b>", table_hdr)
        ],
        [
            Paragraph("<b>1. Solicitud Web</b>", table_cell_bold),
            Paragraph("Cliente elige fechas, vehículo y puntos en Cartagena (Aeropuerto, Hoteles).", table_cell),
            Paragraph("No se cobra de inmediato. Se crea la solicitud en estado <i>Pendiente</i>.", table_cell)
        ],
        [
            Paragraph("<b>2. Aprobación ERP</b>", table_cell_bold),
            Paragraph("Asesor en oficina recibe la alerta y verifica la unidad física.", table_cell),
            Paragraph("Al hacer clic en 'Aprobar', el auto se aparta y se genera un enlace único de pago/firma.", table_cell)
        ],
        [
            Paragraph("<b>3. Notificación Instantánea</b>", table_cell_bold),
            Paragraph("Cliente recibe Email (Amazon SES) y WhatsApp con el enlace oficial.", table_cell),
            Paragraph("Canales seguros autenticados con dominio oficial (SPF, DKIM, DMARC).", table_cell)
        ],
        [
            Paragraph("<b>4. Check-in & Garantía</b>", table_cell_bold),
            Paragraph("Cliente ingresa a la web desde su celular, carga foto de licencia/cédula.", table_cell),
            Paragraph("Ingreso de tarjeta bajo tokenización PCI-DSS y comando de <b>Pre-autorización</b>.", table_cell)
        ],
        [
            Paragraph("<b>5. Firma Digital</b>", table_cell_bold),
            Paragraph("Firma con el dedo en el canvas táctil aceptando términos legales.", table_cell),
            Paragraph("Generación de Contrato PDF legal (Ley 527 de 1999) con IP, fecha y trazo.", table_cell)
        ],
        [
            Paragraph("<b>6. Devolución / Cierre</b>", table_cell_bold),
            Paragraph("Recepción del auto e inspección de combustible/carrocería.", table_cell),
            Paragraph("<b>Liberación (Void):</b> Si todo está OK. <b>Captura Parcial:</b> Si hay daño/multa/gasolina.", table_cell)
        ]
    ]
    flow_table = Table(flow_data, colWidths=[90, 204, 210])
    flow_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_navy),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_slate_light]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(flow_table)
    story.append(Spacer(1, 8))

    # ==================== 3. ARQUITECTURA DE PAGOS Y GARANTÍAS ====================
    story.append(Paragraph("3. Infraestructura de Pagos y Bloqueo de Cupo (Colombia 2026)", h1_style))
    story.append(Paragraph(
        "Para blindar financieramente a Dinamo Rent a Car contra fraudes y costos imprevistos (multas fotodetección, faltantes de gasolina, días adicionales), se integrará la pasarela con capacidades Gateway:",
        body_style
    ))

    pay_data = [
        [
            Paragraph("<b>Pasarela</b>", table_hdr),
            Paragraph("<b>Función Principal</b>", table_hdr),
            Paragraph("<b>Ventaja para Dinamo Rent a Car</b>", table_hdr)
        ],
        [
            Paragraph("<b>PayU Latam (API)</b>", table_cell_bold),
            Paragraph("Pre-autorización (Bloqueo) & Captura Posterior", table_cell),
            Paragraph("Congela el cupo de garantía (ej: $1.000.000 COP) sin debitarlo. Permite cobros parciales por multas o daños. Excelente módulo antifraude internacional.", table_cell)
        ],
        [
            Paragraph("<b>Wompi (Bancolombia)</b>", table_cell_bold),
            Paragraph("Cobro Inmediato (Anticipos / Alquiler)", table_cell),
            Paragraph("Comisiones bajas (2.85% + $800). Acepta PSE, Nequi, Tarjetas y transferencias Bancolombia para el pago directo de la renta.", table_cell)
        ],
        [
            Paragraph("<b>Tokenización Segura</b>", table_cell_bold),
            Paragraph("Cargos posteriores autorizados", table_cell),
            Paragraph("Los datos de tarjeta no se guardan en el servidor (cumplimiento PCI-DSS); se almacena un <i>Token</i> bancario para cobros de multas notificadas días después.", table_cell)
        ]
    ]
    pay_table = Table(pay_data, colWidths=[100, 160, 244])
    pay_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_navy),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_slate_light]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(pay_table)
    story.append(Spacer(1, 8))

    # ==================== 4. CLÁUSULA LEGAL Y PROTOCOLO DE RECLAMOS ====================
    story.append(Paragraph("4. Blindaje Legal y Protocolo de Atención al Cliente", h1_style))
    
    legal_box = [
        [
            Paragraph("<b>CLÁUSULA DE GARANTÍA Y AUTORIZACIÓN DE CARGO (Términos & Condiciones Web):</b><br/>"
                      "<i>'Al confirmar la reserva, el Arrendatario autoriza expresamente a Dinamo Rent a Car a solicitar a la entidad emisora de su tarjeta de crédito una pre-autorización (bloqueo preventivo de cupo) por el valor estipulado según la categoría del vehículo, como garantía de cumplimiento contractual. Asimismo, autoriza de manera irrevocable que en caso de presentarse faltantes de combustible, daños, multas de tránsito (SIMIT/DATT) o días adicionales de uso, Dinamo Rent a Car realice la captura del valor correspondiente directamente sobre el cupo reservado o mediante el token de seguridad generado, de conformidad con la Ley 527 de 1999 de Comercio Electrónico.'</i>",
                      legal_style)
        ]
    ]
    l_table = Table(legal_box, colWidths=[504])
    l_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#FEF3C7")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#F59E0B")),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(l_table)
    story.append(Spacer(1, 6))

    story.append(Paragraph("<b>Protocolo Operativo de Desbloqueo y Reclamos Bancarios:</b>", h2_style))
    story.append(Paragraph("• <b>Liberación Inmediata:</b> Tras la entrega del auto a conformidad, el sistema envía la orden de anulación (<code>VOID</code>) al banco.", bullet_style))
    story.append(Paragraph("• <b>Tiempos del Sistema Financiero:</b> Los bancos en Colombia demoran entre 3 y 8 días hábiles en reflejar el cupo nuevamente.", bullet_style))
    story.append(Paragraph("• <b>Código ARN de Respaldo:</b> En caso de reclamo del usuario, el sistema genera el comprobante con el <i>Acquirer Reference Number (ARN)</i> para que el cliente lo presente ante su banco emisor.", bullet_style))
    story.append(Spacer(1, 8))

    # ==================== 5. CRONOGRAMA POR FASES ====================
    story.append(Paragraph("5. Cronograma de Implementación y Fases de Entrega", h1_style))

    crono_data = [
        [
            Paragraph("<b>Fase</b>", table_hdr),
            Paragraph("<b>Duración</b>", table_hdr),
            Paragraph("<b>Entregable Tangible para Dinamo Rent a Car</b>", table_hdr)
        ],
        [
            Paragraph("<b>Fase 1: Vitrina Web & Catálogo</b>", table_cell_bold),
            Paragraph("Semanas 1 - 2", table_cell),
            Paragraph("Sitio web PWA publicado en subdominio de prueba con fotos de la flota, buscador de fechas y puntos de entrega en Cartagena.", table_cell)
        ],
        [
            Paragraph("<b>Fase 2: Reservas & Firma Digital</b>", table_cell_bold),
            Paragraph("Semanas 3 - 4", table_cell),
            Paragraph("Formulario de check-in, carga de licencia/cédula, canvas de firma táctil y emisión de contrato en PDF sellado.", table_cell)
        ],
        [
            Paragraph("<b>Fase 3: Migración & API Cloud</b>", table_cell_bold),
            Paragraph("Semanas 5 - 6", table_cell),
            Paragraph("Migración íntegra del archivo <code>dinamo_rent_v3.fdb</code> a base de datos Cloud y enlace de la app Tauri a la nube.", table_cell)
        ],
        [
            Paragraph("<b>Fase 4: Pasarelas & Notificaciones</b>", table_cell_bold),
            Paragraph("Semanas 7 - 8", table_cell),
            Paragraph("Integración Wompi/PayU (Pre-autorizaciones), Amazon SES (correos sin spam) y mensajes WhatsApp automatizados.", table_cell)
        ],
        [
            Paragraph("<b>Fase 5: Pruebas & Lanzamiento</b>", table_cell_bold),
            Paragraph("Semana 9", table_cell),
            Paragraph("Transacción de prueba con tarjeta real, capacitación a los asesores de mostrador y publicación en dominio oficial.", table_cell)
        ]
    ]
    crono_table = Table(crono_data, colWidths=[120, 74, 310])
    crono_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_navy),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_slate_light]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(crono_table)
    story.append(Spacer(1, 10))

    # ==================== 6. MANUAL RÁPIDO PARA EL ASESOR (SEMÁFORO) ====================
    story.append(Paragraph("6. Guía Rápida de Operación para el Asesor de Mostrador", h1_style))

    sem_data = [
        [
            Paragraph("<b>Estado en Panel</b>", table_hdr),
            Paragraph("<b>Significado Operativo</b>", table_hdr),
            Paragraph("<b>Acción Inmediata a Seguir</b>", table_hdr)
        ],
        [
            Paragraph("<font color='#059669'><b>AUTHORIZED / APROBADO</b></font>", table_cell),
            Paragraph("Garantía congelada con éxito.", table_cell),
            Paragraph("Proceder con la entrega del vehículo al cliente.", table_cell)
        ],
        [
            Paragraph("<font color='#DC2626'><b>DECLINED / RECHAZADO</b></font>", table_cell),
            Paragraph("Sin cupo o tarjeta no autorizada.", table_cell),
            Paragraph("No entregar auto. Solicitar otra tarjeta de crédito.", table_cell)
        ],
        [
            Paragraph("<font color='#D97706'><b>ANTIFRAUD_REJECTED</b></font>", table_cell),
            Paragraph("Alerta de seguridad bancaria.", table_cell),
            Paragraph("Verificar cédula física original y titular de tarjeta.", table_cell)
        ]
    ]
    sem_table = Table(sem_data, colWidths=[140, 160, 204])
    sem_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_navy),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_slate_light]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(sem_table)
    story.append(Spacer(1, 12))

    # ==================== CIERRE Y FORMALIZACIÓN ====================
    closing_data = [
        [
            Paragraph("<b>Propuesta Técnica Elaborada por:</b><br/>Equipo de Ingeniería Full Stack<br/>CORJAR Computers Solutions", table_cell),
            Paragraph("<b>Aprobación y Recepción:</b><br/>Gerencia General / Dirección de Operaciones<br/>Dinamo Rent a Car", table_cell)
        ]
    ]
    closing_table = Table(closing_data, colWidths=[250, 254])
    closing_table.setStyle(TableStyle([
        ('LINEABOVE', (0,0), (-1,-1), 1, c_navy),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(KeepTogether([closing_table]))

    doc.build(story, canvasmaker=DinamoNumberedCanvas)
    print(f"PDF consolidado generado con éxito en: {output_path}")


if __name__ == '__main__':
    target = os.path.join(r"d:\Proyectos\Dinamo_Rent_a_Car WEB", "Plan_Maestro_Dinamo_Rent_a_Car.pdf")
    generate_consolidated_pdf(target)
