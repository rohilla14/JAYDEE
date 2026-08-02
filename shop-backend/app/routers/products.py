from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.security import require_role
from app.models.category import Category
from app.models.inventory import Inventory
from app.models.product import Product
from app.models.user import User, UserRole
from app.schemas.product import (
    BulkThresholdItem,
    BulkThresholdResult,
    InventoryUpdate,
    ProductCreate,
    ProductRead,
    ProductWithInventory,
)

router = APIRouter(prefix="/products", tags=["products"])


# POST /products
# Creates a new product (and a zero-quantity inventory row so stock can be adjusted later).
# Tricky: also seeds Inventory — product metadata and stock live in separate tables by design.
@router.post(
    "",
    response_model=ProductWithInventory,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    body: ProductCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.OWNER, UserRole.STOCK_STAFF))],
) -> Product:
    if db.get(Category, body.category_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    if body.barcode is not None:
        existing_barcode = db.scalar(
            select(Product).where(Product.barcode == body.barcode)
        )
        if existing_barcode is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A product with this barcode already exists",
            )

    product = Product(
        name=body.name,
        category_id=body.category_id,
        barcode=body.barcode,
        mrp=body.mrp,
        member_price=body.member_price,
        cost_price=body.cost_price,
    )
    db.add(product)
    db.flush()
    db.add(
        Inventory(
            product_id=product.id,
            quantity=0,
            reorder_threshold=0,
        )
    )
    db.commit()

    return db.scalar(
        select(Product)
        .where(Product.id == product.id)
        .options(selectinload(Product.inventory))
    )


# GET /products
# Lists products, optionally filtered by category and/or a name/barcode search string.
# Tricky: search is ILIKE on name OR barcode so one query param covers both scanners and typing.
@router.get("", response_model=list[ProductRead])
def list_products(
    db: Annotated[Session, Depends(get_db)],
    category_id: Annotated[int | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
) -> list[Product]:
    stmt = select(Product).order_by(Product.id)
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            Product.name.ilike(pattern) | Product.barcode.ilike(pattern)
        )
    return list(db.scalars(stmt).all())


# PATCH /products/bulk-threshold
# Sets reorder_threshold on many inventory rows in one request (owner dashboard / seed scripts).
# Tricky: declared before /{product_id} routes so "bulk-threshold" is never parsed as an id.
@router.patch("/bulk-threshold", response_model=list[BulkThresholdResult])
def bulk_update_thresholds(
    body: list[BulkThresholdItem],
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.OWNER))],
) -> list[BulkThresholdResult]:
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one product threshold is required",
        )

    product_ids = [item.product_id for item in body]
    if len(product_ids) != len(set(product_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate product_id in request",
        )

    inventories = {
        inv.product_id: inv
        for inv in db.scalars(
            select(Inventory).where(Inventory.product_id.in_(product_ids))
        ).all()
    }
    missing = [pid for pid in product_ids if pid not in inventories]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory not found for product_id(s): {missing}",
        )

    results: list[BulkThresholdResult] = []
    for item in body:
        inv = inventories[item.product_id]
        inv.reorder_threshold = item.reorder_threshold
        results.append(
            BulkThresholdResult(
                product_id=item.product_id,
                quantity=inv.quantity,
                reorder_threshold=inv.reorder_threshold,
            )
        )

    db.commit()
    return results


# GET /products/barcode/{barcode}
# Looks up a single product by its barcode (cashier / scanner flow) and includes stock.
# Tricky: declared before /{product_id} so the path segment "barcode" is never treated as an id.
@router.get("/barcode/{barcode}", response_model=ProductWithInventory)
def get_product_by_barcode(
    barcode: str,
    db: Annotated[Session, Depends(get_db)],
) -> Product:
    product = db.scalar(
        select(Product)
        .where(Product.barcode == barcode)
        .options(selectinload(Product.inventory))
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    return product


# GET /products/{product_id}
# Fetches one product by id, including its current inventory quantity.
# Tricky: uses selectinload so inventory is available for ProductWithInventory without lazy-load surprises.
@router.get("/{product_id}", response_model=ProductWithInventory)
def get_product(
    product_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> Product:
    product = db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.inventory))
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    return product


# PATCH /products/{product_id}/stock
# Applies a +/- delta to stock (e.g. +10 received, -1 sold/damaged) and returns the product with new qty.
# Tricky: updates quantity = quantity + delta in SQL so two concurrent staff adjustments don't overwrite each other.
@router.patch("/{product_id}/stock", response_model=ProductWithInventory)
def update_product_stock(
    product_id: int,
    body: InventoryUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.OWNER, UserRole.STOCK_STAFF))],
) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    result = db.execute(
        update(Inventory)
        .where(
            Inventory.product_id == product_id,
            Inventory.quantity + body.delta >= 0,
        )
        .values(quantity=Inventory.quantity + body.delta)
    )
    if result.rowcount == 0:
        inventory = db.scalar(
            select(Inventory).where(Inventory.product_id == product_id)
        )
        if inventory is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Inventory record not found for this product",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Insufficient stock: current quantity is {inventory.quantity}, "
                f"cannot apply delta {body.delta}"
            ),
        )

    db.commit()

    return db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.inventory))
    )
