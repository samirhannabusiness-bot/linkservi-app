#!/usr/bin/env python3
"""
LinkServi Sync Agent - Manual Técnico (PDF corporativo).

Diseño limpio: fondo blanco, alto contraste, sin elementos detrás del texto.
Genera dist/LinkServi-Sync-Agent-Manual-Tecnico.pdf
"""

from pathlib import Path
from reportlab.lib.colors import HexColor, white, Color
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table,
    TableStyle, KeepTogether, PageBreak, NextPageTemplate,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY


BRAND_PRIMARY = HexColor("#1E40AF")
BRAND_ACCENT  = HexColor("#0EA5E9")
BRAND_DEEP    = HexColor("#0C2A6B")

INK         = HexColor("#0F172A")
INK_SOFT    = HexColor("#334155")
MUTED       = HexColor("#64748B")
LINE        = HexColor("#E2E8F0")
LINE_STRONG = HexColor("#CBD5E1")
SOFT_BG     = HexColor("#F8FAFC")
ROW_ALT     = HexColor("#F1F5F9")
HIGHLIGHT   = HexColor("#EFF6FF")

LOGO_PATH = Path(__file__).resolve().parent / "linkservi-logo.png"
LOGO_IMG = ImageReader(str(LOGO_PATH)) if LOGO_PATH.exists() else None
LOGO_RATIO = 2000 / 500


def draw_logo(c: canvas.Canvas, x: float, y: float, height: float,
              dark_bg: bool = False) -> None:
    if LOGO_IMG is None:
        return
    width = height * LOGO_RATIO
    if dark_bg:
        c.saveState()
        c.setFillColor(BRAND_DEEP)
        c.roundRect(x - 4, y - 3, width + 8, height + 6, 4, stroke=0, fill=1)
        c.restoreState()
    c.drawImage(LOGO_IMG, x, y, width=width, height=height,
                mask="auto", preserveAspectRatio=True)


def draw_cover(c: canvas.Canvas, w: float, h: float) -> None:
    c.setFillColor(white)
    c.rect(0, 0, w, h, stroke=0, fill=1)

    c.setFillColor(BRAND_PRIMARY)
    c.rect(0, h - 6 * mm, w, 6 * mm, stroke=0, fill=1)
    c.setFillColor(BRAND_ACCENT)
    c.rect(0, h - 8 * mm, w, 2 * mm, stroke=0, fill=1)

    c.setFillColor(BRAND_PRIMARY)
    c.rect(0, 0, 8 * mm, h - 8 * mm, stroke=0, fill=1)

    logo_h = 70
    logo_w = logo_h * LOGO_RATIO
    draw_logo(c, (w - logo_w) / 2, h - 200, logo_h, dark_bg=True)

    c.setFillColor(BRAND_ACCENT)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(w / 2, h - 240, "DOCUMENTO TÉCNICO")

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 36)
    c.drawCentredString(w / 2, h - 290, "Sync Agent")

    c.setFillColor(INK_SOFT)
    c.setFont("Helvetica", 18)
    c.drawCentredString(w / 2, h - 320, "Manual Técnico de Distribución")

    c.setStrokeColor(BRAND_ACCENT)
    c.setLineWidth(2.5)
    c.line(w * 0.40, h - 345, w * 0.60, h - 345)

    c.setFillColor(INK_SOFT)
    c.setFont("Helvetica", 11)
    c.drawCentredString(
        w / 2, h - 380,
        "Puente de sincronización entre SAINT Administrativo")
    c.drawCentredString(w / 2, h - 396, "y la plataforma LinkServi")

    box_y = 180
    box_h = 90
    box_w = w - 80
    c.setFillColor(SOFT_BG)
    c.roundRect(40, box_y, box_w, box_h, 6, stroke=0, fill=1)
    c.setStrokeColor(LINE_STRONG)
    c.setLineWidth(0.5)
    c.roundRect(40, box_y, box_w, box_h, 6, stroke=1, fill=0)

    items = [
        ("Versión",       "1.0.0"),
        ("Plataforma",    "Windows 10 / 11"),
        ("Distribución",  "Instalador NSIS"),
        ("Tamaño",        "65 MB / 20 MB"),
    ]
    col_w = box_w / 4
    for i, (k, v) in enumerate(items):
        cx = 40 + col_w * (i + 0.5)
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(cx, box_y + box_h - 28, k.upper())
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 13)
        c.drawCentredString(cx, box_y + box_h - 52, v)
        if i < 3:
            c.setStrokeColor(LINE_STRONG)
            c.setLineWidth(0.5)
            c.line(40 + col_w * (i + 1), box_y + 16,
                   40 + col_w * (i + 1), box_y + box_h - 16)

    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(40, 80, w - 40, 80)

    c.setFillColor(BRAND_PRIMARY)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, 60, "LinkServi · 2026")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(40, 46, "Documento confidencial · Distribución autorizada")
    c.setFillColor(MUTED)
    c.drawRightString(w - 40, 46, "linkservi.com")


