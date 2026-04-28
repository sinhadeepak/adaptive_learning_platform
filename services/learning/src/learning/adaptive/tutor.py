"""AI Tutor — multi-turn conversational tutoring with topic context.

Surface:
  POST /adaptive/tutor/chat — text/event-stream of assistant tokens

The endpoint is stateless: clients send the full conversation history each
request. We bound history to the last 12 messages (6 turns) to keep latency +
token spend predictable; older context is silently dropped.

Topic context is fetched once per request (cheap — Catalog already responds in
<10ms locally) and injected into the system prompt so the tutor's answers stay
grounded in the curriculum the learner is actually preparing for.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx
import structlog

from learning.adaptive import llm
from learning.adaptive.clients import fetch_mastery
from learning.adaptive.config import settings

log = structlog.get_logger(__name__)

MAX_HISTORY_MESSAGES = 12
MAX_RESPONSE_TOKENS = 1024  # tutor replies are short by design

SYSTEM_TEMPLATE = """You are an expert tutor for Indian competitive exams (NEET, JEE, UPSC, CBSE).
You are answering a student's doubt while they study a specific topic.

Hard rules for the answer body:
- Answer only what was asked. Do not pad with "Great question!" or "Let's dive in!".
- Use Markdown for structure: **bold** for key terms, numbered/bulleted lists for steps, > blockquotes for asides, ## sub-section headings when the answer has clear sections.
- For math, physics, and chemistry formulas: use LaTeX with $$…$$ delimiters for display equations and $…$ for inline math. e.g. $$F = ma$$ or $E = mc^2$. The mobile + web clients render KaTeX, so equations look like real exam papers — do NOT wrap formulas in code fences.
- When the student asks a calculation, work it step by step — each step on its own line, formula on its own $$…$$ display block.
- If the question is off-topic from {topic_title}, gently redirect: "That's outside {topic_title} — let's stay focused. Want me to come back to that, or stick with the topic?"
- If you don't know with high confidence, say so. Do not invent facts, exam patterns, or formulas.
- Keep the answer body under ~250 words unless the student explicitly asks for a longer walkthrough.

Generative-UI artifacts (OPTIONAL — emit only when the artifact genuinely helps):
You may emit STRUCTURED ARTIFACTS that the UI renders as native cards in-line.
Each artifact is a JSON object enclosed in markers. Use them sparingly — only
when the artifact is more useful than prose. Never emit an empty artifact.

Supported artifact types and their schemas:

  • concept_card — Reusable concept summary
    <<ARTIFACT type="concept_card">>
    {"title": "Newton's Third Law", "key_points": ["For every action there is an equal and opposite reaction", "Forces always come in pairs"], "summary": "When two bodies interact, they exert equal and opposite forces on each other."}
    <<END>>

  • formula_card — Highlighted formula with variables and one worked example
    <<ARTIFACT type="formula_card">>
    {"name": "Kinetic Energy", "formula": "KE = \\\\frac{1}{2}mv^2", "variables": [{"sym": "m", "meaning": "mass (kg)"}, {"sym": "v", "meaning": "velocity (m/s)"}], "example": "A 2 kg ball at 10 m/s has KE = (1/2)(2)(100) = 100 J"}
    <<END>>

  • quick_quiz — Single MCQ check-in (4 choices, one correct)
    <<ARTIFACT type="quick_quiz">>
    {"question": "What is the SI unit of force?", "choices": ["Joule", "Watt", "Newton", "Pascal"], "correct_idx": 2, "explanation": "Newton (N) = kg·m/s²"}
    <<END>>

Rules for artifacts:
- The JSON inside MUST be valid (parseable). No trailing commas, no comments.
- Place the block at the natural point in the body where you would otherwise
  describe the artifact in prose. The renderer puts the card there.
- Maximum 3 artifacts per reply. If you have more to say, prefer prose.
- DO NOT also describe the artifact's contents in prose — the card replaces that.
- For formulas already shown inline as $$...$$, do NOT also emit a formula_card.
  Use formula_card only when the formula deserves a foregrounded callout with
  variables + a worked example.

Generative-UI follow-up suggestions (REQUIRED at end of every reply):
After the answer body, on its own paragraph, emit a follow-up block in this exact shape:

<<FOLLOWUPS>>
- <Concise next-step question 1>
- <Concise next-step question 2>
- <Concise next-step question 3>
<<END>>

Rules for follow-ups:
- Always 2 to 4 items. Each ≤ 12 words. End with a question mark when grammatical.
- They must be questions THE STUDENT might naturally ask next given the answer just given — not generic prompts.
- No numbering inside the items, just `- ` bullets. Do not put any text outside the block after `<<END>>`.
- The block is consumed by the UI to render clickable chips; if you fail to emit it the UI will show no chips, so always emit it.

