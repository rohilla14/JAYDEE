"""Set default reorder_threshold values for all inventory rows.

Rule: floor(20% of current quantity), minimum 2.
Run from shop-backend/:  .venv/bin/python scripts/set_default_thresholds.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python scripts/set_default_thresholds.py` from shop-backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.inventory import Inventory
from app.models.product import Product


def default_threshold(quantity: int) -> int:
    return max(2, quantity // 5)


def main() -> None:
    db = SessionLocal()
    try:
        rows = db.execute(
            select(Inventory, Product.name)
            .join(Product, Product.id == Inventory.product_id)
            .order_by(Inventory.product_id)
        ).all()

        if not rows:
            print("No inventory rows found.")
            return

        print(f"Updating reorder_threshold for {len(rows)} product(s):")
        for inv, name in rows:
            new_threshold = default_threshold(inv.quantity)
            print(
                f"  [{inv.product_id}] {name}: qty={inv.quantity} "
                f"threshold {inv.reorder_threshold} -> {new_threshold}"
            )
            inv.reorder_threshold = new_threshold

        db.commit()
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
