from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.customer import CustomerTier


# Create payload is name+phone only — tier/points/lifetime_spend are system-managed so clients can't self-assign rewards.
class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=1, max_length=20)


# Full customer as returned by the API, including loyalty fields the client may read but never set on create.
class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    tier: CustomerTier
    points_balance: int
    lifetime_spend: Decimal
    created_at: datetime


# Standalone redemption request — points only; bill discount wiring comes later.
class RedeemPointsRequest(BaseModel):
    points_to_redeem: int


# Redemption result: rupee value (1 point = ₹1) plus the customer's remaining balance.
class RedeemPointsResponse(BaseModel):
    customer_id: int
    points_redeemed: int
    redemption_value_rupees: Decimal
    points_balance: int
