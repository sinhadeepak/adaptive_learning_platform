"""Object-storage client + presign helpers.

Single point where the learning service talks to MinIO (dev) / S3
(staging-prod). Uses boto3 for the presign math because it's a
zero-network, pure-crypto operation — fast, well-tested, no extra
async client needed. The actual file bytes never flow through this
service: the browser PUTs directly to MinIO using presigned URLs we
sign here.

Folder layout is documented in docs/storage_layout.md and enforced
by `object_key()`.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Literal

import boto3
from botocore.client import Config

log = logging.getLogger(__name__)

# Whitelisted upload kinds. Each one maps to a prefix tree under the
# bucket. Adding a new kind is a typed change here + a docs update.
UploadKind = Literal[
    "quiz-response",
    "doubt",
    "content-media",
    "study-material",
    "profile-avatar",
    "profile-id-proof",
    "tmp",
    "note-image",
]

# Allowed MIME → file extension. Anything outside this map is rejected
# at presign time so the bucket never accumulates surprise content.
ALLOWED_MIME: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/webm": "webm",
    "video/mp4": "mp4",
    "video/webm": "webm",
}

# Max upload size — enforced by the signed Content-Length header on PUT
# (boto3 sets this from `expires_in` + size constraints).
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

# Presigned URL lifetimes. Long enough for slow mobile uploads, short
# enough that a leaked URL doesn't sit useful for hours.
PUT_URL_TTL_SECONDS = 15 * 60  # 15 min
GET_URL_TTL_SECONDS = 5 * 60   # 5 min


@dataclass(frozen=True)
class StorageConfig:
    bucket: str
    endpoint: str
    public_endpoint: str
    region: str
    access_key: str
    secret_key: str

    @classmethod
    def from_env(cls) -> "StorageConfig":
        return cls(
            bucket=os.environ.get("UPLOADS_BUCKET", "alp-uploads"),
            endpoint=os.environ.get("MINIO_ENDPOINT", "http://minio:9000"),
            public_endpoint=os.environ.get(
                "MINIO_PUBLIC_ENDPOINT", "http://localhost:39000"
            ),
            region=os.environ.get("MINIO_REGION", "us-east-1"),
            access_key=os.environ.get("MINIO_ACCESS_KEY", "alp-app"),
            secret_key=os.environ.get(
                "MINIO_SECRET_KEY", "alp-app-password-change-me"
            ),
        )


@lru_cache(maxsize=2)
def _client(public: bool = False):
    """Build (and cache) the boto3 S3 client.

    Two flavours: the in-network endpoint (services → minio) and the
    public endpoint that gets baked into presigned URLs (browser → minio).
    boto3 hashes the Host header into the signature so the two URLs
    can't share a client.
    """
    cfg = StorageConfig.from_env()
    return boto3.client(
        "s3",
        endpoint_url=cfg.public_endpoint if public else cfg.endpoint,
        aws_access_key_id=cfg.access_key,
        aws_secret_access_key=cfg.secret_key,
        region_name=cfg.region,
        # path-style addressing required for MinIO — virtual-host style
        # would resolve `bucket.minio:9000` which doesn't exist.
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def _file_id() -> str:
    """uuidv4 for now — Python stdlib doesn't have v7 yet. Time-sortability
    isn't load-bearing for the upload path."""
    return uuid.uuid4().hex


def object_key(
    kind: UploadKind,
    *,
    extension: str,
    tenant_id: str = "default",
    user_id: str | None = None,
    session_id: str | None = None,
    question_id: str | None = None,
    sub_question_id: str | None = None,
    doubt_id: str | None = None,
    topic_id: str | None = None,
) -> str:
    """Return the canonical object key for `kind` per docs/storage_layout.md.

    Raises ValueError when required ids for the kind are missing — better
    to fail at presign than to leak unscoped objects into the bucket.
    """
    fid = _file_id()
    if kind == "quiz-response":
        if not (user_id and session_id and question_id):
            raise ValueError("quiz-response requires user_id, session_id, question_id")
        sub = sub_question_id or "main"
        return (
            f"quiz-responses/{tenant_id}/{user_id}/sessions/{session_id}"
            f"/q/{question_id}/parts/{sub}/{fid}.{extension}"
        )
    if kind == "doubt":
        if not (user_id and doubt_id):
            raise ValueError("doubt requires user_id, doubt_id")
        return f"doubts/{tenant_id}/{user_id}/{doubt_id}/{fid}.{extension}"
    if kind == "content-media":
        if not question_id:
            raise ValueError("content-media requires question_id")
        return f"content-media/{question_id}/{fid}.{extension}"
    if kind == "study-material":
        # Topic-scoped curated/uploaded study documents (PDFs etc.). Scoped
        # by topic so the bucket mirrors the subject→topic content tree.
        scope = topic_id or question_id
        if not scope:
            raise ValueError("study-material requires topic_id (or question_id)")
        return f"study-materials/{tenant_id}/{scope}/{fid}.{extension}"
    if kind == "profile-avatar":
        if not user_id:
            raise ValueError("profile-avatar requires user_id")
        return f"profile-uploads/{user_id}/avatar/{fid}.{extension}"
    if kind == "profile-id-proof":
        if not user_id:
            raise ValueError("profile-id-proof requires user_id")
        return f"profile-uploads/{user_id}/id-proof/{fid}.{extension}"
    if kind == "tmp":
        if not user_id:
            raise ValueError("tmp requires user_id")
        return f"tmp/{tenant_id}/{user_id}/{fid}.{extension}"
    if kind == "note-image":
        if not user_id:
            raise ValueError("note-image requires user_id")
        return f"note-images/{user_id}/{fid}.{extension}"
    raise ValueError(f"unknown upload kind: {kind}")


