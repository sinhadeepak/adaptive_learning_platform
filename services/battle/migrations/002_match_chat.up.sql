-- F8a — In-match chat (only persisted during LOBBY + SCORING phases;
-- the engine enforces the timing rule, this table just stores rows).

CREATE TABLE IF NOT EXISTS battle_schema.match_chat (
    match_id   uuid NOT NULL,
    user_id    uuid NOT NULL,
    body       text NOT NULL CHECK (length(body) <= 500),
    sent_at    timestamptz NOT NULL DEFAULT now(),
    removed_at timestamptz,
    PRIMARY KEY (match_id, sent_at, user_id)
);

CREATE INDEX IF NOT EXISTS match_chat_match_idx
    ON battle_schema.match_chat (match_id, sent_at DESC);