def draw_header(c: canvas.Canvas, doc) -> None:
    w, h = A4
    c.setFillColor(white)
    c.rect(0, 0, w, h, stroke=0, fill=1)

    draw_logo(c, 18 * mm, h - 17 * mm, 8 * mm, dark_bg=True)

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(18 * mm + 8 * mm * LOGO_RATIO + 6, h - 12 * mm,
                 "SYNC AGENT · MANUAL TÉCNICO")

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(w - 18 * mm, h - 12 * mm,
                      f"PÁGINA {doc.page}")

    c.setStrokeColor(BRAND_ACCENT)
    c.setLineWidth(1.5)
    c.line(18 * mm, h - 20 * mm, w - 18 * mm, h - 20 * mm)

    c.setStrokeColor(LINE)
    c.setLineWidth(0.4)
    c.line(18 * mm, 16 * mm, w - 18 * mm, 16 * mm)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(18 * mm, 11 * mm,
                 "© 2026 LinkServi · Documento técnico confidencial")
    c.drawRightString(w - 18 * mm, 11 * mm, "linkservi.com")


def make_styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"],
            fontName="Helvetica-Bold", fontSize=22, leading=28,
            textColor=INK, spaceBefore=0, spaceAfter=4,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"],
            fontName="Helvetica-Bold", fontSize=14, leading=18,
            textColor=BRAND_PRIMARY, spaceBefore=14, spaceAfter=8,
        ),
        "h3": ParagraphStyle(
            "h3", parent=base["Heading3"],
            fontName="Helvetica-Bold", fontSize=11, leading=14,
            textColor=INK, spaceBefore=8, spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "body", parent=base["BodyText"],
            fontName="Helvetica", fontSize=10, leading=15,
            textColor=INK_SOFT, spaceAfter=6, alignment=TA_JUSTIFY,
        ),
        "lead": ParagraphStyle(
            "lead", parent=base["BodyText"],
            fontName="Helvetica", fontSize=11, leading=17,
            textColor=INK, spaceAfter=12, alignment=TA_LEFT,
        ),
        "bullet": ParagraphStyle(
            "bullet", parent=base["BodyText"],
            fontName="Helvetica", fontSize=10, leading=15,
            textColor=INK_SOFT, leftIndent=14, bulletIndent=4, spaceAfter=3,
        ),
        "caption": ParagraphStyle(
            "caption", parent=base["BodyText"],
            fontName="Helvetica-Oblique", fontSize=8.5, leading=11,
            textColor=MUTED, spaceAfter=6,
        ),
        "code": ParagraphStyle(
            "code", parent=base["BodyText"],
            fontName="Courier", fontSize=8.5, leading=12,
            textColor=INK, backColor=SOFT_BG, borderPadding=8,
            borderColor=LINE, borderWidth=0.5,
            spaceBefore=4, spaceAfter=8,
        ),
        "kicker": ParagraphStyle(
            "kicker", parent=base["BodyText"],
            fontName="Helvetica-Bold", fontSize=9, leading=11,
            textColor=BRAND_ACCENT, spaceAfter=4,
        ),
    }


