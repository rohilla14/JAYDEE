from decimal import ROUND_FLOOR, Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.pricing import POINTS_PER_RUPEE, TIER_DISCOUNTS, TIER_THRESHOLDS
from app.core.security import require_role
from app.models.bill import Bill, BillItem
from app.models.customer import Customer, CustomerTier
from app.models.inventory import Inventory
from app.models.product import Product
from app.models.user import User, UserRole
from app.schemas.bill import BillCreate, BillItemRead, BillRead

router = APIRouter(tags=["billing"])

_TIER_RANK = {
    CustomerTier.BRONZE: 0,
    CustomerTier.SILVER: 1,
    CustomerTier.GOLD: 2,
}


def _unit_price_for_tier(mrp: Decimal, tier: CustomerTier | None) -> Decimal:
    if tier is None:
        return mrp.quantize(Decimal("0.01"))
    discount = TIER_DISCOUNTS[tier.value]
    return (mrp * (Decimal("1") - discount)).quantize(Decimal("0.01"))


def _maybe_upgrade_tier(customer: Customer) -> None:
    """Upgrade tier from lifetime_spend thresholds; never downgrade."""
    target = CustomerTier.BRONZE
    if customer.lifetime_spend >= TIER_THRESHOLDS["gold"]:
        target = CustomerTier.GOLD
    elif customer.lifetime_spend >= TIER_THRESHOLDS["silver"]:
        target = CustomerTier.SILVER

    if _TIER_RANK[target] > _TIER_RANK[customer.tier]:
        customer.tier = target


