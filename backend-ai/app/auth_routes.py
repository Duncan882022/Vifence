"""Auth endpoints — signin cho CMS Module 05."""

from __future__ import annotations

from pydantic import BaseModel, Field

from fastapi import APIRouter, HTTPException, status

from .auth import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class SigninPayload(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


@router.post("/signin")
def signin(payload: SigninPayload) -> dict:
    user = verify_password(payload.username.strip(), payload.password)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    token = create_access_token(user)
    return {
        "ok": True,
        "access_token": token,
        "token_type": "bearer",
        "user": {"username": user.username, "role": user.role},
    }
