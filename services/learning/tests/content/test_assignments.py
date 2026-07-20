"""Sprint 9 Educator Assignments — endpoint tests.

Covers the lifecycle:
  educator creates DRAFT → adds questions → publishes → student fetches
  → student records progress → educator views leaderboard.

Plus the negative paths:
  - Student can't create assignments (403)
  - Editing question list after publish → 409
  - Re-publish is idempotent (no double NATS fanout)
  - Student can't see DRAFT
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from uuid import uuid4

import asyncpg
import jwt
import pytest
from fastapi.testclient import TestClient

from learning.content.config import settings
from learning.main import app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def _token(user_id: str, role: str) -> str:
    return jwt.encode(
        {"sub": user_id, "role": role, "token_type": "access", "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret,
        algorithm="HS256",
    )


def _auth(user_id: str, role: str) -> dict[str, str]:
    return {"authorization": f"Bearer {_token(user_id, role)}"}


def _new_assignment(cohort_id: str | None = None) -> dict:
    return {
        "cohortId": cohort_id or str(uuid4()),
        "title": "Mechanics — Week 3 problem set",
        "description": "Five FBD + energy problems",
    }


# ─────────────────────────────────────────────────────────────────────────
# create + list
# ─────────────────────────────────────────────────────────────────────────


def test_create_assignment_requires_educator_role(client: TestClient) -> None:
    r = client.post(
        "/content/assignments",
        headers=_auth(str(uuid4()), "STUDENT"),
        json=_new_assignment(),
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "forbidden"


def test_teacher_can_create_assignment(client: TestClient) -> None:
    r = client.post(
        "/content/assignments",
        headers=_auth(str(uuid4()), "TEACHER"),
        json=_new_assignment(),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["publishedAt"] is None  # DRAFT
    assert body["title"].startswith("Mechanics")


def test_list_requires_filter(client: TestClient) -> None:
    r = client.get(
        "/content/assignments", headers=_auth(str(uuid4()), "TEACHER")
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "missing_filter"


def test_list_by_cohort_returns_drafts_for_educator(client: TestClient) -> None:
    teacher = str(uuid4())
    cohort = str(uuid4())
    client.post(
        "/content/assignments",
        headers=_auth(teacher, "TEACHER"),
        json=_new_assignment(cohort),
    )
    r = client.get(
        f"/content/assignments?cohortId={cohort}",
        headers=_auth(teacher, "TEACHER"),
    )
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["publishedAt"] is None


def test_list_by_cohort_hides_drafts_from_student(client: TestClient) -> None:
    """Students must NOT see in-progress drafts — that would leak the
    educator's lesson plan before they've finalised it."""
    teacher = str(uuid4())
    student = str(uuid4())
    cohort = str(uuid4())
    client.post(
        "/content/assignments",
        headers=_auth(teacher, "TEACHER"),
        json=_new_assignment(cohort),
    )
    r = client.get(
        f"/content/assignments?cohortId={cohort}",
        headers=_auth(student, "STUDENT"),
    )
    assert r.status_code == 200
    assert r.json() == []


# ─────────────────────────────────────────────────────────────────────────
# publish + question list
# ─────────────────────────────────────────────────────────────────────────


def _create_assignment(client: TestClient, teacher: str, cohort: str) -> str:
    r = client.post(
        "/content/assignments",
        headers=_auth(teacher, "TEACHER"),
        json=_new_assignment(cohort),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_set_questions_then_publish(client: TestClient) -> None:
    teacher = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)
    # Use random UUIDs as question_ids — they don't need to exist in
    # questions table for this insert (the FK is on assignment_id only).
    qids = [str(uuid4()) for _ in range(3)]
    r = client.put(
        f"/content/assignments/{aid}/questions",
        headers=_auth(teacher, "TEACHER"),
        json={"questionIds": qids},
    )
    assert r.status_code == 200
    assert r.json()["count"] == 3

    r = client.post(
        f"/content/assignments/{aid}/publish",
        headers=_auth(teacher, "TEACHER"),
    )
    assert r.status_code == 200
    assert r.json()["publishedAt"] is not None


def test_cannot_edit_questions_after_publish(client: TestClient) -> None:
    """Once published, the question list is locked — students may have
    already started; mutating the set under them would be a footgun."""
    teacher = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)
    client.put(
        f"/content/assignments/{aid}/questions",
        headers=_auth(teacher, "TEACHER"),
        json={"questionIds": [str(uuid4())]},
    )
    client.post(
        f"/content/assignments/{aid}/publish",
        headers=_auth(teacher, "TEACHER"),
    )
    r = client.put(
        f"/content/assignments/{aid}/questions",
        headers=_auth(teacher, "TEACHER"),
        json={"questionIds": [str(uuid4())]},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "already_published"


def test_publish_is_idempotent(client: TestClient) -> None:
    """Re-publishing a published assignment must NOT bump published_at —
    that would re-fire `content.assignment.created` and re-spam the
    cohort with `assignment.new` notifications."""
    teacher = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)
    r1 = client.post(
        f"/content/assignments/{aid}/publish",
        headers=_auth(teacher, "TEACHER"),
    )
    r2 = client.post(
        f"/content/assignments/{aid}/publish",
        headers=_auth(teacher, "TEACHER"),
    )
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["publishedAt"] == r2.json()["publishedAt"]


def test_student_cannot_see_draft(client: TestClient) -> None:
    teacher = str(uuid4())
    student = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)
    r = client.get(
        f"/content/assignments/{aid}",
        headers=_auth(student, "STUDENT"),
    )
    assert r.status_code == 404


def test_student_can_see_published(client: TestClient) -> None:
    teacher = str(uuid4())
    student = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)
    client.post(
        f"/content/assignments/{aid}/publish",
        headers=_auth(teacher, "TEACHER"),
    )
    r = client.get(
        f"/content/assignments/{aid}",
        headers=_auth(student, "STUDENT"),
    )
    assert r.status_code == 200
    assert r.json()["publishedAt"] is not None


# ─────────────────────────────────────────────────────────────────────────
# progress
# ─────────────────────────────────────────────────────────────────────────


def test_progress_rejects_score_higher_than_total(client: TestClient) -> None:
    teacher = str(uuid4())
    student = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)
    client.post(
        f"/content/assignments/{aid}/publish",
        headers=_auth(teacher, "TEACHER"),
    )
    r = client.post(
        f"/content/assignments/{aid}/progress",
        headers=_auth(student, "STUDENT"),
        json={"correctCount": 6, "totalCount": 5},
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "invalid_score"


def test_progress_records_then_appears_in_leaderboard(
    client: TestClient,
) -> None:
    teacher = str(uuid4())
    s1 = str(uuid4())
    s2 = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)
    client.post(
        f"/content/assignments/{aid}/publish",
        headers=_auth(teacher, "TEACHER"),
    )
    # Two students record progress; the educator's leaderboard must
    # sort by accuracy_pct DESC (s1 with 4/5 = 80% should be above
    # s2 with 2/5 = 40%).
    client.post(
        f"/content/assignments/{aid}/progress",
        headers=_auth(s1, "STUDENT"),
        json={"correctCount": 4, "totalCount": 5},
    )
    client.post(
        f"/content/assignments/{aid}/progress",
        headers=_auth(s2, "STUDENT"),
        json={"correctCount": 2, "totalCount": 5},
    )
    r = client.get(
        f"/content/assignments/{aid}/leaderboard",
        headers=_auth(teacher, "TEACHER"),
    )
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    assert rows[0]["userId"] == s1
    assert rows[0]["accuracyPct"] == 80
    assert rows[1]["accuracyPct"] == 40


def test_progress_overwrite_on_reattempt(client: TestClient) -> None:
    """A student re-attempting must replace their previous score, not
    append a row. UNIQUE (assignment_id, user_id) on the table makes
    this a hard constraint."""
    teacher = str(uuid4())
    student = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)
    client.post(
        f"/content/assignments/{aid}/publish",
        headers=_auth(teacher, "TEACHER"),
    )
    client.post(
        f"/content/assignments/{aid}/progress",
        headers=_auth(student, "STUDENT"),
        json={"correctCount": 1, "totalCount": 5},
    )
    client.post(
        f"/content/assignments/{aid}/progress",
        headers=_auth(student, "STUDENT"),
        json={"correctCount": 5, "totalCount": 5},
    )
    r = client.get(
        f"/content/assignments/{aid}/leaderboard",
        headers=_auth(teacher, "TEACHER"),
    )
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["correctCount"] == 5


def test_leaderboard_requires_educator(client: TestClient) -> None:
    teacher = str(uuid4())
    student = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)
    r = client.get(
        f"/content/assignments/{aid}/leaderboard",
        headers=_auth(student, "STUDENT"),
    )
    assert r.status_code == 403


# ─────────────────────────────────────────────────────────────────────────
# Sprint 10 S10-D — grade_answers (pure) + /submit endpoint
# ─────────────────────────────────────────────────────────────────────────


def test_grade_answers_all_correct() -> None:
    from learning.content.assignments_repo import grade_answers

    keys = [
        {"question_id": "q1", "position": 1, "correct_idx": 2},
        {"question_id": "q2", "position": 2, "correct_idx": 0},
    ]
    answers = {"q1": 2, "q2": 0}
    correct, total, breakdown = grade_answers(keys, answers)
    assert correct == 2
    assert total == 2
    assert all(b["isCorrect"] for b in breakdown)


def test_grade_answers_partial_and_missing() -> None:
    from learning.content.assignments_repo import grade_answers

    keys = [
        {"question_id": "q1", "position": 1, "correct_idx": 1},
        {"question_id": "q2", "position": 2, "correct_idx": 3},
        {"question_id": "q3", "position": 3, "correct_idx": 0},
    ]
    # q1 wrong, q2 right, q3 not answered
    answers = {"q1": 0, "q2": 3}
    correct, total, breakdown = grade_answers(keys, answers)
    assert correct == 1
    assert total == 3
    assert breakdown[0]["isCorrect"] is False
    assert breakdown[1]["isCorrect"] is True
    assert breakdown[2]["isCorrect"] is False
    assert breakdown[2]["studentAnswer"] is None


def test_submit_requires_published_assignment(client: TestClient) -> None:
    teacher = str(uuid4())
    student = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)  # DRAFT
    r = client.post(
        f"/content/assignments/{aid}/submit",
        headers=_auth(student, "STUDENT"),
        json={"answers": {}},
    )
    assert r.status_code == 404


def test_submit_409_when_no_questions(client: TestClient) -> None:
    teacher = str(uuid4())
    student = str(uuid4())
    cohort = str(uuid4())
    aid = _create_assignment(client, teacher, cohort)
    client.post(
        f"/content/assignments/{aid}/publish",
        headers=_auth(teacher, "TEACHER"),
    )
    r = client.post(
        f"/content/assignments/{aid}/submit",
        headers=_auth(student, "STUDENT"),
        json={"answers": {}},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "no_questions"


# ─────────────────────────────────────────────────────────────────────────
# Sprint 11 S11-C — explanation surfaces on misses
# ─────────────────────────────────────────────────────────────────────────


def test_grade_answers_attaches_explanation_only_on_misses() -> None:
    """The educator's `explanation` field is the teaching note. We
    surface it on missed questions only — showing it on correct answers
    dilutes the signal (and rewards memorising explanations)."""
    from learning.content.assignments_repo import grade_answers

    keys = [
        {
            "question_id": "q1",
            "position": 1,
            "correct_idx": 1,
            "stem": "What is 2+2?",
            "explanation": "Basic addition: count up from 2.",
        },
        {
            "question_id": "q2",
            "position": 2,
            "correct_idx": 0,
            "stem": "Capital of India?",
            "explanation": "New Delhi has been the capital since 1911.",
        },
    ]
    _, _, breakdown = grade_answers(keys, {"q1": 1, "q2": 3})
    assert breakdown[0]["isCorrect"] is True
    assert breakdown[0]["explanation"] is None  # correct → no teaching note
    assert breakdown[1]["isCorrect"] is False
    assert (
        breakdown[1]["explanation"]
        == "New Delhi has been the capital since 1911."
    )
    # Stems are always surfaced — the result panel needs them to label rows.
    assert breakdown[0]["stem"] == "What is 2+2?"
    assert breakdown[1]["stem"] == "Capital of India?"


def test_grade_answers_handles_missing_explanation() -> None:
    """Defensive: many existing questions don't have an explanation.
    The breakdown must still render — None passes through cleanly."""
    from learning.content.assignments_repo import grade_answers

    keys = [
        {
            "question_id": "q1",
            "position": 1,
            "correct_idx": 0,
            "stem": "Stem text",
            "explanation": None,
        },
    ]
    _, _, breakdown = grade_answers(keys, {"q1": 2})
    assert breakdown[0]["isCorrect"] is False
    assert breakdown[0]["explanation"] is None