# POST /bills
# Creates a sale: tier-discount pricing, bill rows, stock deduct, and loyalty updates in one transaction.
@router.post(
    "/bills",
    response_model=BillRead,
    status_code=status.HTTP_201_CREATED,
)
def create_bill(
    body: BillCreate,
    db: Annotated[Session, Depends(get_db)],
    # WHY: only owners and cashiers should ring up sales — stock_staff must not create bills.
    current_user: Annotated[
        User, Depends(require_role(UserRole.OWNER, UserRole.BILLING_STAFF))
    ],
) -> BillRead:
    try:
        # WHY: load every product/inventory up front so we can validate the whole cart before writing
        # anything — a missing product mid-loop would otherwise leave half-validated state in memory.
        products_by_id: dict[int, Product] = {}
        for item in body.items:
            if item.product_id in products_by_id:
                continue
            product = db.scalar(
                select(Product)
                .where(Product.id == item.product_id)
                .options(selectinload(Product.inventory))
            )
            if product is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Product {item.product_id} not found",
                )
            if product.inventory is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Inventory record not found for product {item.product_id}",
                )
            products_by_id[item.product_id] = product

        # WHY: sum demand per product across lines so two scans of the same SKU can't sneak past
        # a per-line stock check that would each look fine but together oversell.
        requested_by_product: dict[int, int] = {}
        for item in body.items:
            requested_by_product[item.product_id] = (
                requested_by_product.get(item.product_id, 0) + item.quantity
            )

        # WHY: reject the entire bill if anything is short — partial billing would sell some items,
        # leave the customer confused, and make stock/bill totals disagree with what was scanned.
        shortages: list[str] = []
        for product_id, needed in requested_by_product.items():
            inventory = products_by_id[product_id].inventory
            assert inventory is not None
            if inventory.quantity < needed:
                shortages.append(
                    f"product_id={product_id} "
                    f"(needed {needed}, available {inventory.quantity})"
                )
        if shortages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Insufficient stock for one or more items; bill not created",
                    "shortages": shortages,
                },
            )

        # WHY: load the customer once for tier-based % off MRP; walk-ins stay at full MRP.
        # Capture tier_applied here so a mid-bill upgrade does not rewrite what this sale charged.
        customer: Customer | None = None
        customer_tier_applied: CustomerTier | None = None
        if body.customer_id is not None:
            customer = db.get(Customer, body.customer_id)
            if customer is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Customer not found",
                )
            customer_tier_applied = customer.tier

        # WHY: compute every line total in memory first so the Bill.total_amount we insert is exact
        # and matches the BillItem rows we are about to write — no second-pass recalculation.
        prepared_items: list[dict] = []
        total_amount = Decimal("0.00")
        mrp_subtotal = Decimal("0.00")
        for item in body.items:
            product = products_by_id[item.product_id]
            unit_price = _unit_price_for_tier(product.mrp, customer_tier_applied)
            line_total = (unit_price * item.quantity).quantize(Decimal("0.01"))
            mrp_line = (product.mrp * item.quantity).quantize(Decimal("0.01"))
            total_amount += line_total
            mrp_subtotal += mrp_line
            prepared_items.append(
                {
                    "product": product,
                    "quantity": item.quantity,
                    "unit_price": unit_price,
                    "line_total": line_total,
                }
            )
        total_amount = total_amount.quantize(Decimal("0.01"))
        discount_amount = (mrp_subtotal - total_amount).quantize(Decimal("0.01"))

        # WHY: persist the bill header first so BillItem rows can FK to bill.id in the same flush.
        bill = Bill(
            customer_id=body.customer_id,
            staff_id=current_user.id,
            total_amount=total_amount,
            discount_amount=discount_amount,
        )
        db.add(bill)
        db.flush()

        item_reads: list[BillItemRead] = []
        for prepared in prepared_items:
            product: Product = prepared["product"]
            bill_item = BillItem(
                bill_id=bill.id,
                product_id=product.id,
                quantity=prepared["quantity"],
                unit_price=prepared["unit_price"],
                line_total=prepared["line_total"],
            )
            db.add(bill_item)
            item_reads.append(
                BillItemRead(
                    product_id=product.id,
                    product_name=product.name,
                    quantity=prepared["quantity"],
                    unit_price=prepared["unit_price"],
                    line_total=prepared["line_total"],
                )
            )

        # WHY: deduct with quantity = quantity - sold in SQL (and refuse if it would go negative)
        # so a concurrent sale can't overwrite our read of stock and leave inventory wrong.
        for product_id, sold_qty in requested_by_product.items():
            result = db.execute(
                update(Inventory)
                .where(
                    Inventory.product_id == product_id,
                    Inventory.quantity - sold_qty >= 0,
                )
                .values(quantity=Inventory.quantity - sold_qty)
            )
            if result.rowcount == 0:
                # WHY: another cashier may have sold the last units between our check and this
                # update — abort so we don't save a bill for stock we no longer have.
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Stock changed during billing for product_id={product_id}; "
                        "bill was not saved. Retry."
                    ),
                )

        # WHY: loyalty accrual must share this transaction — a committed bill without points
        # (or points without a bill) would silently desync the rewards ledger.
        points_earned = 0
        if customer is not None:
            points_earned = int(
                (total_amount * POINTS_PER_RUPEE).to_integral_value(rounding=ROUND_FLOOR)
            )
            customer.points_balance += points_earned
            customer.lifetime_spend = (
                customer.lifetime_spend + total_amount
            ).quantize(Decimal("0.01"))
            # WHY: upgrade only after spend includes this bill, so a purchase that crosses a
            # threshold upgrades on this sale's accrual — not deferred until the next visit.
            _maybe_upgrade_tier(customer)

        # WHY: one commit makes bill rows + stock + loyalty changes visible together; until then
        # nothing is durable, so a crash mid-way leaves the database unchanged.
        db.commit()
        db.refresh(bill)

        return BillRead(
            id=bill.id,
            customer_id=bill.customer_id,
            staff_id=bill.staff_id,
            items=item_reads,
            total_amount=bill.total_amount,
            discount_amount=bill.discount_amount,
            customer_tier_applied=customer_tier_applied,
            points_earned=points_earned,
            created_at=bill.created_at,
        )
    except HTTPException:
        # WHY: discard any flushed bill/items/stock/loyalty changes so errors never leave orphans.
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
