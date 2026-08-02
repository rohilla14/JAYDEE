"""WhatsApp provider integration.

Swap the provider behind WHATSAPP_PROVIDER without rewriting call sites:
callers always use send_whatsapp_message(...); only this module talks to Gupshup/Interakt.
"""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_whatsapp_message(phone: str, template_name: str, params: dict[str, Any]) -> None:
    """Send a templated WhatsApp message to ``phone``.

    Today this is a stub that logs the intended payload. When a real provider
    account is ready, implement the API call inside ``_send_via_provider`` and
    set WHATSAPP_PROVIDER accordingly — callers stay unchanged.
    """
    provider = (settings.WHATSAPP_PROVIDER or "stub").strip().lower()
    if provider == "stub":
        _send_via_stub(phone, template_name, params)
        return
    _send_via_provider(provider, phone, template_name, params)


def _send_via_stub(phone: str, template_name: str, params: dict[str, Any]) -> None:
    logger.info(
        "whatsapp stub send phone=%s template=%s params=%s",
        phone,
        template_name,
        params,
    )


def _send_via_provider(
    provider: str,
    phone: str,
    template_name: str,
    params: dict[str, Any],
) -> None:
    # Intentionally not implemented yet — keep a single place to fill in later.
    raise NotImplementedError(
        f"WhatsApp provider '{provider}' is not configured. "
        "Set WHATSAPP_PROVIDER=stub or implement _send_via_provider."
    )
