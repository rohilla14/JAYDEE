"""Thermal-style product label PDFs (Code128 via reportlab)."""

from __future__ import annotations

from io import BytesIO
from typing import Sequence

from reportlab.graphics.barcode import code128
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.models.product import Product

# Single thermal label size (~50mm x 30mm).
LABEL_WIDTH = 50 * mm
LABEL_HEIGHT = 30 * mm

# Bulk sheet: grid of the same labels on an A4 page for office-printer testing.
SHEET_WIDTH = 210 * mm
SHEET_HEIGHT = 297 * mm
SHEET_MARGIN_X = 10 * mm
SHEET_MARGIN_Y = 10 * mm
SHEET_GAP_X = 4 * mm
SHEET_GAP_Y = 4 * mm


def _draw_label(c: canvas.Canvas, product: Product, origin_x: float, origin_y: float) -> None:
    """Draw one label with origin at bottom-left of the label box."""
    barcode_value = product.barcode or f"ID-{product.id}"
    name = (product.name or "")[:36]
    price = f"Rs {product.mrp}"

    # Light border so labels are visible when tiled on a sheet.
    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.setLineWidth(0.4)
    c.rect(origin_x, origin_y, LABEL_WIDTH, LABEL_HEIGHT)

    barcode = code128.Code128(
        barcode_value,
        barHeight=11 * mm,
        barWidth=0.85,
        humanReadable=False,
    )
    barcode_x = origin_x + (LABEL_WIDTH - barcode.width) / 2
    barcode_y = origin_y + 11 * mm
    barcode.drawOn(c, barcode_x, barcode_y)

    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 6)
    c.drawCentredString(origin_x + LABEL_WIDTH / 2, origin_y + 7.5 * mm, barcode_value)

    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(origin_x + LABEL_WIDTH / 2, origin_y + 4.2 * mm, name)

    c.setFont("Helvetica", 7)
    c.drawCentredString(origin_x + LABEL_WIDTH / 2, origin_y + 1.5 * mm, price)


def build_single_label_pdf(product: Product) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(LABEL_WIDTH, LABEL_HEIGHT))
    _draw_label(c, product, 0, 0)
    c.showPage()
    c.save()
    return buffer.getvalue()


def build_bulk_labels_pdf(products: Sequence[Product]) -> bytes:
    """Tile labels on A4 so several can be printed before a thermal printer is ready."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(SHEET_WIDTH, SHEET_HEIGHT))

    usable_w = SHEET_WIDTH - 2 * SHEET_MARGIN_X
    cols = max(1, int((usable_w + SHEET_GAP_X) // (LABEL_WIDTH + SHEET_GAP_X)))
    rows = max(
        1,
        int(
            (SHEET_HEIGHT - 2 * SHEET_MARGIN_Y + SHEET_GAP_Y)
            // (LABEL_HEIGHT + SHEET_GAP_Y)
        ),
    )
    per_page = cols * rows

    for index, product in enumerate(products):
        if index > 0 and index % per_page == 0:
            c.showPage()

        slot = index % per_page
        col = slot % cols
        row = slot // cols
        x = SHEET_MARGIN_X + col * (LABEL_WIDTH + SHEET_GAP_X)
        # PDF y grows upward; row 0 is top of sheet.
        y = (
            SHEET_HEIGHT
            - SHEET_MARGIN_Y
            - (row + 1) * LABEL_HEIGHT
            - row * SHEET_GAP_Y
        )
        _draw_label(c, product, x, y)

    c.showPage()
    c.save()
    return buffer.getvalue()
