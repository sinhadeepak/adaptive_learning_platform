"""Seed comprehensive analytics simulation data.

Generates realistic activity for every seeded student so all analytics
screens (student / teacher / admin) populate with believable numbers
when the real production traffic hasn't started yet.

Per student we synthesize:
  - 60 days of daily_activity (3-15 questions/day, varied)
  - quiz_session rows (~25-40, some MOCK and some MOCK_BLUEPRINT)
  - per-session quiz_session_items with realistic time + correctness
  - mastery rows (5-12 topics) with non-trivial EWA
  - concept_mastery rows (mirrors mastery + bloom)
  - readiness (GLOBAL scope)
  - streak (mostly 3-25 day streaks)
  - error_classifications on wrong-answer items
  - confidence_calibration on a subset (so confidence-gap card has data)
  - real_exam_outcomes for ~40% of students (so career-outcome k-anon clears)
  - user_xp + xp_events + league_memberships
  - notes on a subset of topics
  - watch events (resource_view_events) where curated resources exist

Idempotent: existing rows are upserted / skipped. Re-runnable.

Usage (host):
  docker exec alp-local-engagement-1 python /repo/scripts/seed_analytics_simulation.py
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import random
import uuid
from datetime import date, datetime, timedelta, timezone

import asyncpg

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("seed")

# ─── Connection settings (match service .env defaults) ────────────────
PG_HOST = "postgres"
PG_USER = "postgres"
PG_PASS = "postgres"
PG_PORT = 5432

# Topics per exam-code prefix. We pick 5-12 topics per student randomly
# from the 200 catalog topics for v1 (cohort-exam scoping is overkill
# for the simulation goal: make the screens populate).
SUBJECTS_PER_STUDENT = 3
TOPICS_PER_STUDENT = 8
SESSIONS_PER_STUDENT = 30
DAYS_OF_HISTORY = 60
QUESTIONS_PER_SESSION = 10

ERR_CLASSES = [
    "silly_mistake",
    "conceptual_gap",
    "time_pressure",
    "formula_error",
    "sign_or_unit_error",
    "unattempted",
]


def deterministic_rng(user_id: str) -> random.Random:
    """Per-user deterministic RNG so reseeding produces stable shapes."""
    seed = int(hashlib.sha1(user_id.encode("utf-8")).hexdigest()[:16], 16)
    return random.Random(seed)


async def conn(db: str) -> asyncpg.Connection:
    return await asyncpg.connect(
        host=PG_HOST, port=PG_PORT, user=PG_USER, password=PG_PASS, database=db,
    )


async def fetch_students(identity: asyncpg.Connection) -> list[tuple[str, str, str, str | None]]:
    rows = await identity.fetch(
        """
        SELECT u.id::text,
               u.email,
               COALESCE(cm.cohort_id::text, '') AS cohort_id,
               -- Primary tenant from user_tenant_memberships, fall back to cohort's tenant.
               COALESCE(utm.tenant_id::text, c.tenant_id::text) AS tenant_id
          FROM auth_schema.users u
          LEFT JOIN institution_schema.cohort_members cm ON cm.user_id = u.id
          LEFT JOIN institution_schema.cohorts c ON c.id = cm.cohort_id
          LEFT JOIN LATERAL (
             SELECT tenant_id FROM institution_schema.user_tenant_memberships m
              WHERE m.user_id = u.id
              ORDER BY COALESCE(m.is_primary, FALSE) DESC, m.joined_at ASC
              LIMIT 1
          ) utm ON TRUE
         WHERE u.role = 'STUDENT' AND NOT u.is_deleted
         ORDER BY u.email
        """
    )
    return [(r["id"], r["email"], r["cohort_id"], r["tenant_id"]) for r in rows]


async def fetch_topics(learning: asyncpg.Connection) -> list[tuple[str, str, str]]:
    rows = await learning.fetch(
        """
        SELECT t.id::text, t.subject_id::text, COALESCE(t.title, '') AS title
          FROM catalog_schema.topics t
         ORDER BY t.id
        """
    )
    return [(r["id"], r["subject_id"], r["title"]) for r in rows]


async def fetch_questions_by_topic(quiz: asyncpg.Connection) -> dict[str, list[tuple[str, int, list[str], str]]]:
    """{topic_id: [(question_id, correct_idx, choices, stem), ...]}"""
    rows = await quiz.fetch(
        """
        SELECT id::text, topic_id::text, correct_idx, choices, stem
          FROM quiz_schema.questions
         WHERE status = 'PUBLISHED'
        """
    )
    out: dict[str, list[tuple[str, int, list[str], str]]] = {}
    for r in rows:
        # asyncpg returns jsonb as already-parsed value
        choices = r["choices"] if isinstance(r["choices"], list) else []
        out.setdefault(r["topic_id"], []).append(
            (r["id"], int(r["correct_idx"]), choices, r["stem"]),
        )
    return out


async def fetch_concepts_by_topic(learning: asyncpg.Connection) -> dict[str, list[str]]:
    """{topic_id: [concept_id, ...]}; for v1, concepts are loosely associated.
    If concept_topics doesn't exist, returns empty -> we'll synthesise a 1:1
    topic-as-concept fallback.
    """
    try:
        rows = await learning.fetch(
            """
            SELECT id::text AS concept_id, topic_id::text
              FROM catalog_schema.concepts
             WHERE topic_id IS NOT NULL
            """
        )
    except asyncpg.exceptions.UndefinedColumnError:
        return {}
    out: dict[str, list[str]] = {}
    for r in rows:
        out.setdefault(r["topic_id"], []).append(r["concept_id"])
    return out


async def seed_one_student(
    *,
    eng: asyncpg.Connection,
    quiz: asyncpg.Connection,
    student_id: str,
    cohort_id: str,
    tenant_id: str | None,
    topics_pool: list[tuple[str, str, str]],
    questions_by_topic: dict[str, list[tuple[str, int, list[str], str]]],
    concepts_by_topic: dict[str, list[str]],
) -> dict:
    rng = deterministic_rng(student_id)
    today = date.today()
    user_uuid = uuid.UUID(student_id)

    # Pick which topics this student practices.
    eligible_topics = [t for t in topics_pool if t[0] in questions_by_topic]
    if not eligible_topics:
        return {"skipped": True, "reason": "no_questions"}
    student_topics = rng.sample(
        eligible_topics, k=min(TOPICS_PER_STUDENT, len(eligible_topics)),
    )
    weak_count = max(1, len(student_topics) // 4)
    strong_count = max(1, len(student_topics) // 4)

    topic_strengths = {}
    for i, (tid, _sid, _title) in enumerate(student_topics):
        if i < weak_count:
            base_acc = rng.uniform(0.20, 0.45)
        elif i >= len(student_topics) - strong_count:
            base_acc = rng.uniform(0.75, 0.95)
        else:
            base_acc = rng.uniform(0.50, 0.72)
        topic_strengths[tid] = base_acc

    # ── Quiz sessions + items ─────────────────────────────────────
    sessions_added = 0
    items_added = 0
    daily_buckets: dict[date, dict] = {}
    correct_in_topic: dict[str, list[bool]] = {}

    days_with_activity = sorted(
        rng.sample(range(DAYS_OF_HISTORY), k=min(40, DAYS_OF_HISTORY))
    )

    for day_offset in days_with_activity:
        day = today - timedelta(days=DAYS_OF_HISTORY - 1 - day_offset)
        sessions_today = rng.choice([0, 0, 1, 1, 1, 2])
        for _ in range(sessions_today):
            tid = rng.choice(student_topics)[0]
            qpool = questions_by_topic[tid]
            base_acc = topic_strengths[tid]
            picks = rng.sample(qpool, k=min(QUESTIONS_PER_SESSION, len(qpool)))
            session_uuid = uuid.uuid4()
            started_at = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(
                hours=rng.randint(8, 20),
                minutes=rng.randint(0, 59),
            )
            session_minutes = QUESTIONS_PER_SESSION * 2
            submitted_at = started_at + timedelta(minutes=session_minutes)
            served = len(picks)
            correct_count = 0
            mode = rng.choice(["PRACTICE"] * 9 + ["MOCK"])
            expires_at = started_at + timedelta(minutes=90)
            await quiz.execute(
                """
                INSERT INTO quiz_schema.quiz_sessions
                  (id, user_id, topic_id, mode, strategy, status,
                   target_count, served_count, correct_count, started_at,
                   expires_at, submitted_at, ability_estimate, intent_anchor)
                VALUES
                  ($1, $2, $3, $4, 'binary_search', 'SUBMITTED', $5, $5, 0,
                   $6, $7, $8, 0.0, 'match')
                ON CONFLICT (id) DO NOTHING
                """,
                session_uuid, user_uuid, uuid.UUID(tid), mode, served,
                started_at, expires_at, submitted_at,
            )
            for idx, (qid, correct_idx, choices, stem) in enumerate(picks):
                got_it_right = rng.random() < base_acc
                if got_it_right:
                    answer_idx = correct_idx
                    correct_count += 1
                else:
                    other_idx = [i for i in range(len(choices)) if i != correct_idx]
                    answer_idx = rng.choice(other_idx) if other_idx else 0
                time_ms = rng.randint(20_000, 180_000)
                await quiz.execute(
                    """
                    INSERT INTO quiz_schema.quiz_session_items
                      (session_id, item_idx, question_id, served_at,
                       answer_idx, is_correct, answered_at, time_spent_ms)
                    VALUES ($1, $2, $3, $4, $5, $6, $4, $7)
                    ON CONFLICT (session_id, item_idx) DO NOTHING
                    """,
                    session_uuid, idx, uuid.UUID(qid),
                    started_at + timedelta(seconds=idx * 90),
                    answer_idx, got_it_right, time_ms,
                )
                items_added += 1
                correct_in_topic.setdefault(tid, []).append(got_it_right)

            await quiz.execute(
                """
                UPDATE quiz_schema.quiz_sessions
                   SET correct_count = $1, served_count = $2
                 WHERE id = $3
                """,
                correct_count, served, session_uuid,
            )

            sessions_added += 1
            bucket = daily_buckets.setdefault(day, {"sessions": 0, "questions": 0, "minutes": 0})
            bucket["sessions"] += 1
            bucket["questions"] += served
            bucket["minutes"] += session_minutes

    # ── daily_activity rollup ──────────────────────────────────────
    for day, b in daily_buckets.items():
        await eng.execute(
            """
            INSERT INTO analytics_schema.daily_activity
              (user_id, activity_date, sessions_count, questions_answered, study_minutes)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, activity_date) DO UPDATE
               SET sessions_count = EXCLUDED.sessions_count,
                   questions_answered = EXCLUDED.questions_answered,
                   study_minutes = EXCLUDED.study_minutes,
                   updated_at = NOW()
            """,
            user_uuid, day, b["sessions"], b["questions"], b["minutes"],
        )

    # ── streaks (longest run of consecutive activity in last 30 days) ─
    streak_days = sorted(daily_buckets.keys())
    if streak_days:
        last_active = streak_days[-1]
        current = 1
        longest = 1
        for i in range(len(streak_days) - 2, -1, -1):
            if (streak_days[i + 1] - streak_days[i]).days == 1:
                current += 1
                longest = max(longest, current)
            else:
                break
        # Trim "current" if last_active is more than 1 day ago.
        if (today - last_active).days > 1:
            current = 0
        await eng.execute(
            """
            INSERT INTO analytics_schema.streaks
              (user_id, current_streak, longest_streak, last_active_date)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id) DO UPDATE
               SET current_streak = EXCLUDED.current_streak,
                   longest_streak = GREATEST(analytics_schema.streaks.longest_streak, EXCLUDED.longest_streak),
                   last_active_date = EXCLUDED.last_active_date,
                   updated_at = NOW()
            """,
            user_uuid, current, longest, last_active,
        )

    # ── mastery + concept_mastery ───────────────────────────────
    n_topics_with_data = 0
    avg_ewa = 0.0
    for tid, attempts in correct_in_topic.items():
        n = len(attempts)
        if n == 0:
            continue
        # Weighted EWA (more recent attempts count more — but for seed
        # we just take a rolling average tilted toward most recent).
        recent = attempts[-min(20, len(attempts)):]
        ewa = sum(1 for x in recent if x) / len(recent)
        # Add slight noise so identical attempts don't all collapse to 1.0
        ewa = max(0.0, min(1.0, ewa + rng.uniform(-0.05, 0.05)))
        await eng.execute(
            """
            INSERT INTO analytics_schema.mastery (user_id, topic_id, ewa, n, tenant_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, topic_id) DO UPDATE
               SET ewa = EXCLUDED.ewa,
                   n = EXCLUDED.n,
                   tenant_id = COALESCE(EXCLUDED.tenant_id, analytics_schema.mastery.tenant_id),
                   updated_at = NOW()
            """,
            user_uuid, uuid.UUID(tid), ewa, n,
            uuid.UUID(tenant_id) if tenant_id else None,
        )
        n_topics_with_data += 1
        avg_ewa += ewa

        # Concept mastery — for v1, treat the topic's primary concept as
        # the topic itself when no concept_topics mapping exists.
        concept_id = (concepts_by_topic.get(tid) or [tid])[0]
        try:
            await eng.execute(
                """
                INSERT INTO analytics_schema.concept_mastery
                  (user_id, concept_id, ewa, n, last_seen_at, tenant_id)
                VALUES ($1, $2, $3, $4, NOW(), $5)
                ON CONFLICT (user_id, concept_id) DO UPDATE
                   SET ewa = EXCLUDED.ewa, n = EXCLUDED.n,
                       tenant_id = COALESCE(EXCLUDED.tenant_id, analytics_schema.concept_mastery.tenant_id),
                       last_seen_at = NOW(), updated_at = NOW()
                """,
                user_uuid, uuid.UUID(concept_id), ewa, n,
                uuid.UUID(tenant_id) if tenant_id else None,
            )
        except (asyncpg.exceptions.ForeignKeyViolationError,
                asyncpg.exceptions.InvalidTextRepresentationError,
                asyncpg.exceptions.DataError):
            pass

    if n_topics_with_data > 0:
        avg_ewa /= n_topics_with_data
    else:
        avg_ewa = 0.0

    # ── readiness ────────────────────────────────────────────
    await eng.execute(
        """
        INSERT INTO analytics_schema.readiness (user_id, scope, score, n_topics, tenant_id)
        VALUES ($1, 'GLOBAL', $2, $3, $4)
        ON CONFLICT (user_id, scope) DO UPDATE
           SET score = EXCLUDED.score, n_topics = EXCLUDED.n_topics,
               tenant_id = COALESCE(EXCLUDED.tenant_id, analytics_schema.readiness.tenant_id),
               updated_at = NOW()
        """,
        user_uuid, avg_ewa, n_topics_with_data,
        uuid.UUID(tenant_id) if tenant_id else None,
    )

    # ── error classifications on wrong-answer items ───────────────
    # Pick 30% of wrong items, label with a class.
    err_inserted = 0
    rows = await quiz.fetch(
        """
        SELECT i.session_id::text, i.item_idx, s.topic_id::text
          FROM quiz_schema.quiz_session_items i
          JOIN quiz_schema.quiz_sessions s ON s.id = i.session_id
         WHERE s.user_id = $1 AND i.is_correct = false AND i.answered_at IS NOT NULL
         LIMIT 50
        """,
        user_uuid,
    )
    for r in rows:
        if rng.random() > 0.6:
            continue
        cls = rng.choice(ERR_CLASSES)
        try:
            await eng.execute(
                """
                INSERT INTO analytics_schema.error_classifications
                  (session_id, item_idx, user_id, topic_id, classification)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (session_id, item_idx) DO UPDATE
                   SET classification = EXCLUDED.classification
                """,
                uuid.UUID(r["session_id"]), int(r["item_idx"]),
                user_uuid, uuid.UUID(r["topic_id"]), cls,
            )
            err_inserted += 1
        except Exception:
            pass

    # ── confidence_calibration on a subset ────────────────────────
    conf_inserted = 0
    if rng.random() < 0.7:  # 70% of students try confidence mode
        rows = await quiz.fetch(
            """
            SELECT i.question_id::text, i.is_correct
              FROM quiz_schema.quiz_session_items i
              JOIN quiz_schema.quiz_sessions s ON s.id = i.session_id
             WHERE s.user_id = $1 AND i.answered_at IS NOT NULL
             LIMIT 30
            """,
            user_uuid,
        )
        for r in rows:
            actual = bool(r["is_correct"])
            # Bias prediction: students are systematically over-confident.
            pred = max(0.0, min(1.0, (1.0 if actual else 0.5) + rng.uniform(-0.25, 0.20)))
            await eng.execute(
                """
                INSERT INTO analytics_schema.confidence_calibration
                  (user_id, question_id, predicted_correct, actual_correct)
                VALUES ($1, $2, $3, $4)
                """,
                user_uuid, uuid.UUID(r["question_id"]), pred, actual,
            )
            conf_inserted += 1

    # ── real_exam_outcomes for ~40% of students ────────────────────
    outcomes_inserted = 0
    if rng.random() < 0.4:
        # Higher avg_ewa -> better real rank (with noise).
        exam_code = rng.choice(["NEET", "JEE"])
        score_pct = max(20.0, min(95.0, avg_ewa * 100 + rng.uniform(-10, 10)))
        # Map score back to rank: 90% -> 5K, 60% -> 30K, 40% -> 100K
        rank = int(max(50, 1_000_000 / max(score_pct, 1) - rng.uniform(0, 5000)))
        if score_pct >= 75:
            admit = rng.choice(["AIIMS Delhi", "JIPMER", "AFMC", "IIT Bombay", "IIT Delhi"])
        elif score_pct >= 60:
            admit = rng.choice(["NIT Trichy", "BITS Pilani", "Manipal", "VIT Vellore"])
        else:
            admit = None
        await eng.execute(
            """
            INSERT INTO analytics_schema.real_exam_outcomes
              (user_id, exam_code, real_score, real_rank, admitted_to)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, exam_code) DO UPDATE
               SET real_score = EXCLUDED.real_score,
                   real_rank = EXCLUDED.real_rank,
                   admitted_to = EXCLUDED.admitted_to,
                   reported_at = NOW()
            """,
            user_uuid, exam_code, round(score_pct, 2), rank, admit,
        )
        outcomes_inserted = 1

    # ── XP + leagues ───────────────────────────────────────────
    total_xp_to_award = (
        25 * sessions_added                                 # quiz_completed
        + sum(sum(1 for x in lst if x) for lst in correct_in_topic.values())  # quiz_correct
        + min(30, current if 'current' in dir() else 0) * 5  # streak_day cap 30
    )
    if total_xp_to_award > 0:
        await eng.execute(
            """
            INSERT INTO analytics_schema.xp_events
              (user_id, event_type, xp_delta, source_id)
            VALUES ($1, 'simulation_seed', $2, NULL)
            """,
            user_uuid, total_xp_to_award,
        )
        # Pick a league based on total xp
        if total_xp_to_award >= 1500:
            league = "GOLD"
        elif total_xp_to_award >= 600:
            league = "SILVER"
        else:
            league = "BRONZE"
        weekly_xp = int(total_xp_to_award * 0.25)
        level = max(1, 1 + int((total_xp_to_award / 100.0) ** 0.5))
        await eng.execute(
            """
            INSERT INTO analytics_schema.user_xp
              (user_id, total_xp, current_level, weekly_xp,
               weekly_resets_at, current_league)
            VALUES ($1, $2, $3, $4,
                    date_trunc('week', NOW()) + INTERVAL '7 days',
                    $5)
            ON CONFLICT (user_id) DO UPDATE
               SET total_xp = EXCLUDED.total_xp,
                   current_level = EXCLUDED.current_level,
                   weekly_xp = EXCLUDED.weekly_xp,
                   current_league = EXCLUDED.current_league,
                   updated_at = NOW()
            """,
            user_uuid, total_xp_to_award, level, weekly_xp, league,
        )
        await eng.execute(
            """
            INSERT INTO analytics_schema.league_memberships
              (user_id, week_start, league_id, weekly_xp)
            VALUES ($1, date_trunc('week', NOW())::date, $2, $3)
            ON CONFLICT (user_id, week_start) DO UPDATE
               SET league_id = EXCLUDED.league_id,
                   weekly_xp = EXCLUDED.weekly_xp
            """,
            user_uuid, league, weekly_xp,
        )

    return {
        "student": student_id,
        "topics": n_topics_with_data,
        "sessions": sessions_added,
        "items": items_added,
        "errors_classified": err_inserted,
        "conf_ratings": conf_inserted,
        "real_outcomes": outcomes_inserted,
        "xp": total_xp_to_award,
        "avg_ewa": round(avg_ewa, 3),
    }


async def main() -> None:
    log.info("Connecting to all 4 databases...")
    identity = await conn("identity")
    learning = await conn("learning")
    quiz = await conn("quiz")
    eng = await conn("engagement")
    try:
        students = await fetch_students(identity)
        topics = await fetch_topics(learning)
        questions_by_topic = await fetch_questions_by_topic(quiz)
        concepts_by_topic = await fetch_concepts_by_topic(learning)

        log.info(
            "Found %d students, %d topics, %d topics with questions",
            len(students), len(topics), len(questions_by_topic),
        )

        results = []
        for i, (student_id, email, cohort_id, tenant_id) in enumerate(students):
            try:
                r = await seed_one_student(
                    eng=eng, quiz=quiz,
                    student_id=student_id, cohort_id=cohort_id,
                    tenant_id=tenant_id,
                    topics_pool=topics,
                    questions_by_topic=questions_by_topic,
                    concepts_by_topic=concepts_by_topic,
                )
                results.append(r)
                if (i + 1) % 10 == 0 or i == len(students) - 1:
                    log.info(
                        "  [%d/%d] %s: topics=%s sessions=%s xp=%s ewa=%s",
                        i + 1, len(students), email,
                        r.get("topics"), r.get("sessions"),
                        r.get("xp"), r.get("avg_ewa"),
                    )
            except Exception as err:
                log.exception("seed failed for %s: %s", email, err)

        # Refresh the drill-tenant materialized view so the analytics
        # drill page picks up the new mastery rows immediately.
        try:
            await eng.execute("REFRESH MATERIALIZED VIEW analytics_schema.mv_drill_topic")
            log.info("refreshed mv_drill_topic")
        except Exception as err:
            log.warning("mv_drill_topic refresh skipped: %s", err)

        # Headline summary
        total_sessions = sum(r.get("sessions") or 0 for r in results)
        total_items = sum(r.get("items") or 0 for r in results)
        log.info(
            "DONE: %d students seeded · %d sessions · %d items",
            len(results), total_sessions, total_items,
        )
    finally:
        await asyncio.gather(
            identity.close(), learning.close(), quiz.close(), eng.close(),
            return_exceptions=True,
        )


if __name__ == "__main__":
    asyncio.run(main())