def section_title(text: str, kicker: str, st: dict):
    rule = Table([[""]], colWidths=[40 * mm], rowHeights=[2.5])
    rule.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND_ACCENT),
    ]))
    return KeepTogether([
        Paragraph(kicker.upper(), st["kicker"]),
        Paragraph(text, st["h1"]),
        Spacer(1, 4),
        rule,
        Spacer(1, 12),
    ])


def info_card(title: str, body: str, st: dict):
    title_p = Paragraph(
        f'<font color="{BRAND_PRIMARY.hexval()}"><b>{title}</b></font>',
        st["h3"])
    body_p = Paragraph(body, st["body"])
    inner = Table([[title_p], [body_p]], colWidths=[174 * mm - 24])
    inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    t = Table([[inner]], colWidths=[174 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HIGHLIGHT),
        ("LINEBEFORE", (0, 0), (0, -1), 3, BRAND_ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    return t


def step_card(num: int, title: str, body: str, st: dict):
    n = Paragraph(
        f'<font color="white" size="20"><b>{num}</b></font>',
        ParagraphStyle("n", fontName="Helvetica-Bold", fontSize=20,
                       leading=22, alignment=TA_CENTER))
    t_p = Paragraph(title, ParagraphStyle(
        "stitle", fontName="Helvetica-Bold", fontSize=12,
        leading=15, textColor=BRAND_PRIMARY, spaceAfter=2))
    b_p = Paragraph(body, st["body"])
    inner = Table([[t_p], [b_p]], colWidths=[150 * mm])
    inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    t = Table([[n, inner]], colWidths=[18 * mm, 156 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), BRAND_PRIMARY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("BACKGROUND", (1, 0), (1, 0), white),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE_STRONG),
        ("LEFTPADDING", (1, 0), (1, 0), 14),
        ("RIGHTPADDING", (1, 0), (1, 0), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    return t


def styled_table(rows, col_widths, header_color=BRAND_PRIMARY,
                 first_col_bold=True, highlight_col=None):
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), header_color),
        ("TEXTCOLOR",  (0, 0), (-1, 0), white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, 0), 9.5),
        ("FONTSIZE",   (0, 1), (-1, -1), 9),
        ("TEXTCOLOR",  (0, 1), (-1, -1), INK),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",      (0, 0), (-1, 0), "LEFT"),
        ("LINEBELOW",  (0, 0), (-1, -1), 0.4, LINE),
        ("BOX",        (0, 0), (-1, -1), 0.5, LINE_STRONG),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]
    if first_col_bold:
        style.append(("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"))
    for r in range(2, len(rows), 2):
        style.append(("BACKGROUND", (0, r), (-1, r), ROW_ALT))
    if highlight_col is not None:
        style.append(("BACKGROUND",
                      (highlight_col, 1), (highlight_col, -1), HIGHLIGHT))
        style.append(("FONTNAME",
                      (highlight_col, 1), (highlight_col, -1), "Helvetica-Bold"))
    t.setStyle(TableStyle(style))
    return t


