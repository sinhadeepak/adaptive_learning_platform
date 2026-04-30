"""Sprint 34 (P4-S34) — pure-function tests for topic-reference URL safety."""

from __future__ import annotations

from learning.syllabus.url_safety import is_safe_reference_url


def test_https_urls_are_safe() -> None:
    assert is_safe_reference_url("https://ncert.nic.in/textbook/pdf/keph105.pdf") is True


def test_http_urls_are_safe() -> None:
    assert is_safe_reference_url("http://example.com/path") is True


def test_javascript_scheme_rejected() -> None:
    assert is_safe_reference_url("javascript:alert(1)") is False
    assert is_safe_reference_url("JavaScript:alert(1)") is False  # case-insensitive


def test_data_and_file_schemes_rejected() -> None:
    assert is_safe_reference_url("data:text/html,<script>alert(1)</script>") is False
    assert is_safe_reference_url("file:///etc/passwd") is False
    assert is_safe_reference_url("vbscript:msgbox(1)") is False


def test_empty_or_none_rejected() -> None:
    assert is_safe_reference_url(None) is False
    assert is_safe_reference_url("") is False
    assert is_safe_reference_url("   ") is False


def test_relative_or_scheme_less_url_rejected() -> None:
    assert is_safe_reference_url("/local/path") is False
    assert is_safe_reference_url("example.com/path") is False


def test_control_chars_rejected() -> None:
    assert is_safe_reference_url("https://example.com/\nNewline") is False
    assert is_safe_reference_url("https://example.com/\rCR") is False
