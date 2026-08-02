from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User, UserRole
from app.schemas.auth import UserResponse

router = APIRouter(prefix="/users", tags=["users"])


# GET /users
# Owner staff directory — never returns password_hash (UserResponse omits it).
@router.get("", response_model=list[UserResponse])
def list_users(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.OWNER))],
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)).all())


# PATCH /users/{user_id}/deactivate
# Revokes access immediately (login + bearer validation both check is_active).
# Owners cannot deactivate themselves — that would lock everyone out of staff admin.
@router.patch("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.OWNER))],
) -> User:
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not user.is_active:
        return user

    user.is_active = False
    db.commit()
    db.refresh(user)
    return user
