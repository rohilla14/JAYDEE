from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# Request body for creating a product: only client-supplied fields — id and created_at
# come from the DB, so they are not on this schema (unlike the SQLAlchemy Product model).
class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category_id: int
    barcode: str | None = Field(default=None, max_length=64)
    mrp: Decimal = Field(ge=0, decimal_places=2)
    member_price: Decimal = Field(ge=0, decimal_places=2)
    cost_price: Decimal = Field(ge=0, decimal_places=2)


# API response shape for a product row: includes id/created_at the client must see,
# but omits ORM relationships (category, inventory, bill_items) that the SQLAlchemy model holds.
class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category_id: int
    barcode: str | None
    mrp: Decimal
    member_price: Decimal
    cost_price: Decimal
    created_at: datetime


# Nested stock fields for ProductWithInventory — quantity for display/alerts, threshold for low-stock UI.
class InventoryQuantity(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    quantity: int
    reorder_threshold: int


# ProductRead plus current stock: joins product + inventory for the API, whereas the ORM
# keeps Product and Inventory as separate tables/models linked by a relationship.
class ProductWithInventory(ProductRead):
    inventory: InventoryQuantity | None = None


# Stock adjustment request: a +/- delta only — not the absolute quantity column on the
# SQLAlchemy Inventory model, so callers cannot accidentally overwrite stock blindly.
class InventoryUpdate(BaseModel):
    delta: int


# One product's reorder threshold for bulk updates (owner dashboard / seed scripts).
class BulkThresholdItem(BaseModel):
    product_id: int
    reorder_threshold: int = Field(ge=0)


# Response row after a bulk threshold update — confirms what was written, not full product metadata.
class BulkThresholdResult(BaseModel):
    product_id: int
    quantity: int
    reorder_threshold: int
