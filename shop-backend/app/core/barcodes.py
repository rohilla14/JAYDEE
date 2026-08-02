"""Auto-generate unique product barcodes from category + sequence."""

from __future__ import annotations

import re

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.product import Product

_STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "for",
        "in",
        "of",
        "on",
        "school",
        "shop",
        "the",
        "to",
    }
)


def category_prefix(name: str) -> str:
    """Derive a 3-letter prefix, e.g. 'School Uniforms' -> 'UNI'."""
    tokens = re.findall(r"[A-Za-z0-9]+", name)
    significant = [t for t in tokens if t.lower() not in _STOP_WORDS]
    source = significant[0] if significant else (tokens[0] if tokens else "CAT")
    prefix = re.sub(r"[^A-Za-z0-9]", "", source).upper()[:3]
    if len(prefix) < 3:
        joined = "".join(significant or tokens or ["CAT"]).upper()
        prefix = (joined + "XXX")[:3]
    return prefix


def generate_barcode(category_id: int, db: Session) -> str:
    """Return a unique SHOP-{prefix}-{seq} barcode for the category.

    Uses a Postgres transaction-scoped advisory lock on category_id so two
    concurrent creates cannot mint the same next sequence number.
    """
    category = db.get(Category, category_id)
    if category is None:
        raise ValueError(f"Category {category_id} not found")

    # Hold until this transaction commits/rolls back — serializes generators
    # for the same category without blocking unrelated categories.
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": int(category_id)})

    prefix = category_prefix(category.name)
    like_pattern = f"SHOP-{prefix}-%"

    existing = db.scalars(
        select(Product.barcode).where(
            Product.category_id == category_id,
            Product.barcode.like(like_pattern),
        )
    ).all()

    max_seq = 0
    for barcode in existing:
        if not barcode:
            continue
        tail = barcode.rsplit("-", 1)[-1]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))

    next_seq = max_seq + 1
    while True:
        candidate = f"SHOP-{prefix}-{next_seq:04d}"
        taken = db.scalar(select(Product.id).where(Product.barcode == candidate))
        if taken is None:
            return candidate
        next_seq += 1
