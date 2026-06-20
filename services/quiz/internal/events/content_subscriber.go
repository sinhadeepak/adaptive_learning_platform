// Content → Quiz bridge: subscribe to Content's published-question events
// and mirror the row into quiz_schema.questions so the new item is eligible
// for serving in active sessions.
//
// Stream: CONTENT_EVENTS (Content service creates it; we add_stream-idempotent
// here too in case Quiz starts first). Subject: content.question.published.
// Durable consumer: quiz-content-published. AckPolicy = explicit. Idempotent
// upsert by question id, so JetStream's at-least-once redelivery is safe.

package events

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

const (
	ContentStreamName                    = "CONTENT_EVENTS"
	SubjectContentQuestionPublished      = "content.question.published"
	SubjectContentTranslationPublished   = "content.translation.published"
	contentDurable                       = "quiz-content-published"
	contentTranslationDurable            = "quiz-content-translation-published"
)

// QuestionPublished is the wire payload produced by Content's
// publish_question_published. Field names match the Python emitter.
//
// DiscriminationA / GuessingC are pointers so missing fields (older publishers,
// before Sprint 4) round-trip cleanly to nil — the upsert then falls back to
// the column defaults (1.0 / 0.0).
type QuestionPublished struct {
	ID              string   `json:"id"`
	TopicID         string   `json:"topic_id"`
	Stem            string   `json:"stem"`
	Choices         []string `json:"choices"`
	CorrectIdx      int16    `json:"correct_idx"`
	DifficultyB     float32  `json:"difficulty_b"`
	DiscriminationA *float32 `json:"discrimination_a,omitempty"`
	GuessingC       *float32 `json:"guessing_c,omitempty"`
	Language        string   `json:"language"`
	Explanation     *string  `json:"explanation,omitempty"`
	// Sprint 24 (P4-S24) — PYQ metadata. omitempty preserves the historical
	// payload shape for any old in-flight messages; absent => not a PYQ.
	PyqFlag      bool    `json:"pyq_flag,omitempty"`
	ExamYear     *int16  `json:"exam_year,omitempty"`
	PaperSession *string `json:"paper_session,omitempty"`
	// Phase 5 (P5-S38) — polymorphic question_type discriminator.
	// omitempty preserves backward compat: pre-S38 publishers omit this
	// field, and the upsert defaults to MCQ_SINGLE via the column DEFAULT.
	QuestionType *string `json:"question_type,omitempty"`
	// Phase 7 — typed renderer payload (rubrics, word_count_range,
	// markers, …). RawMessage so we don't impose a Go-side schema; the
	// student frontend deserialises into the renderer-specific shape.
	// nil for legacy MCQ rows where the choices array is sufficient.
	Payload json.RawMessage `json:"payload,omitempty"`
}

// TranslationPublished is the wire payload produced by the learning service when
// a human-translated question is approved. Field names match the JSON emitter exactly.
type TranslationPublished struct {
	QuestionID  string          `json:"question_id"`
	Language    string          `json:"language"`
	Stem        *string         `json:"stem,omitempty"`
	Choices     []string        `json:"choices,omitempty"`
	Explanation *string         `json:"explanation,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty"`
	Version     int             `json:"version"`
}

// ContentSubscriber owns the JetStream consumer that mirrors content.question.published
// rows into quiz_schema.questions.
type ContentSubscriber struct {
	pool         *pgxpool.Pool
	conn         *nats.Conn
	consCtx      jetstream.ConsumeContext
	transConsCtx jetstream.ConsumeContext
	logger       *slog.Logger
}

// StartContentSubscriber connects to NATS, ensures the stream exists, binds a
// durable consumer, and starts the message handler. On any failure it returns
// nil + an error; main.go logs and continues without the bridge — Content's
// DB row is still the source of truth, so backfill is possible later.
func StartContentSubscriber(natsURL string, pool *pgxpool.Pool, logger *slog.Logger) (*ContentSubscriber, error) {
	conn, err := nats.Connect(natsURL, nats.Timeout(2*time.Second))
	if err != nil {
		return nil, err
	}
	js, err := jetstream.New(conn)
	if err != nil {
		_ = conn.Drain()
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	stream, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      ContentStreamName,
		Subjects:  []string{"content.>"},
		Storage:   jetstream.FileStorage,
		Retention: jetstream.LimitsPolicy,
		Replicas:  1,
	})
	if err != nil {
		_ = conn.Drain()
		return nil, err
	}

	cons, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       contentDurable,
		FilterSubject: SubjectContentQuestionPublished,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       60 * time.Second,
		MaxDeliver:    5,
	})
	if err != nil {
		_ = conn.Drain()
		return nil, err
	}

	sub := &ContentSubscriber{pool: pool, conn: conn, logger: logger}
	consCtx, err := cons.Consume(sub.handle)
	if err != nil {
		_ = conn.Drain()
		return nil, err
	}
	sub.consCtx = consCtx
	logger.Info("quiz subscribed to content.question.published", "stream", ContentStreamName, "durable", contentDurable)

	transCons, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       contentTranslationDurable,
		FilterSubject: SubjectContentTranslationPublished,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       60 * time.Second,
		MaxDeliver:    5,
	})
	if err != nil {
		_ = conn.Drain()
		return nil, err
	}
	transConsCtx, err := transCons.Consume(sub.handleTranslation)
	if err != nil {
		_ = conn.Drain()
		return nil, err
	}
	sub.transConsCtx = transConsCtx
	logger.Info("quiz subscribed to content.translation.published", "stream", ContentStreamName, "durable", contentTranslationDurable)

	return sub, nil
}

