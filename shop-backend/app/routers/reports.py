from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_role
from app.models.bill import Bill, BillItem
from app.models.inventory import Inventory
from app.models.product import Product
from app.models.user import User, UserRole

router = APIRouter(prefix="/reports", tags=["reports"])

SHOP_TZ = ZoneInfo("Asia/Kolkata")


class DailySalesReport(BaseModel):
    date: date
    total_revenue: Decimal
    total_bills: int
    total_items_sold: int


class LowStockItem(BaseModel):
    product_id: int
    name: str
    barcode: str | None
    quantity: int
    reorder_threshold: int


class TopProductItem(BaseModel):
    product_id: int
    name: str
    total_quantity_sold: int
    total_revenue: Decimal


# GET /reports/daily-sales
# WHY aggregate in SQL: a busy shop can ring hundreds of bills/day; summing total_amount and
# item quantities in Postgres returns one row of numbers, instead of shipping every Bill /
# BillItem into Python RAM and looping — that only gets slower and riskier as history grows.
@router.get("/daily-sales", response_model=DailySalesReport)
def daily_sales(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.OWNER))],
    report_date: Annotated[
        date | None,
        Query(alias="date", description="Calendar day in shop local time (Asia/Kolkata)"),
    ] = None,
) -> DailySalesReport:
    day = report_date or datetime.now(SHOP_TZ).date()
    start = datetime.combine(day, time.min, tzinfo=SHOP_TZ)
    end = start + timedelta(days=1)

    revenue_row = db.execute(
        select(
            func.coalesce(func.sum(Bill.total_amount), 0),
            func.count(Bill.id),
        ).where(
            Bill.created_at >= start,
            Bill.created_at < end,
        )
    ).one()

    items_sold = db.scalar(
        select(func.coalesce(func.sum(BillItem.quantity), 0))
        .select_from(BillItem)
        .join(Bill, BillItem.bill_id == Bill.id)
        .where(
            Bill.created_at >= start,
            Bill.created_at < end,
        )
    )

    total_revenue = Decimal(str(revenue_row[0])).quantize(Decimal("0.01"))
    return DailySalesReport(
        date=day,
        total_revenue=total_revenue,
        total_bills=int(revenue_row[1]),
        total_items_sold=int(items_sold or 0),
    )


# GET /reports/low-stock
# WHY filter in SQL: inventory can hold thousands of SKUs; pushing quantity <= threshold into
# the WHERE clause lets the DB use indexes and return only the short list, instead of loading
# every Product+Inventory row into Python just to drop most of them afterward.
@router.get("/low-stock", response_model=list[LowStockItem])
def low_stock(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.OWNER))],
) -> list[LowStockItem]:
    rows = db.execute(
        select(
            Product.id,
            Product.name,
            Product.barcode,
            Inventory.quantity,
            Inventory.reorder_threshold,
        )
        .join(Inventory, Inventory.product_id == Product.id)
        .where(Inventory.quantity <= Inventory.reorder_threshold)
        .order_by(Inventory.quantity.asc(), Product.name.asc())
    ).all()

    return [
        LowStockItem(
            product_id=row.id,
            name=row.name,
            barcode=row.barcode,
            quantity=row.quantity,
            reorder_threshold=row.reorder_threshold,
        )
        for row in rows
    ]


# GET /reports/top-products
# WHY GROUP BY + SUM in SQL: over a week you may have tens of thousands of BillItem rows;
# Postgres can hash-aggregate by product_id and return 10 rows. Doing the same in Python means
# transferring the full window over the wire and holding it in memory on every request.
@router.get("/top-products", response_model=list[TopProductItem])
def top_products(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.OWNER))],
    days: Annotated[int, Query(ge=1, le=365)] = 7,
) -> list[TopProductItem]:
    window_start = datetime.now(SHOP_TZ) - timedelta(days=days)

    rows = db.execute(
        select(
            Product.id,
            Product.name,
            func.coalesce(func.sum(BillItem.quantity), 0).label("total_quantity_sold"),
            func.coalesce(func.sum(BillItem.line_total), 0).label("total_revenue"),
        )
        .join(BillItem, BillItem.product_id == Product.id)
        .join(Bill, BillItem.bill_id == Bill.id)
        .where(Bill.created_at >= window_start)
        .group_by(Product.id, Product.name)
        .order_by(func.sum(BillItem.quantity).desc(), Product.name.asc())
        .limit(10)
    ).all()

    return [
        TopProductItem(
            product_id=row.id,
            name=row.name,
            total_quantity_sold=int(row.total_quantity_sold),
            total_revenue=Decimal(str(row.total_revenue)).quantize(Decimal("0.01")),
        )
        for row in rows
    ]
