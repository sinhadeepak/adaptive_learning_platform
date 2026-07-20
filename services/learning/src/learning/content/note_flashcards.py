"""Phase 3.6 — turn a student's note into proposed flashcards (AI, review-first).

Extracts plain text from the note's ProseMirror JSON body and asks the AI
Gateway (`authoring` touchpoint) to propose Q/A cards. The student reviews the
proposals before any deck is created — nothing is written automatically.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from learning.ai_gateway import AIGateway

# Bound the note text sent to the model (notes can be long; a summary of the
# first ~6k chars is plenty to seed good cards and keeps cost predictable).
_MAX_NOTE_CHARS = 6000


class FlashcardProposal(BaseModel):
    front: str = Field(description="the question / prompt side")
    back: str = Field(description="the answer side")


class FlashcardProposals(BaseModel):
    cards: list[FlashcardProposal] = Field(description="3-10 proposed cards")


def extract_text(body: Any) -> str:
    """Flatten a ProseMirror doc (JSON dict) to plain text. Walks `text` nodes,
    inserting newlines between block-level nodes so structure survives."""
    if not isinstance(body, dict):
        return ""
    out: list[str] = []

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        ntype = node.get("type")
        if ntype == "text":
            txt = node.get("text")
            if isinstance(txt, str):
                out.append(txt)
            return
        for child in node.get("content", []) or []:
            walk(child)
        # Block separators so paragraphs/list-items don't run together.
        if ntype in {"paragraph", "heading", "list_item", "listItem", "blockquote"}:
            out.append("\n")

    walk(body)
    text = "".join(out)
    # Collapse excess blank lines and trim to the cap.
    lines = [ln.strip() for ln in text.splitlines()]
    cleaned = "\n".join(ln for ln in lines if ln)
    return cleaned[:_MAX_NOTE_CHARS]


async def suggest(
    gateway: AIGateway, *, title: str, note_text: str, creator_id: str | None = None
) -> FlashcardProposals:
    return await gateway.call(
        touchpoint="authoring",
        prompt_template_id="note_to_flashcards",
        prompt_template_version="1.0.0",
        prompt_inputs={"title": title or "your note", "note": note_text},
        schema=FlashcardProposals,
        creator_id=creator_id,
    )
