from decimal import Decimal

# Percentage off MRP by loyalty tier (applied at billing time from the customer's current tier).
TIER_DISCOUNTS: dict[str, Decimal] = {
    "bronze": Decimal("0.03"),  # 3%
    "silver": Decimal("0.05"),  # 5%
    "gold": Decimal("0.07"),  # 7%
}

# Lifetime spend required to unlock each tier (bronze is the default starting tier).
TIER_THRESHOLDS: dict[str, Decimal] = {
    "silver": Decimal("5000"),
    "gold": Decimal("20000"),
}

# Loyalty accrual: 0.10 points per rupee = 1 point per ₹10 spent.
POINTS_PER_RUPEE = Decimal("0.10")
