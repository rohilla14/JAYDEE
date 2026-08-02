from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.models.customer import CustomerTier


class CampaignFilter(BaseModel):
    """Audience filter for a campaign send.

    Always combined with whatsapp_opt_in == true in the send endpoint — callers
    cannot override that safety rule.
    """

    type: Literal["tier", "all_opted_in"]
    tier: CustomerTier | None = None

    @model_validator(mode="after")
    def validate_tier_filter(self) -> "CampaignFilter":
        if self.type == "tier" and self.tier is None:
            raise ValueError('tier is required when filter.type is "tier"')
        if self.type == "all_opted_in" and self.tier is not None:
            raise ValueError('tier must not be set when filter.type is "all_opted_in"')
        return self


class CampaignRequest(BaseModel):
    template_name: str = Field(min_length=1, max_length=128)
    params: dict[str, Any] = Field(default_factory=dict)
    filter: CampaignFilter


class CampaignSendResult(BaseModel):
    matched: int
    sent: int
    template_name: str
    filter_type: str
    filter_tier: str | None = None
