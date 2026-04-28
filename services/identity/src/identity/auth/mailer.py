"""Minimal async SMTP sender — Mailpit locally, SES in staging/prod (via SES SMTP compat)."""

from __future__ import annotations

import logging
from email.message import EmailMessage

import aiosmtplib

from identity.auth.config import settings

log = logging.getLogger(__name__)


async def send_email(*, to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        await aiosmtplib.send(msg, hostname=settings.smtp_host, port=settings.smtp_port)
    except Exception as err:  # noqa: BLE001 — email failure must not crash the endpoint
        # In dev (Mailpit on default ports) this is unlikely to fire; in prod we
        # surface to the alerting pipeline but the user's OTP is still queued.
        log.warning("email send failed for %s: %s", to, err)


async def send_otp_email(*, to: str, otp: str) -> None:
    await send_email(
        to=to,
        subject="Your ALP verification code",
        body=(
            f"Your 6-digit verification code is: {otp}\n\n"
            f"It expires in {settings.otp_ttl_seconds // 60} minutes. "
            "If you did not request this, ignore this email."
        ),
    )


async def send_password_reset_email(*, to: str, reset_url: str) -> None:
    await send_email(
        to=to,
        subject="Reset your ALP password",
        body=(
            "Someone (hopefully you) requested a password reset for your ALP account.\n\n"
            f"Reset link: {reset_url}\n\n"
            "It expires in 1 hour. If you did not request this, ignore this email — "
            "your password will not change."
        ),
    )
