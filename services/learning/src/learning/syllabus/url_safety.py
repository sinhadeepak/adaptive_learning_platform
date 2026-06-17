"""Sprint 34 (P4-S34) — pure-function URL safety helper for topic references.

Reference URLs are user-curated content; we accept only http/https and
reject any scheme that would let a malicious author inject script
execution (`javascript:`, `data:`, `vbscript:`, `file:`).

Pure function. No HTTP fetch. The check is on the scheme + a small
sanity window — no DNS resolution.
"""

from __future__ import annotations

_BAD_SCHEMES = (
    "javascript:",
    "vbscript:",
    "data:",
    "file:",
    "ftp:",   # legacy, no security; reject for consistency
    "blob:",
)
_OK_SCHEMES = ("http://", "https://")


def is_safe_reference_url(url: str | None) -> bool:
    """Pure check: returns True iff the URL is non-empty, sane, and uses
    http(s)."""
    if not url or not isinstance(url, str):
        return False
    u = url.strip().lower()
    if not u:
        return False
    if any(u.startswith(bad) for bad in _BAD_SCHEMES):
        return False
    if not any(u.startswith(ok) for ok in _OK_SCHEMES):
        return False
    # Coarse sanity: no embedded newlines / control chars (defends against
    # smuggling chunked URLs through the response).
    if "\n" in url or "\r" in url or "\x00" in url:
        return False
    return True
