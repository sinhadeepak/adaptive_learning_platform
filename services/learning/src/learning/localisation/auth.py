"""Shared admin-auth dependency for localisation admin routes."""
from __future__ import annotations

from fastapi import Depends, HTTPException
from learning.content.security import JwtPrincipal, current_principal

_ADMIN_ROLES = ("INSTITUTION_ADMIN", "PLATFORM_ADMIN")


def require_admin(principal: JwtPrincipal = Depends(current_principal)) -> JwtPrincipal:
    if principal.role not in _ADMIN_ROLES:
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "admin role required"},
        )
    return principal
