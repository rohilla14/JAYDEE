from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    mrp: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    member_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    category: Mapped["Category"] = relationship(back_populates="products")
    inventory: Mapped["Inventory | None"] = relationship(
        back_populates="product",
        uselist=False,
    )
    bill_items: Mapped[list["BillItem"]] = relationship(back_populates="product")
