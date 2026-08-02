from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.customer import CustomerTier


# Client-sent line for one scanned product: only product_id + qty — prices are resolved server-side.
class BillItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


# Request to open a bill: optional customer for members/walk-ins, plus the scanned line items.
class BillCreate(BaseModel):
    customer_id: int | None = None
    items: list[BillItemCreate] = Field(min_length=1)


# Response line item: includes product_name and computed prices the SQLAlchemy BillItem row alone doesn't carry.
class BillItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int
    product_name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal


# Full bill API response: nest items plus which tier/points this sale used — not stored on the Bill ORM row alone.
class BillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int | None
    staff_id: int
    items: list[BillItemRead]
    total_amount: Decimal
    discount_amount: Decimal
    customer_tier_applied: CustomerTier | None = None
    points_earned: int = 0
    created_at: datetime
