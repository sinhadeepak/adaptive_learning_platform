"""SMTP sender for the email channel.

Templates per notification.type live here so the dispatcher stays focused on
queue mechanics. Tests inject a fake `Sender.send_email` to avoid real SMTP
in unit tests; the live container hits Mailpit on the local stack and
SendGrid in staging.
"""

from __future__ import annotations

import logging
from email.message import EmailMessage
from typing import Any, Protocol

import aiosmtplib

from notification.config import settings

log = logging.getLogger(__name__)


class Sender(Protocol):
    """Narrow interface so the dispatcher can be tested without real SMTP."""

    async def send_email(self, *, to: str, subject: str, body: str, message_id: str) -> None: ...


class SMTPSender:
    """aiosmtplib-backed Sender. One connection per send — fine at closed-beta
    volumes (~hundreds/day); Sprint 4 introduces a connection pool."""

    async def send_email(self, *, to: str, subject: str, body: str, message_id: str) -> None:
        msg = EmailMessage()
        msg["From"] = settings.smtp_from
        msg["To"] = to
        msg["Subject"] = subject
        # Stable Message-ID (the notification row id) so SMTP servers can
        # dedupe on retry. Mailpit ignores it; SendGrid honors it.
        msg["Message-ID"] = f"<{message_id}@adaptivelearn.in>"
        msg.set_content(body)

        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password,
            use_tls=settings.smtp_use_tls,
            timeout=10,
        )


def render_email(notif_type: str, payload: dict[str, Any]) -> tuple[str, str]:
    """Return (subject, body) for the given notification.type. Unknown types
    fall through to a generic envelope so unforeseen events still send."""
    if notif_type == "quiz.completed":
        score = payload.get("score", 0)
        pct = int(round(float(score) * 100))
        return (
            f"Your quiz score: {pct}%",
            (
                "Hi,\n\n"
                f"You just finished a practice quiz and scored {pct}%.\n"
                "Open the app to see the per-question breakdown and pick "
                "your next topic.\n\n"
                "— ALP\n"
            ),
        )
    return (
        f"Update from ALP: {notif_type}",
        f"Notification payload: {payload}\n\n— ALP\n",
    )


# When the dispatcher runs in tests we want to substitute the real SMTPSender
# without touching the dispatcher code. Tests assign to `default_sender`.
default_sender: Sender = SMTPSender()
