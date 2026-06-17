-- F7 — Battle Mode Core schema.
--
-- A separate `battle_schema` keeps the real-time game state isolated
-- from quiz/learning/analytics. The schema is owned by alp-battle; no
-- other service writes here. Read-only joins are allowed via the FDW
-- pattern documented in ADR-0001.

CREATE SCHEMA IF NOT EXISTS battle_schema;

-- ── matches ──────────────────────────────────────────────────────────
-- One row per game. `blueprint_id` references catalog_schema.exam_blueprints
-- but we don't FK across services (per ADR-0001) — composition references
-- the id, not enforced.
CREATE TABLE IF NOT EXISTS battle_schema.matches (
    id           uuid PRIMARY KEY,
    mode         text NOT NULL CHECK (mode IN ('QUICK_PLAY','PRIVATE','CLAN')),
    exam_id      uuid,
    blueprint_id uuid,
    status       text NOT NULL CHECK (status IN ('LOBBY','STARTING','IN_PROGRESS','SCORING','DONE','ABANDONED'))
                 DEFAULT 'LOBBY',
    invite_code  text UNIQUE,  -- nullable for QUICK_PLAY
    created_at   timestamptz NOT NULL DEFAULT now(),
    started_at   timestamptz,
    ended_at     timestamptz
);

CREATE INDEX IF NOT EXISTS matches_status_idx ON battle_schema.matches (status);
CREATE INDEX IF NOT EXISTS matches_exam_idx   ON battle_schema.matches (exam_id);

-- ── match_players ───────────────────────────────────────────────────
-- Composite PK on (match_id, user_id). `final_rank` is 1-indexed after
-- scoring. `elo_before` + `elo_after` snapshot the rating for the
-- player on this exam at scoring time.
CREATE TABLE IF NOT EXISTS battle_schema.match_players (
    match_id     uuid NOT NULL REFERENCES battle_schema.matches(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL,
    joined_at    timestamptz NOT NULL DEFAULT now(),
    ready_at     timestamptz,
    final_score  integer,
    final_rank   smallint,
    elo_before   integer,
    elo_after    integer,
    PRIMARY KEY (match_id, user_id)
);

-- ── match_answers ───────────────────────────────────────────────────
-- One row per (match, player, question_idx). `time_ms` is the player's
-- latency from question reveal to submit. Server-authoritative
-- correctness (no client-side claim).
CREATE TABLE IF NOT EXISTS battle_schema.match_answers (
    match_id      uuid NOT NULL,
    user_id       uuid NOT NULL,
    question_idx  smallint NOT NULL,
    picked_idx    smallint NOT NULL,
    time_ms       integer NOT NULL,
    is_correct    boolean NOT NULL,
    scored_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, user_id, question_idx),
    FOREIGN KEY (match_id, user_id)
        REFERENCES battle_schema.match_players(match_id, user_id)
        ON DELETE CASCADE
);

-- ── elo ─────────────────────────────────────────────────────────────
-- Glicko-2 state per (user, exam). Default seed 1500 with high RD so
-- new players converge fast. `volatility` is the player's measure of
-- erratic performance — updated every match.
CREATE TABLE IF NOT EXISTS battle_schema.elo (
    user_id      uuid NOT NULL,
    exam_id      uuid NOT NULL,
    rating       integer NOT NULL DEFAULT 1500,
    rd           integer NOT NULL DEFAULT 350,
    volatility   real    NOT NULL DEFAULT 0.06,
    n_matches    integer NOT NULL DEFAULT 0,
    last_updated timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, exam_id)
);

-- ── queue snapshot (in-memory state is authoritative; this is for
--    crash-recovery + analytics only) ────────────────────────────────
CREATE TABLE IF NOT EXISTS battle_schema.queue_snapshot (
    user_id   uuid NOT NULL,
    exam_id   uuid NOT NULL,
    elo_band  smallint NOT NULL,
    queued_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id)
);
