"""PII scrubbing middleware — pre-call scrub for Gateway requests.

Per ADR-0019 §"PII scrubbing middleware". Pure-function: walks every
string value in the prompt_inputs payload, replaces email / phone /
name patterns with placeholders, returns scrubbed payload + an
anonymisation token map for reverse-mapping in evaluation feedback.

This is a v1 conservative scrubber. False positives (e.g. a math
problem mentioning "John" being scrubbed to [NAME_1]) are acceptable;
false negatives (real PII leaking) are not. Fail-closed.
"""

from __future__ import annotations

import re
from typing import Any

# ── Regex patterns ───────────────────────────────────────────────────────────
# Email: standard RFC-5322-ish. Conservative, prefers false-positives.
_EMAIL_RX = re.compile(
    r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b"
)

# Phone: matches Indian (+91 / 10-digit) + international forms.
# Looks for sequences of 7+ digits with optional separators.
_PHONE_RX = re.compile(
    r"(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{0,4}"
)

# Names: hard. v1 uses a simple "Title-cased word followed by another
# Title-cased word" heuristic — catches "John Smith" but NOT "John"
# alone. False-positives on phrases like "Newton Raphson" are
# acceptable; false-negatives where a name doesn't follow this shape
# are NOT — but we accept some leakage for v1 since real student names
# are most likely to surface as full first+last in feedback strings.
# Production hardening (NER model) lands in S43 if needed.
_NAME_RX = re.compile(
    r"\b[A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15}\b"
)


class ScrubResult:
    """Output of `scrub_payload`. Both fields are mutable so callers can
    inspect / extend, but the convention is read-only after scrub."""

    __slots__ = ("payload", "token_map")

    def __init__(self, payload: dict[str, Any], token_map: dict[str, str]):
        self.payload = payload
        self.token_map = token_map  # placeholder → original value

    def reverse_map(self, text: str) -> str:
        """Reverse-substitute placeholders back to originals. Used for
        evaluation feedback where the AI's response references the
        scrubbed token but the surface needs to show the original."""
        for placeholder, original in self.token_map.items():
            text = text.replace(placeholder, original)
        return text


def scrub_payload(payload: dict[str, Any]) -> ScrubResult:
    """Walk a JSON-serialisable payload, replacing PII with
    [EMAIL_N] / [PHONE_N] / [NAME_N] placeholders. Returns a new
    payload + a token map for reverse-mapping.

    Numeric / bool / None values pass through unchanged. List + dict
    values are recursed. Tuple values become lists (JSON shape).
    """
    counters = {"EMAIL": 0, "PHONE": 0, "NAME": 0}
    token_map: dict[str, str] = {}

    def _scrub_str(s: str) -> str:
        # Email first (most specific)
        s = _scrub_pattern(s, _EMAIL_RX, "EMAIL", counters, token_map)
        # Phone — note we apply this BEFORE name to avoid name-shaped
        # phone substrings being captured as names.
        s = _scrub_pattern(s, _PHONE_RX, "PHONE", counters, token_map)
        s = _scrub_pattern(s, _NAME_RX, "NAME", counters, token_map)
        return s

    def _walk(v: Any) -> Any:
        if isinstance(v, str):
            return _scrub_str(v)
        if isinstance(v, dict):
            return {k: _walk(val) for k, val in v.items()}
        if isinstance(v, (list, tuple)):
            return [_walk(item) for item in v]
        return v

    scrubbed = _walk(payload)
    if not isinstance(scrubbed, dict):
        # Defensive: top-level payload should always be a dict.
        scrubbed = {"_scrubbed": scrubbed}
    return ScrubResult(payload=scrubbed, token_map=token_map)


def _scrub_pattern(
    text: str,
    rx: re.Pattern[str],
    kind: str,
    counters: dict[str, int],
    token_map: dict[str, str],
) -> str:
    def _replace(match: re.Match[str]) -> str:
        original = match.group(0)
        # Avoid scrubbing tiny phone-shaped sequences (e.g. dates or
        # short numbers). Phone matcher hits sequences as short as 7
        # digits-with-separators; reject anything < 7 digits total.
        if kind == "PHONE":
            digits_only = re.sub(r"\D", "", original)
            if len(digits_only) < 7:
                return original
        # Reuse a placeholder if we've seen this exact value before.
        for placeholder, value in token_map.items():
            if value == original and placeholder.startswith(f"[{kind}_"):
                return placeholder
        counters[kind] += 1
        placeholder = f"[{kind}_{counters[kind]}]"
        token_map[placeholder] = original
        return placeholder

    return rx.sub(_replace, text)
