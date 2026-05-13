-- Cross-session exposure tracker. Until now, "unserved" filtering only
-- considered the current session, so two consecutive practice sessions
-- on the same topic deterministically picked the same questions.
--
-- This table records every (user, question) pair the moment it's served,
-- letting the selector deprioritise recently-seen items. Combined with
-- the randomisation tiebreaker added in the same sprint, a fresh
-- practice round on the same topic now surfaces unseen questions until
-- the bank is exhausted.

CREATE TABLE IF NOT EXISTS quiz_schema.user_question_exposure (
  user_id      uuid        NOT NULL,
  question_id  uuid        NOT NULL,
  served_count integer     NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

-- Lookup index: "questions this user has seen, in this topic, sorted by recency".
-- Used by the candidate-list query to prefer never-seen → least-recently-seen.
CREATE INDEX IF NOT EXISTS idx_uqe_user_lastseen
  ON quiz_schema.user_question_exposure (user_id, last_seen_at DESC);
