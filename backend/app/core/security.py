"""Authentication, RBAC and data-protection abstractions.

The prototype ships a *development* identity provider: the client may declare an
identity through ``X-User-Email`` / ``X-User-Role`` headers, otherwise the
configured development user is used. The dependency surface
(``get_current_principal``, ``require_roles``) is the same one a real OIDC/JWT
provider would satisfy, so swapping it does not touch the routes.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Annotated, Iterable

from fastapi import Depends, Header, HTTPException, status

from app.core.config import settings
from app.models.enums import UserRole


@dataclass(slots=True)
class Principal:
    email: str
    role: UserRole
    display_name: str
    development: bool = True

    @property
    def is_admin(self) -> bool:
        return self.role is UserRole.ADMIN

    def can_approve_notes(self) -> bool:
        return self.role in (UserRole.DOCTOR, UserRole.FACULTY, UserRole.ADMIN)

    def can_manage_sessions(self) -> bool:
        return self.role in (UserRole.DOCTOR, UserRole.FACULTY, UserRole.ADMIN, UserRole.STUDENT)


def _parse_role(raw: str | None) -> UserRole:
    if not raw:
        return UserRole(settings.dev_user_role)
    try:
        return UserRole(raw.strip().upper())
    except ValueError:
        return UserRole(settings.dev_user_role)


async def get_current_principal(
    x_user_email: Annotated[str | None, Header(alias="X-User-Email")] = None,
    x_user_role: Annotated[str | None, Header(alias="X-User-Role")] = None,
) -> Principal:
    if not settings.dev_auth_enabled:  # pragma: no cover - production path
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication provider is not configured.",
        )
    email = (x_user_email or settings.dev_user_email).strip().lower()
    role = _parse_role(x_user_role)
    display = email.split("@")[0].replace(".", " ").title()
    return Principal(email=email, role=role, display_name=display, development=True)


CurrentPrincipal = Annotated[Principal, Depends(get_current_principal)]


def require_roles(*roles: UserRole):
    """Dependency factory enforcing role-based access control."""

    allowed: set[UserRole] = set(roles) or set(UserRole)

    async def _dependency(principal: CurrentPrincipal) -> Principal:
        if principal.role not in allowed and principal.role is not UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role {principal.role.value} is not permitted to perform this action.",
            )
        return principal

    return _dependency


class EncryptedStorage:
    """Abstraction for encryption at rest.

    The prototype stores audio and transcripts unencrypted on the local
    filesystem/database. This class marks the boundary where a KMS-backed
    envelope encryption implementation belongs, and provides a keyed digest used
    for tamper-evident audit entries.
    """

    enabled = False

    def __init__(self, secret_key: str | None = None) -> None:
        self.secret_key = (secret_key or settings.secret_key).encode("utf-8")

    def fingerprint(self, payload: bytes) -> str:
        return hmac.new(self.secret_key, payload, hashlib.sha256).hexdigest()

    def encrypt(self, payload: bytes) -> bytes:
        if not self.enabled:  # pragma: no cover - documented no-op
            return payload
        raise NotImplementedError("Wire a KMS/HSM backend before enabling encrypted storage.")

    def decrypt(self, payload: bytes) -> bytes:
        if not self.enabled:  # pragma: no cover - documented no-op
            return payload
        raise NotImplementedError("Wire a KMS/HSM backend before enabling encrypted storage.")

    def describe(self) -> dict[str, object]:
        return {
            "encryption_at_rest": self.enabled,
            "retention_days": settings.data_retention_days,
            "note": "Enable a KMS backend before any real clinical use.",
        }


storage_protection = EncryptedStorage()


def roles_allowing(*roles: UserRole) -> Iterable[str]:
    return [role.value for role in roles]