func (s *ContentSubscriber) Close() error {
	if s.consCtx != nil {
		s.consCtx.Stop()
	}
	if s.transConsCtx != nil {
		s.transConsCtx.Stop()
	}
	if s.conn != nil {
		return s.conn.Drain()
	}
	return nil
}

func (s *ContentSubscriber) handleTranslation(msg jetstream.Msg) {
	var ev TranslationPublished
	if err := json.Unmarshal(msg.Data(), &ev); err != nil {
		s.logger.Error("translation.unmarshal", "err", err)
		_ = msg.Ack() // poison message: drop
		return
	}
	if ev.QuestionID == "" || ev.Language == "" {
		_ = msg.Ack()
		return
	}
	var choicesJSON []byte
	if ev.Choices != nil {
		choicesJSON, _ = json.Marshal(ev.Choices)
	}
	var payloadArg any
	if len(ev.Payload) > 0 {
		payloadArg = []byte(ev.Payload)
	}
	ctx := context.Background()
	_, err := s.pool.Exec(ctx, `
		INSERT INTO quiz_schema.question_translations
		  (question_id, language, stem, choices, explanation, payload, version, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7, now())
		ON CONFLICT (question_id, language) DO UPDATE SET
		  stem = EXCLUDED.stem,
		  choices = EXCLUDED.choices,
		  explanation = EXCLUDED.explanation,
		  payload = EXCLUDED.payload,
		  version = EXCLUDED.version,
		  updated_at = now()
		WHERE EXCLUDED.version >= quiz_schema.question_translations.version
	`, ev.QuestionID, ev.Language, ev.Stem, choicesJSON, ev.Explanation, payloadArg, ev.Version)
	if err != nil {
		s.logger.Error("translation.upsert", "err", err, "qid", ev.QuestionID)
		_ = msg.Nak()
		return
	}
	_ = msg.Ack()
}

func (s *ContentSubscriber) handle(msg jetstream.Msg) {
	var ev QuestionPublished
	if err := json.Unmarshal(msg.Data(), &ev); err != nil {
		s.logger.Warn("content.question.published bad payload", "err", err)
		// Poison-pill — never redeliver malformed.
		_ = msg.Term()
		return
	}
	if ev.ID == "" || ev.TopicID == "" || ev.Stem == "" || len(ev.Choices) < 2 {
		s.logger.Warn("content.question.published missing fields", "id", ev.ID)
		_ = msg.Term()
		return
	}

	choicesJSON, err := json.Marshal(ev.Choices)
	if err != nil {
		s.logger.Warn("content.question.published choices marshal", "err", err)
		_ = msg.Term()
		return
	}
	lang := ev.Language
	if lang == "" {
		lang = "en"
	}
	// Sprint 4: a/c land in the payload as floats. Pre-Sprint-4 emitters omit
	// them — fall back to neutral defaults (matches the column defaults).
	a := float32(1.0)
	if ev.DiscriminationA != nil {
		a = *ev.DiscriminationA
	}
	c := float32(0.0)
	if ev.GuessingC != nil {
		c = *ev.GuessingC
	}
	// Phase 5 (P5-S38): default to MCQ_SINGLE when publisher omits the field
	// (preserves backward compat with pre-S38 in-flight events).
	qtype := "MCQ_SINGLE"
	if ev.QuestionType != nil && *ev.QuestionType != "" {
		qtype = *ev.QuestionType
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Idempotent upsert — same question id may arrive twice under at-least-once.
	// status is forced to PUBLISHED here; Content already gated on its own FSM.
	// Cast nil RawMessage to nil interface so pgx writes SQL NULL
	// rather than an empty bytea — column is nullable jsonb.
	var payloadArg any = ev.Payload
	if len(ev.Payload) == 0 {
		payloadArg = nil
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO quiz_schema.questions
		  (id, topic_id, stem, choices, correct_idx, difficulty_b,
		   discrimination_a, guessing_c, language, status, explanation,
		   pyq_flag, exam_year, paper_session, question_type, payload)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PUBLISHED', $10,
		        $11, $12, $13, $14, $15)
		ON CONFLICT (id) DO UPDATE SET
		  stem = EXCLUDED.stem,
		  choices = EXCLUDED.choices,
		  correct_idx = EXCLUDED.correct_idx,
		  difficulty_b = EXCLUDED.difficulty_b,
		  discrimination_a = EXCLUDED.discrimination_a,
		  guessing_c = EXCLUDED.guessing_c,
		  language = EXCLUDED.language,
		  explanation = EXCLUDED.explanation,
		  status = 'PUBLISHED',
		  pyq_flag = EXCLUDED.pyq_flag,
		  exam_year = EXCLUDED.exam_year,
		  paper_session = EXCLUDED.paper_session,
		  question_type = EXCLUDED.question_type,
		  payload = EXCLUDED.payload
	`, ev.ID, ev.TopicID, ev.Stem, choicesJSON, ev.CorrectIdx, ev.DifficultyB, a, c, lang, ev.Explanation,
		ev.PyqFlag, ev.ExamYear, ev.PaperSession, qtype, payloadArg)

	if err != nil {
		s.logger.Warn("content.question.published upsert failed", "id", ev.ID, "err", err)
		// Infra failure — nak so JetStream retries with backoff. MaxDeliver caps it.
		if nakErr := msg.NakWithDelay(5 * time.Second); nakErr != nil &&
			!errors.Is(nakErr, nats.ErrConnectionClosed) &&
			!strings.Contains(nakErr.Error(), "msg is no longer valid") {
			s.logger.Warn("content.question.published nak failed", "err", nakErr)
		}
		return
	}

	if err := msg.Ack(); err != nil {
		s.logger.Warn("content.question.published ack failed", "id", ev.ID, "err", err)
	}
	s.logger.Info("quiz mirrored content question", "id", ev.ID, "topic_id", ev.TopicID)
}
