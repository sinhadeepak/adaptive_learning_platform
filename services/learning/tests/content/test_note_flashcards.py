"""Phase 3.6 — pure-function tests for note→flashcard text extraction."""

from __future__ import annotations

from learning.content.note_flashcards import extract_text


def test_extracts_text_across_blocks() -> None:
    doc = {
        "type": "doc",
        "content": [
            {"type": "heading", "content": [{"type": "text", "text": "Photosynthesis"}]},
            {"type": "paragraph", "content": [
                {"type": "text", "text": "Occurs in chloroplasts. "},
                {"type": "text", "text": "Produces glucose."},
            ]},
        ],
    }
    t = extract_text(doc)
    assert "Photosynthesis" in t
    assert "chloroplasts" in t and "glucose" in t
    # heading and paragraph are on separate lines
    assert "Photosynthesis\n" in t


def test_handles_empty_and_non_dict() -> None:
    assert extract_text(None) == ""
    assert extract_text({}) == ""
    assert extract_text("just a string") == ""


def test_caps_long_notes() -> None:
    big = {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": "x" * 10000}]},
    ]}
    assert len(extract_text(big)) <= 6000