Context:
- Topic: {topic_title}
- Subject: {subject_name}
- Exam: {exam_name}
{mastery_line}"""


async def _fetch_topic(topic_id: str) -> dict[str, Any] | None:
    """Pull topic + subject + exam metadata from Catalog. Returns None on failure;
    the tutor still works, it just loses the curriculum grounding."""
    timeout = httpx.Timeout(connect=2.0, read=3.0, write=3.0, pool=3.0)
    base = settings.catalog_base_url
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            tr = await client.get(f"{base}/catalog/topics/{topic_id}")
            if tr.status_code != 200:
                return None
            topic = tr.json()
            subj_id = topic.get("subjectId")
            if not subj_id:
                return {"title": topic.get("title", "this topic"), "subjectName": "", "examName": ""}
            # Walk up to subject + exam. Catalog doesn't expose a direct "topic
            # → exam" path, so we list subjects per exam and find the match.
            er = await client.get(f"{base}/catalog/exams")
            er.raise_for_status()
            for exam in er.json():
                sr = await client.get(f"{base}/catalog/exams/{exam['id']}/subjects")
                sr.raise_for_status()
                for s in sr.json():
                    if s["id"] == subj_id:
                        return {
                            "title": topic.get("title", "this topic"),
                            "subjectName": s["name"],
                            "examName": exam["name"],
                        }
            return {"title": topic.get("title", "this topic"), "subjectName": "", "examName": ""}
        except httpx.HTTPError as e:
            log.warning("tutor_topic_fetch_failed", error=str(e), topic_id=topic_id)
            return None


def _build_system(
    topic_meta: dict[str, Any] | None, mastery_ewa: float | None
) -> str:
    title = topic_meta["title"] if topic_meta else "your current topic"
    subject = (topic_meta or {}).get("subjectName") or "—"
    exam = (topic_meta or {}).get("examName") or "—"
    if mastery_ewa is None:
        mastery_line = "- The student has not yet attempted questions on this topic; calibrate to a beginner."
    elif mastery_ewa < 0.4:
        mastery_line = (
            f"- Student EWA on this topic is {mastery_ewa:.2f} — they're struggling. "
            "Lean on first-principles explanations; don't assume terminology."
        )
    elif mastery_ewa < 0.7:
        mastery_line = (
            f"- Student EWA on this topic is {mastery_ewa:.2f} — developing. "
            "Use intermediate vocabulary and reinforce common pitfalls."
        )
    else:
        mastery_line = (
            f"- Student EWA on this topic is {mastery_ewa:.2f} — confident. "
            "You can use advanced terminology and skip basics."
        )
    # Sprint 9 A-2 — `.format()` collides with the literal `{"title": ...}`
    # JSON examples in the artifact-schema section of SYSTEM_TEMPLATE
    # (Python's str.format treats `{` as placeholder markers). Use plain
    # str.replace() instead — there are only four named placeholders and
    # they're unique enough to be safe.
    return (
        SYSTEM_TEMPLATE
        .replace("{topic_title}", title)
        .replace("{subject_name}", subject)
        .replace("{exam_name}", exam)
        .replace("{mastery_line}", mastery_line)
    )


async def _resolve_mastery(user_id: str | None, topic_id: str) -> float | None:
    if not user_id:
        return None
    rows = await fetch_mastery(user_id)
    for row in rows:
        if row.get("topicId") == topic_id:
            return float(row.get("ewa", 0.0))
    return None


def _trim_history(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Keep the most recent MAX_HISTORY_MESSAGES; drop older context. The system
    prompt is added separately by stream_chat, so history is just user/assistant turns."""
    trimmed = messages[-MAX_HISTORY_MESSAGES:]
    # The first remaining turn must be `user` for chat-completion shape correctness.
    while trimmed and trimmed[0].get("role") != "user":
        trimmed = trimmed[1:]
    return trimmed


async def stream_tutor_response(
    *,
    topic_id: str,
    messages: list[dict[str, str]],
    user_id: str | None = None,
) -> AsyncIterator[str]:
    """Token stream for one tutor turn. The caller wraps this in a StreamingResponse."""
    topic_meta, mastery_ewa = None, None
    try:
        topic_meta = await _fetch_topic(topic_id)
        mastery_ewa = await _resolve_mastery(user_id, topic_id)
    except Exception as e:  # noqa: BLE001
        log.warning("tutor_context_failed", error=str(e), topic_id=topic_id)

    system = _build_system(topic_meta, mastery_ewa)
    history = _trim_history(messages)
    if not history:
        yield "Send a question and I'll do my best to help."
        return

    async for delta in llm.stream_chat(
        system=system,
        messages=history,
        max_tokens=MAX_RESPONSE_TOKENS,
    ):
        yield delta
