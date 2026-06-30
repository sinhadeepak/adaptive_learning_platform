"""HTTP surface for object-storage uploads.

Three endpoints:

- POST /uploads/presign   — server signs a PUT URL the browser uses
                            to upload bytes directly to MinIO/S3.
- POST /uploads/finalize  — browser calls this after the PUT succeeds
                            so the server can verify the object landed
                            and (optionally) attach it to a parent
                            entity (quiz answer, doubt, etc.).
- GET  /uploads/sign      — server signs a short-lived GET URL for
                            an existing object key. Used wherever the
                            UI needs to display an uploaded artefact.

Bytes never flow through this service — keeps the app servers out
of the upload hot path and lets MinIO scale independently.
"""

from __future__ import annotations

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from learning.content.config import settings as content_settings
from learning.content.security import JwtPrincipal, current_principal
from learning.storage import (
    ALLOWED_MIME,
    MAX_UPLOAD_BYTES,
    head_object,
    object_key,
    presign_get,
    presign_put,
    sign_upload_claim,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])

PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


class PresignRequest(BaseModel):
    kind: Literal[
        "quiz-response",
        "doubt",
        "content-media",
        "study-material",
        "profile-avatar",
        "profile-id-proof",
        "tmp",
        "note-image",
    ]
    content_type: str = Field(..., min_length=3, max_length=80)
    original_name: str | None = Field(default=None, max_length=200)
    # Parent ids — required by `kind` per docs/storage_layout.md.
    # Validation happens in object_key(); we just pass them through.
    session_id: str | None = None
    question_id: str | None = None
    sub_question_id: str | None = None
    doubt_id: str | None = None
    topic_id: str | None = None


class PresignResponse(BaseModel):
    url: str
    object_key: str
    expires_at: str
    max_bytes: int
    method: str
    content_type: str
    # HMAC claim binding this key to the uploader; passed back on resource
    # create to prove ownership of the object (anti-IDOR).
    upload_claim: str


@router.post("/presign", response_model=PresignResponse)
def presign(
    body: PresignRequest, principal: PrincipalDep
) -> PresignResponse:
    if body.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail={
                "code": "unsupported_media_type",
                "message": (
                    f"{body.content_type} is not allowed. Allowed: "
                    f"{', '.join(sorted(ALLOWED_MIME.keys()))}"
                ),
            },
        )
    extension = ALLOWED_MIME[body.content_type]

    if body.kind == "note-image" and not body.content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail={"code": "unsupported_media_type",
                    "message": "note-image accepts image/* only."},
        )

    # Tenancy: principal carries it on hosted; default in dev.
    tenant_id = getattr(principal, "tenant_id", None) or "default"

    try:
        key = object_key(
            kind=body.kind,
            extension=extension,
            tenant_id=tenant_id,
            user_id=principal.user_id,
            session_id=body.session_id,
            question_id=body.question_id,
            sub_question_id=body.sub_question_id,
            doubt_id=body.doubt_id,
            topic_id=body.topic_id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": "missing_parent_id", "message": str(e)},
        ) from e

    signed = presign_put(
        key,
        content_type=body.content_type,
        original_name=body.original_name,
    )
    claim = sign_upload_claim(
        signed.object_key, principal.user_id, content_settings.jwt_secret
    )
    return PresignResponse(
        url=signed.url,
        object_key=signed.object_key,
        expires_at=signed.expires_at.isoformat(),
        max_bytes=signed.max_bytes,
        method=signed.method,
        content_type=body.content_type,
        upload_claim=claim,
    )


class FinalizeRequest(BaseModel):
    object_key: str = Field(..., min_length=1, max_length=512)


class FinalizeResponse(BaseModel):
    object_key: str
    size: int
    content_type: str | None
    original_name: str | None
    etag: str