def build_pdf(out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    w, h = A4

    frame = Frame(18 * mm, 18 * mm, w - 36 * mm, h - 42 * mm,
                  id="body", showBoundary=0)

    def cover_page(c, doc):
        draw_cover(c, w, h)

    cover_template = PageTemplate(id="cover", frames=[frame],
                                  onPage=cover_page)
    body_template = PageTemplate(id="body", frames=[frame],
                                 onPage=draw_header)

    doc = BaseDocTemplate(
        str(out_path), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=24 * mm, bottomMargin=20 * mm,
        title="LinkServi Sync Agent · Manual Técnico",
        author="LinkServi", subject="Manual técnico",
    )
    doc.addPageTemplates([cover_template, body_template])

    st = make_styles()
    story = []

    story.append(NextPageTemplate("body"))
    story.append(PageBreak())

    story.append(section_title("Resumen ejecutivo", "Sección 1", st))
    story.append(Paragraph(
        "El <b>LinkServi Sync Agent</b> es una aplicación de escritorio para "
        "Windows que se instala en la computadora donde corre <b>SAINT "
        "Administrativo</b> y mantiene sincronizados los productos, precios "
        "y stock con la plataforma LinkServi en la nube. Funciona como un "
        "puente local punto-a-punto: lee de la base de datos del ERP, "
        "transforma los datos al formato canónico de LinkServi y los "
        "publica vía HTTPS al backend, sin intermediarios.", st["lead"]))

    story.append(info_card(
        "Propuesta de valor",
        "Cero fricción para el comerciante: descarga el instalador, ejecuta "
        "doble click, completa un asistente de 4 pasos en el navegador y se "
        "olvida. El catálogo de su tienda LinkServi queda alineado con su "
        "SAINT en minutos. No hay archivos CSV, ni cargas manuales, ni "
        "scripts ad-hoc, ni personal técnico permanente.", st))

    story.append(Paragraph("Capacidades principales", st["h2"]))
    for it in [
        "Publicar el catálogo de SAINT en LinkServi sin cargas manuales.",
        "Mantener precios y stock alineados entre el ERP y la tienda.",
        "Detectar bajas y altas de productos automáticamente cada N minutos.",
        "Operar sin internet permanente: si la red falla, reintenta solo "
        "con backoff exponencial.",
        "Auditar la operación: cada ciclo queda registrado en logs rotativos "
        "accesibles desde la propia interfaz.",
    ]:
        story.append(Paragraph(f"•&nbsp;&nbsp;{it}", st["bullet"]))

    story.append(Paragraph("Ubicación de los binarios", st["h2"]))
    story.append(Paragraph(
        "Los archivos generados se encuentran en la carpeta "
        "<b>sync-agent/dist/</b> del proyecto:", st["body"]))
    story.append(Paragraph(
        "linkservi-sync-agent.exe<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;65 MB · Ejecutable portable independiente<br/>"
        "<br/>"
        "LinkServi-Sync-Agent-Setup-1.0.0.exe<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;20 MB · Instalador NSIS para distribución a clientes",
        st["code"]))

    story.append(PageBreak())

    story.append(section_title("Instalación y uso", "Sección 2", st))
    story.append(Paragraph(
        "El flujo está pensado para que el cliente final no requiera "
        "asistencia técnica. Cuatro pasos visibles en la interfaz hasta "
        "que toda la configuración queda validada.", st["lead"]))

    story.append(step_card(
        1, "Instalación",
        "El cliente recibe <b>LinkServi-Sync-Agent-Setup-1.0.0.exe</b> por "
        "correo o descarga. Doble click, siguiente, instalar. El instalador "
        "crea acceso directo en escritorio, registro en menú inicio y opción "
        "de arranque automático con Windows.", st))
    story.append(Spacer(1, 8))

    story.append(step_card(
        2, "Primer arranque y asistente",
        "El agente arranca, abre el navegador en <b>http://127.0.0.1:7777</b> "
        "y muestra un asistente de cuatro pasos: pegar la API Key de "
        "LinkServi, configurar la conexión a SAINT, presionar el botón "
        "<b>Probar todo</b> y finalmente activar la sincronización.", st))
    story.append(Spacer(1, 8))

    story.append(step_card(
        3, "Operación diaria",
        "Una vez activo, el agente corre en segundo plano junto con Windows. "
        "Cada ciclo, configurable por defecto a 15 minutos, lee SAINT, "
        "calcula los cambios y publica al backend. La interfaz muestra "
        "estado de conexión, último sync, productos enviados y un indicador "
        "de salud verde, ámbar o rojo en el encabezado.", st))
    story.append(Spacer(1, 8))

    story.append(step_card(
        4, "Soporte y diagnóstico",
        "El endpoint <b>/api/health</b> retorna el estado completo del "
        "sistema. El endpoint <b>/api/logs</b> permite consultar los últimos "
        "eventos. Los logs persistentes se guardan en "
        "<b>%LOCALAPPDATA%\\LinkServiSyncAgent\\logs\\</b> con rotación "
        "diaria y retención de 30 días.", st))

    story.append(PageBreak())

    story.append(section_title("Tecnología", "Sección 3", st))
    story.append(Paragraph(
        "Construido sobre Node.js empaquetado como ejecutable nativo, "
        "sin dependencias de frameworks pesados ni runtimes externos. "
        "El cliente no necesita instalar Node, .NET, JVM ni ningún otro "
        "componente previo.", st["lead"]))

    stack_rows = [
        ["Capa", "Tecnología", "Detalle"],
        ["Runtime",     "Node.js 22 LTS",     "Embebido vía @yao-pkg/pkg"],
        ["Interfaz",    "HTML, CSS, JS vanilla", "Sin frameworks externos"],
        ["Servidor",    "http nativo Node",    "Loopback 127.0.0.1:7777"],
        ["Cliente DB",  "node-mssql (Tedious)","Pooling y reconexión auto"],
        ["Cliente API", "fetch nativo",        "TLS 1.2 / 1.3 obligatorio"],
        ["Logs",        "Rotación diaria",     "30 días de retención"],
        ["Empaquetado", "@yao-pkg/pkg",        "node22-win-x64"],
        ["Instalador",  "NSIS Modern UI",      "Setup firmado opcional"],
        ["Code-signing","signtool / osslsigncode", "PFX + timestamp DigiCert"],
    ]
    story.append(styled_table(
        stack_rows, [32 * mm, 50 * mm, 92 * mm]))

    story.append(Paragraph("Principios de diseño", st["h2"]))
    for it in [
        "<b>Single binary</b>: un único .exe portable sin dependencias externas.",
        "<b>Loopback only</b>: la interfaz escucha sólo en 127.0.0.1, "
        "nunca expone puertos a la red local.",
        "<b>Fallback robusto</b>: si el puerto 7777 está ocupado, prueba "
        "automáticamente del 7778 al 7787.",
        "<b>Recovery silencioso</b>: errores de red o base de datos no "
        "detienen el ciclo, sólo reintentan con backoff exponencial.",
        "<b>Logs sin secretos</b>: las API keys y contraseñas nunca se "
        "escriben a disco ni se exponen en endpoints.",
        "<b>Modo producción</b>: la bandera <b>--production</b> silencia "
        "la consola para ejecución como servicio Windows.",
    ]:
        story.append(Paragraph(f"•&nbsp;&nbsp;{it}", st["bullet"]))

    story.append(PageBreak())

    story.append(section_title(
        "Comparativa con plataformas de alto nivel", "Sección 4", st))
    story.append(Paragraph(
        "El Sync Agent ocupa el nicho de <b>middleware vertical específico</b>. "
        "No compite directamente con plataformas iPaaS generalistas, sino "
        "que ofrece la integración SAINT-LinkServi con un costo total de "
        "propiedad radicalmente menor.", st["lead"]))

    comp_rows = [
        ["Característica",
         "Sync Agent",
         "MuleSoft\nAnypoint",
         "Dell Boomi\nAtomSphere",
         "Zapier\nfor Companies"],
        ["Costo de licencia anual",
         "Incluido", "USD 80k+", "USD 50k+", "USD 6k+"],
        ["Conexión nativa SAINT",
         "Sí", "No", "No", "No"],
        ["Instalación en 1 click",
         "Sí", "No", "No", "N/A"],
        ["Sin internet permanente",
         "Sí", "Parcial", "Parcial", "No"],
        ["Interfaz local en navegador",
         "Sí", "Sólo cloud", "Sólo cloud", "Sólo cloud"],
        ["Sin infraestructura cloud",
         "Sí", "No", "No", "No"],
        ["Datos no salen a terceros",
         "Sí", "No", "No", "No"],
        ["Tiempo de puesta en marcha",
         "5 min", "Semanas", "Semanas", "Días"],
        ["Personal técnico requerido",
         "Ninguno", "Equipo", "Equipo", "Junior"],
    ]
    story.append(styled_table(
        comp_rows,
        [55 * mm, 28 * mm, 28 * mm, 28 * mm, 28 * mm],
        highlight_col=1,
    ))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Las cifras de costo son referenciales públicas de los sitios "
        "oficiales y reportes Gartner 2024-2025. MuleSoft, Boomi y Zapier "
        "son productos generalistas excelentes para integraciones "
        "empresariales amplias. El LinkServi Sync Agent es un componente "
        "vertical optimizado para un único caso de uso.", st["caption"]))

    story.append(Paragraph("Cuándo usar cada solución", st["h2"]))
    story.append(Paragraph(
        "<b>Sync Agent.</b> Cuando la necesidad es exclusivamente "
        "sincronizar SAINT con LinkServi y se prioriza tiempo de puesta "
        "en marcha, costo cero adicional y autonomía del cliente.",
        st["body"]))
    story.append(Paragraph(
        "<b>iPaaS generalista (MuleSoft, Boomi).</b> Cuando la empresa "
        "requiere orquestar decenas de sistemas heterogéneos, "
        "transformaciones complejas y gobierno centralizado de APIs.",
        st["body"]))
    story.append(Paragraph(
        "<b>Zapier o Make.</b> Cuando se requieren automatizaciones "
        "rápidas entre servicios SaaS sin desarrollo, pero el ERP local "
        "no es accesible o no se quiere exponer a internet.", st["body"]))

    story.append(PageBreak())

    story.append(section_title(
        "Soporte y despliegue", "Sección 5", st))

    contact_rows = [
        ["Canal", "Para qué", "Tiempo de respuesta"],
        ["soporte@linkservi.com",
         "Incidentes, bugs, configuración", "Menos de 24h hábiles"],
        ["Logs locales",
         "Diagnóstico inmediato desde la UI", "Tiempo real"],
        ["/api/health",
         "Monitoreo automatizado externo", "Tiempo real"],
        ["BUILD.md",
         "Reconstruir o personalizar instalador", "Self-service"],
    ]
    story.append(styled_table(
        contact_rows, [55 * mm, 75 * mm, 44 * mm]))

    story.append(Paragraph("Checklist de despliegue", st["h2"]))
    for it in [
        "API Key de LinkServi generada en backoffice.",
        "Credenciales SAINT validadas con permiso de lectura.",
        "Puerto 7777 (rango 7777 a 7787) disponible en la máquina destino.",
        "Acceso saliente HTTPS hacia api.linkservi.com en el puerto 443.",
        "Política de antivirus que permita ejecutables firmados de LinkServi.",
        "Política de respaldos que incluya %LOCALAPPDATA%\\LinkServiSyncAgent\\.",
    ]:
        story.append(Paragraph(f"•&nbsp;&nbsp;{it}", st["bullet"]))

    story.append(Spacer(1, 16))
    story.append(Paragraph(
        "Este documento es propiedad intelectual de LinkServi. Su "
        "distribución está restringida al personal técnico autorizado del "
        "cliente. Para consultas comerciales o de licenciamiento dirigirse "
        "a <b>contacto@linkservi.com</b>.", st["caption"]))

    doc.build(story)
    print(f"OK: {out_path}")


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    out = here.parent / "dist" / "LinkServi-Sync-Agent-Manual-Tecnico.pdf"
    build_pdf(out)
