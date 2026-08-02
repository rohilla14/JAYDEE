"""Create the first owner account (or any owner) without going through the API.

POST /auth/register is owner-only, so a fresh database needs this script once:

  cd shop-backend
  source .venv/bin/activate
  python scripts/create_owner.py --name "Owner" --phone "9000000001" --password "changeme"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an owner user")
    parser.add_argument("--name", required=True)
    parser.add_argument("--phone", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    if len(args.password) < 6:
        raise SystemExit("Password must be at least 6 characters")

    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.phone == args.phone))
        if existing is not None:
            raise SystemExit(f"A user with phone {args.phone} already exists (id={existing.id})")

        user = User(
            name=args.name.strip(),
            phone=args.phone.strip(),
            password_hash=hash_password(args.password),
            role=UserRole.OWNER,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Created owner id={user.id} phone={user.phone} name={user.name}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
