from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_role
from app.models.customer import Customer, CustomerTier
from app.models.user import User, UserRole
from app.schemas.customer import (
    CustomerCreate,
    CustomerRead,
    RedeemPointsRequest,
    RedeemPointsResponse,
)

router = APIRouter(prefix="/customers", tags=["customers"])


# POST /customers
# Registers a loyalty customer from the counter; phone must be unique.
@router.post(
    "",
    response_model=CustomerRead,
    status_code=status.HTTP_201_CREATED,
)
def create_customer(
    body: CustomerCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.OWNER, UserRole.BILLING_STAFF))],
) -> Customer:
    existing = db.scalar(select(Customer).where(Customer.phone == body.phone))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A customer with this phone number already exists",
        )

    customer = Customer(
        name=body.name,
        phone=body.phone,
        tier=CustomerTier.BRONZE,
        points_balance=0,
        lifetime_spend=Decimal("0.00"),
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


# GET /customers/phone/{phone}
# Counter lookup by phone so staff can attach an existing customer to a bill.
# Declared before /{customer_id} so "phone" is never parsed as an id.
@router.get("/phone/{phone}", response_model=CustomerRead)
def get_customer_by_phone(
    phone: str,
    db: Annotated[Session, Depends(get_db)],
) -> Customer:
    customer = db.scalar(select(Customer).where(Customer.phone == phone))
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    return customer


# GET /customers/{customer_id}
# Fetch one customer by primary key.
@router.get("/{customer_id}", response_model=CustomerRead)
def get_customer(
    customer_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    return customer


# POST /customers/{customer_id}/redeem-points
# Standalone points → rupees redemption (1 point = ₹1).
# Intentionally NOT combined with POST /bills yet — keeps billing transaction logic simple
# while tiers settle; applying redemption as a bill discount is a later enhancement.
@router.post("/{customer_id}/redeem-points", response_model=RedeemPointsResponse)
def redeem_points(
    customer_id: int,
    body: RedeemPointsRequest,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.OWNER, UserRole.BILLING_STAFF))],
) -> RedeemPointsResponse:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )

    if body.points_to_redeem < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Minimum redemption is 100 points (₹100)",
        )

    if body.points_to_redeem > customer.points_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Insufficient points: balance is {customer.points_balance}, "
                f"cannot redeem {body.points_to_redeem}"
            ),
        )

    customer.points_balance -= body.points_to_redeem
    db.commit()
    db.refresh(customer)

    return RedeemPointsResponse(
        customer_id=customer.id,
        points_redeemed=body.points_to_redeem,
        redemption_value_rupees=Decimal(body.points_to_redeem).quantize(Decimal("0.01")),
        points_balance=customer.points_balance,
    )