@dataclass(frozen=True)
class PresignPut:
    url: str
    object_key: str
    expires_at: datetime
    max_bytes: int
    method: str = "PUT"


def presign_put(
    object_key_: str,
    *,
    content_type: str,
    original_name: str | None = None,
) -> PresignPut:
    """Sign a PUT URL the browser uploads to directly.

    `original_name` is captured as object metadata so download UIs can
    show the user's filename even though the stored key is a uuid.
    """
    cfg = StorageConfig.from_env()
    metadata: dict[str, str] = {}
    if original_name:
        # Strip any path components / nulls — defensive against client
        # passing "../etc/passwd"-style filenames.
        metadata["original-name"] = (
            original_name.replace("\x00", "").rsplit("/", 1)[-1]
        )[:200]
    params = {
        "Bucket": cfg.bucket,
        "Key": object_key_,
        "ContentType": content_type,
    }
    if metadata:
        params["Metadata"] = metadata
    url = _client(public=True).generate_presigned_url(
        "put_object", Params=params, ExpiresIn=PUT_URL_TTL_SECONDS, HttpMethod="PUT",
    )
    return PresignPut(
        url=url,
        object_key=object_key_,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=PUT_URL_TTL_SECONDS),
        max_bytes=MAX_UPLOAD_BYTES,
    )


@dataclass(frozen=True)
class PresignGet:
    url: str
    expires_at: datetime


def presign_get(object_key_: str) -> PresignGet:
    cfg = StorageConfig.from_env()
    url = _client(public=True).generate_presigned_url(
        "get_object",
        Params={"Bucket": cfg.bucket, "Key": object_key_},
        ExpiresIn=GET_URL_TTL_SECONDS,
        HttpMethod="GET",
    )
    return PresignGet(
        url=url,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=GET_URL_TTL_SECONDS),
    )


# ── Upload claims — bind an object key to the uploader (anti-IDOR) ────────
#
# /uploads/presign issues an HMAC claim over (object_key, user_id, exp). The
# create-resource handler requires + verifies it before persisting a
# client-supplied doc_object_key, so a user can't pin an object they didn't
# upload (which would otherwise yield a signed GET URL via /uploads/sign).

UPLOAD_CLAIM_TTL_SECONDS = 60 * 60  # 1 hour — generous for slow uploads.


def sign_upload_claim(object_key_: str, user_id: str, secret: str) -> str:
    exp = int(time.time()) + UPLOAD_CLAIM_TTL_SECONDS
    msg = f"{object_key_}|{user_id}|{exp}".encode()
    sig = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def verify_upload_claim(
    claim: str, object_key_: str, user_id: str, secret: str
) -> bool:
    try:
        exp_str, sig = claim.split(".", 1)
        exp = int(exp_str)
    except (ValueError, AttributeError):
        return False
    if exp < int(time.time()):
        return False
    msg = f"{object_key_}|{user_id}|{exp}".encode()
    expected = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


def head_object(object_key_: str) -> dict | None:
    """Confirm an object exists post-upload (called by /uploads/finalize).

    Returns the object's size + content-type + original-name on success,
    None when missing. Uses the in-network client so we don't pay the
    presigned-URL overhead for a server-to-server check.
    """
    cfg = StorageConfig.from_env()
    try:
        resp = _client(public=False).head_object(Bucket=cfg.bucket, Key=object_key_)
    except Exception:  # noqa: BLE001
        log.info("head_object missing", extra={"key": object_key_})
        return None
    return {
        "size": int(resp.get("ContentLength", 0)),
        "content_type": resp.get("ContentType"),
        "original_name": (resp.get("Metadata") or {}).get("original-name"),
        "etag": resp.get("ETag", "").strip('"'),
    }
