from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_role
from app.core.whatsapp import send_whatsapp_message
from app.models.customer import Customer
from app.models.user import User, UserRole
from app.schemas.campaign import CampaignRequest, CampaignSendResult

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


# POST /campaigns/send
# Owner-only WhatsApp campaign to opted-in customers matching a filter.
# WHY always AND whatsapp_opt_in: marketing consent is non-negotiable — a tier
# filter must never become a way to message people who did not opt in.
#
# NOTE: this loops and sends inline. Fine for our small test dataset, but once
# customer counts grow into the hundreds/thousands this should move to a
# background job (Celery / ARQ / BullMQ-equivalent) so a single HTTP request
# does not hang while fan-out completes.
@router.post("/send", response_model=CampaignSendResult)
def send_campaign(
    body: CampaignRequest,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.OWNER))],
) -> CampaignSendResult:
    stmt = select(Customer).where(Customer.whatsapp_opt_in.is_(True))
    if body.filter.type == "tier":
        stmt = stmt.where(Customer.tier == body.filter.tier)
    stmt = stmt.order_by(Customer.id)

    customers = list(db.scalars(stmt).all())
    matched = len(customers)
    sent = 0

    for customer in customers:
        # Merge static campaign params with per-recipient context for templates.
        params: dict[str, Any] = {
            **body.params,
            "customer_id": customer.id,
            "customer_name": customer.name,
            "tier": customer.tier.value,
        }
        send_whatsapp_message(customer.phone, body.template_name, params)
        sent += 1

    return CampaignSendResult(
        matched=matched,
        sent=sent,
        template_name=body.template_name,
        filter_type=body.filter.type,
        filter_tier=body.filter.tier.value if body.filter.tier else None,
    )
