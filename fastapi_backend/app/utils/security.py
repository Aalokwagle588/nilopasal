import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import jwt, JWTError
from app.config import settings

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

SESSION_TOKEN_BYTES = 32


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def new_session_token() -> str:
    return secrets.token_urlsafe(SESSION_TOKEN_BYTES)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    import re
    value = re.sub(r"[^\d+]", "", phone.strip())
    return value or None


def clean_optional(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    return cleaned or None


def slugify(value: str) -> str:
    import re
    result = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    result = result.strip("-")
    return result[:72] or "slug"


def generate_sku(name: str, prefix: str = "NP") -> str:
    import random
    letters = "".join(c for c in name if c.isalnum())[:4].upper() or "ITEM"
    rand = random.randint(1000, 9999)
    return f"{prefix}-{letters}-{rand}"
