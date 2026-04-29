"""Data access for profile_schema.profiles + exam_selections."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class ProfileRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def by_user_id(self, user_id: UUID | str) -> dict[str, Any] | None:
        row = (
            await self.s.execute(
                text(
                    "SELECT user_id, first_name, last_name, email, avatar_url, locale, language_pref, "
                    "daily_goal_minutes, onboarding_state, timezone, tenant_id, notification_prefs "
                    "FROM profile_schema.profiles WHERE user_id = :uid"
                ),
                {"uid": str(user_id)},
            )
        ).mappings().first()
        return dict(row) if row else None

    async def patch_notification_prefs(
        self, user_id: UUID | str, prefs: dict[str, bool]
    ) -> dict[str, Any]:
        """Merge-write the per-type mute map. Missing types stay enabled, and
        existing types not in this patch keep their value."""
        import json

        await self.s.execute(
            text(
                "UPDATE profile_schema.profiles SET "
                "notification_prefs = COALESCE(notification_prefs, '{}'::jsonb) || CAST(:p AS JSONB), "
                "updated_at = NOW() "
                "WHERE user_id = :uid"
            ),
            {"uid": str(user_id), "p": json.dumps(prefs)},
        )
        row = await self.by_user_id(user_id)
        assert row is not None
        return row

    async def ensure(
        self,
        *,
        user_id: UUID | str,
        first_name: str,
        last_name: str,
    ) -> dict[str, Any]:
        """Lazy-create profile on first access. Auth → Profile NATS event flow replaces this in Sprint 1 Day 3+."""
        await self.s.execute(
            text(
                "INSERT INTO profile_schema.profiles (user_id, first_name, last_name) "
                "VALUES (:uid, :fn, :ln) ON CONFLICT (user_id) DO NOTHING"
            ),
            {"uid": str(user_id), "fn": first_name or "User", "ln": last_name or "Student"},
        )
        row = await self.by_user_id(user_id)
        assert row is not None
        return row

    async def patch(
        self,
        *,
        user_id: UUID | str,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> dict[str, Any]:
        await self.s.execute(
            text(
                "UPDATE profile_schema.profiles SET "
                "first_name = COALESCE(:fn, first_name), "
                "last_name = COALESCE(:ln, last_name), "
                "updated_at = NOW() "
                "WHERE user_id = :uid"
            ),
            {"uid": str(user_id), "fn": first_name, "ln": last_name},
        )
        row = await self.by_user_id(user_id)
        assert row is not None
        return row

    async def patch_goals(
        self,
        *,
        user_id: UUID | str,
        target_exam_id: str | None = None,
        target_exam_date: Any = None,
        target_rank: int | None = None,
    ) -> dict[str, Any]:
        """Sprint 30 (P4-S30) — partial update of the target_* columns.
        Any field passed as None is preserved (COALESCE pattern); explicit
        clearing is a P5 enhancement (rare path)."""
        await self.s.execute(
            text(
                "UPDATE profile_schema.profiles SET "
                "target_exam_id = COALESCE(:te, target_exam_id), "
                "target_exam_date = COALESCE(:td, target_exam_date), "
                "target_rank = COALESCE(:tr, target_rank), "
                "updated_at = NOW() "
                "WHERE user_id = :uid"
            ),
            {
                "uid": str(user_id),
                "te": target_exam_id,
                "td": target_exam_date,
                "tr": target_rank,
            },
        )
        row = await self.by_user_id(user_id)
        assert row is not None
        return row

    async def set_avatar(self, user_id: UUID | str, avatar_url: str | None) -> None:
        await self.s.execute(
            text(
                "UPDATE profile_schema.profiles SET avatar_url = :av, updated_at = NOW() "
                "WHERE user_id = :uid"
            ),
            {"uid": str(user_id), "av": avatar_url},
        )

    async def patch_preferences(
        self,
        *,
        user_id: UUID | str,
        language: str | None = None,
        daily_goal_minutes: int | None = None,
    ) -> dict[str, Any]:
        await self.s.execute(
            text(
                "UPDATE profile_schema.profiles SET "
                "language_pref = COALESCE(:lang, language_pref), "
                "daily_goal_minutes = COALESCE(:goal, daily_goal_minutes), "
                "updated_at = NOW() "
                "WHERE user_id = :uid"
            ),
            {"uid": str(user_id), "lang": language, "goal": daily_goal_minutes},
        )
        # Advance onboarding FSM on daily-goal set (terminal step).
        if daily_goal_minutes is not None:
            await self.s.execute(
                text(
                    "UPDATE profile_schema.profiles SET onboarding_state = 'ONBOARDED', updated_at = NOW() "
                    "WHERE user_id = :uid AND onboarding_state = 'EXAM_SELECTED'"
                ),
                {"uid": str(user_id)},
            )
        row = await self.by_user_id(user_id)
        assert row is not None
        return row

    async def advance_to_exam_selected(self, user_id: UUID | str) -> None:
        await self.s.execute(
            text(
                "UPDATE profile_schema.profiles SET onboarding_state = 'EXAM_SELECTED', updated_at = NOW() "
                "WHERE user_id = :uid AND onboarding_state = 'NEW'"
            ),
            {"uid": str(user_id)},
        )


class ExamRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def list_for_user(self, user_id: UUID | str) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    "SELECT exam_id, target_date FROM profile_schema.exam_selections "
                    "WHERE user_id = :uid AND removed_at IS NULL ORDER BY selected_at"
                ),
                {"uid": str(user_id)},
            )
        ).mappings().all()
        return [dict(r) for r in rows]

    async def upsert(self, *, user_id: UUID | str, exam_id: str) -> None:
        await self.s.execute(
            text(
                "INSERT INTO profile_schema.exam_selections (user_id, exam_id) "
                "VALUES (:uid, :eid) "
                "ON CONFLICT (user_id, exam_id) DO UPDATE SET removed_at = NULL"
            ),
            {"uid": str(user_id), "eid": exam_id},
        )

    async def set_target_date(self, *, user_id: UUID | str, exam_id: str, target: date | None) -> bool:
        result = await self.s.execute(
            text(
                "UPDATE profile_schema.exam_selections SET target_date = :td "
                "WHERE user_id = :uid AND exam_id = :eid AND removed_at IS NULL"
            ),
            {"uid": str(user_id), "eid": exam_id, "td": target},
        )
        return bool(result.rowcount)


class BookmarksRepo:
    """Persistence for `profile_schema.bookmarks` — students saving questions
    from quiz results to revisit later. (user_id, question_id) is the PK so
    re-bookmarking the same item is idempotent."""

    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def add(
        self,
        *,
        user_id: UUID | str,
        question_id: str,
        topic_id: str | None,
        topic_title: str | None,
        stem: str | None,
        note: str | None,
    ) -> dict[str, Any]:
        row = (
            await self.s.execute(
                text(
                    """
                    INSERT INTO profile_schema.bookmarks
                        (user_id, question_id, topic_id, topic_title, stem, note)
                    VALUES (:uid, :qid, :tid, :ttl, :stem, :note)
                    ON CONFLICT (user_id, question_id) DO UPDATE
                      SET topic_id    = COALESCE(EXCLUDED.topic_id,    profile_schema.bookmarks.topic_id),
                          topic_title = COALESCE(EXCLUDED.topic_title, profile_schema.bookmarks.topic_title),
                          stem        = COALESCE(EXCLUDED.stem,        profile_schema.bookmarks.stem),
                          note        = COALESCE(EXCLUDED.note,        profile_schema.bookmarks.note)
                    RETURNING user_id, question_id, topic_id, topic_title, stem, note, created_at
                    """
                ),
                {
                    "uid": str(user_id),
                    "qid": question_id,
                    "tid": topic_id,
                    "ttl": topic_title,
                    "stem": stem,
                    "note": note,
                },
            )
        ).mappings().first()
        return dict(row) if row else {}

    async def list_for_user(self, user_id: UUID | str, limit: int = 100) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    """
                    SELECT user_id, question_id, topic_id, topic_title, stem, note, created_at
                      FROM profile_schema.bookmarks
                     WHERE user_id = :uid
                  ORDER BY created_at DESC
                     LIMIT :lim
                    """
                ),
                {"uid": str(user_id), "lim": limit},
            )
        ).mappings().all()
        return [dict(r) for r in rows]

    async def remove(self, *, user_id: UUID | str, question_id: str) -> bool:
        result = await self.s.execute(
            text(
                "DELETE FROM profile_schema.bookmarks "
                "WHERE user_id = :uid AND question_id = :qid"
            ),
            {"uid": str(user_id), "qid": question_id},
        )
        return bool(result.rowcount)


class MockAttemptsRepo:
    """Persistence for `profile_schema.mock_attempts` — durable scoreboard for
    the in-memory mock test orchestrator in adaptive-engine. We persist on
    /adaptive/mock/score so students can revisit past attempts from any device."""

    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def insert(
        self,
        *,
        user_id: UUID | str,
        mock_id: str | None,
        exam_code: str,
        exam_name: str | None,
        raw_score: int,
        max_marks: int,
        accuracy: float,
        total_questions: int,
        n_correct: int,
        n_wrong: int,
        n_unanswered: int,
        percentile: float | None,
        projected_rank: int | None,
        confidence: str | None,
        sections: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        import json

        row = (
            await self.s.execute(
                text(
                    """
                    INSERT INTO profile_schema.mock_attempts
                        (user_id, mock_id, exam_code, exam_name, raw_score, max_marks,
                         accuracy, total_questions, n_correct, n_wrong, n_unanswered,
                         percentile, projected_rank, confidence, sections)
                    VALUES (:uid, :mid, :ec, :en, :rs, :mm, :acc, :tq, :nc, :nw, :nu,
                            :pct, :rank, :conf, CAST(:sec AS JSONB))
                    RETURNING id, user_id, mock_id, exam_code, exam_name, raw_score,
                              max_marks, accuracy, total_questions, n_correct, n_wrong,
                              n_unanswered, percentile, projected_rank, confidence,
                              sections, created_at
                    """
                ),
                {
                    "uid": str(user_id),
                    "mid": mock_id,
                    "ec": exam_code,
                    "en": exam_name,
                    "rs": raw_score,
                    "mm": max_marks,
                    "acc": accuracy,
                    "tq": total_questions,
                    "nc": n_correct,
                    "nw": n_wrong,
                    "nu": n_unanswered,
                    "pct": percentile,
                    "rank": projected_rank,
                    "conf": confidence,
                    "sec": json.dumps(sections or []),
                },
            )
        ).mappings().first()
        return dict(row) if row else {}

    async def list_for_user(
        self, user_id: UUID | str, limit: int = 50
    ) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    """
                    SELECT id, user_id, mock_id, exam_code, exam_name, raw_score,
                           max_marks, accuracy, total_questions, n_correct, n_wrong,
                           n_unanswered, percentile, projected_rank, confidence,
                           sections, created_at
                      FROM profile_schema.mock_attempts
                     WHERE user_id = :uid
                  ORDER BY created_at DESC
                     LIMIT :lim
                    """
                ),
                {"uid": str(user_id), "lim": limit},
            )
        ).mappings().all()
        return [dict(r) for r in rows]

    async def count_for_user(self, user_id: UUID | str) -> int:
        res = await self.s.execute(
            text(
                "SELECT COUNT(*) FROM profile_schema.mock_attempts WHERE user_id = :uid"
            ),
            {"uid": str(user_id)},
        )
        row = res.first()
        return int(row[0]) if row else 0


class AchievementsRepo:
    """Persistence for `profile_schema.achievements`. Idempotent insert on
    (user_id, kind) so analytics can fire-and-forget without dedup logic."""

    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def grant(
        self,
        *,
        user_id: UUID | str,
        kind: str,
        payload: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], bool]:
        """Returns (row, created). `created` is True only when the INSERT
        actually persisted a new row — useful for the caller to fire a
        one-time `achievement.unlocked` notification only on first grant."""
        import json

        row = (
            await self.s.execute(
                text(
                    """
                    INSERT INTO profile_schema.achievements (user_id, kind, payload)
                    VALUES (:uid, :kind, CAST(:p AS JSONB))
                    ON CONFLICT (user_id, kind) DO NOTHING
                    RETURNING id, user_id, kind, payload, awarded_at
                    """
                ),
                {"uid": str(user_id), "kind": kind, "p": json.dumps(payload or {})},
            )
        ).mappings().first()
        if row:
            return dict(row), True
        # Row already existed — fetch it for the response so the caller still
        # gets a useful payload, with created=False so it can skip the ping.
        existing = (
            await self.s.execute(
                text(
                    "SELECT id, user_id, kind, payload, awarded_at "
                    "FROM profile_schema.achievements WHERE user_id = :uid AND kind = :kind"
                ),
                {"uid": str(user_id), "kind": kind},
            )
        ).mappings().first()
        return (dict(existing) if existing else {}), False

    async def list_for_user(self, user_id: UUID | str) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    "SELECT id, user_id, kind, payload, awarded_at "
                    "FROM profile_schema.achievements "
                    "WHERE user_id = :uid "
                    "ORDER BY awarded_at DESC"
                ),
                {"uid": str(user_id)},
            )
        ).mappings().all()
        return [dict(r) for r in rows]


class QuestionFeedbackRepo:
    """Persistence for `profile_schema.question_feedback` — student reports
    of ambiguous / wrong / typo questions surfaced from the quiz review UI.
    The (user_id, question_id, kind) UNIQUE constraint makes re-reporting the
    same kind a no-op so the moderator queue isn't flooded by impatient taps."""

    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def create(
        self,
        *,
        user_id: UUID | str,
        question_id: str,
        kind: str,
        note: str | None,
    ) -> dict[str, Any]:
        row = (
            await self.s.execute(
                text(
                    """
                    INSERT INTO profile_schema.question_feedback
                        (user_id, question_id, kind, note)
                    VALUES (:uid, :qid, :kind, :note)
                    ON CONFLICT (user_id, question_id, kind) DO UPDATE
                      SET note = COALESCE(EXCLUDED.note, profile_schema.question_feedback.note)
                    RETURNING id, question_id, kind, note, created_at
                    """
                ),
                {"uid": str(user_id), "qid": question_id, "kind": kind, "note": note},
            )
        ).mappings().first()
        return dict(row) if row else {}