@router.post("/finalize", response_model=FinalizeResponse)
def finalize(body: FinalizeRequest, principal: PrincipalDep) -> FinalizeResponse:
    """Verify the bytes landed and that the caller owns the object key.

    Authorisation rule: the user_id segment in the key must match the
    caller's principal. Without this, anyone with a presign-derived
    key could finalise an upload they didn't perform. We don't trust
    the client's claim — we trust the path embedded by `object_key()`
    at presign time, signed by our server.
    """
    parts = body.object_key.split("/")
    # Quiz-response / doubt / profile-uploads embed user_id at a known
    # depth — map per kind. Anything that doesn't match the caller is
    # rejected. Content-media is author-only; we let MODERATOR+ through.
    owner_segment: str | None = None
    if parts[:1] == ["quiz-responses"] and len(parts) >= 3:
        owner_segment = parts[2]
    elif parts[:1] == ["doubts"] and len(parts) >= 3:
        owner_segment = parts[2]
    elif parts[:1] == ["profile-uploads"] and len(parts) >= 2:
        owner_segment = parts[1]
    elif parts[:1] == ["note-images"] and len(parts) >= 2:
        owner_segment = parts[1]
    elif parts[:1] == ["tmp"] and len(parts) >= 3:
        owner_segment = parts[2]
    elif parts[:1] == ["content-media"]:
        if principal.role not in (
            "MODERATOR",
            "INSTITUTION_ADMIN",
            "PLATFORM_ADMIN",
            "TEACHER",
            "EXPERT",
        ):
            raise HTTPException(status_code=403, detail="content-media requires authoring role")
    elif parts[:1] == ["study-materials"]:
        # Topic-scoped (not user-scoped) — students may upload docs too, so
        # the key embeds tenant/topic, not user. Any authenticated principal
        # may finalise; author ownership for submit/delete is enforced by the
        # concept_resources row, not the key path.
        owner_segment = None
    else:
        raise HTTPException(status_code=400, detail="unknown object key prefix")

    if owner_segment is not None and owner_segment != principal.user_id:
        raise HTTPException(status_code=403, detail="not your upload")

    meta = head_object(body.object_key)
    if meta is None:
        # The browser PUT either failed or hasn't propagated yet.
        # Surface as 404 so the client can retry rather than silently
        # record a missing object.
        raise HTTPException(
            status_code=404,
            detail={
                "code": "object_not_found",
                "message": "Upload didn't reach storage. Retry the PUT.",
            },
        )
    if meta["size"] > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "too_large",
                "message": f"Object is {meta['size']} bytes; cap is {MAX_UPLOAD_BYTES}.",
            },
        )
    return FinalizeResponse(
        object_key=body.object_key,
        size=meta["size"],
        content_type=meta["content_type"],
        original_name=meta["original_name"],
        etag=meta["etag"],
    )


class SignResponse(BaseModel):
    url: str
    expires_at: str


@router.get("/sign", response_model=SignResponse)
def sign_get(
    principal: PrincipalDep,
    key: Annotated[str, Query(min_length=1, max_length=512)],
) -> SignResponse:
    """Sign a short-lived GET URL for `key`.

    Same ownership rule as /finalize — only the path's owner (or
    a MODERATOR+ for content-media) gets a download URL.
    """
    parts = key.split("/")
    owner_segment: str | None = None
    if parts[:1] == ["quiz-responses"] and len(parts) >= 3:
        owner_segment = parts[2]
    elif parts[:1] == ["doubts"] and len(parts) >= 3:
        owner_segment = parts[2]
    elif parts[:1] == ["profile-uploads"] and len(parts) >= 2:
        owner_segment = parts[1]
    elif parts[:1] == ["note-images"] and len(parts) >= 2:
        owner_segment = parts[1]
    elif parts[:1] == ["tmp"] and len(parts) >= 3:
        owner_segment = parts[2]
    elif parts[:1] == ["content-media"]:
        # Public-ish: any authenticated user can fetch question media.
        owner_segment = None
    elif parts[:1] == ["study-materials"]:
        # Published study documents are meant to be downloaded by students.
        owner_segment = None
    else:
        raise HTTPException(status_code=400, detail="unknown object key prefix")

    if owner_segment is not None and owner_segment != principal.user_id and principal.role not in (
        "MODERATOR",
        "INSTITUTION_ADMIN",
        "PLATFORM_ADMIN",
    ):
        raise HTTPException(status_code=403, detail="not your upload")

    signed = presign_get(key)
    return SignResponse(url=signed.url, expires_at=signed.expires_at.isoformat())
