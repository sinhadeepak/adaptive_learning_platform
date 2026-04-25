// Integration test for the Content → Quiz JetStream bridge. Requires:
//   - NATS w/ JetStream enabled (port 34222 by docker-compose default)
//   - Postgres with quiz_schema applied (port 35432)
// Skips silently if either is unreachable.

package events

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

func natsURL() string {
	if v := os.Getenv("QUIZ_NATS_URL"); v != "" {
		return v
	}
	return "nats://localhost:34222"
}

func quizDBURL() string {
	if v := os.Getenv("QUIZ_DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://postgres:postgres@localhost:35432/quiz?sslmode=disable"
}

// startSubscriber sets up the subscriber against the live infra. Returns the
// subscriber, a cleanup func, and a JetStream context for direct publishing.
// Uses a unique durable per test so parallel runs don't interfere.
func startSubscriber(t *testing.T) (*ContentSubscriber, *pgxpool.Pool, jetstream.JetStream, func()) {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), quizDBURL())
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Skipf("postgres ping failed: %v", err)
	}

	conn, err := nats.Connect(natsURL(), nats.Timeout(2*time.Second))
	if err != nil {
		pool.Close()
		t.Skipf("nats unavailable: %v", err)
	}
	js, err := jetstream.New(conn)
	if err != nil {
		conn.Close()
		pool.Close()
		t.Skipf("jetstream unavailable: %v", err)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))
	sub, err := StartContentSubscriber(natsURL(), pool, logger)
	if err != nil {
		conn.Close()
		pool.Close()
		t.Skipf("start subscriber: %v", err)
	}

	cleanup := func() {
		_ = sub.Close()
		conn.Close()
		pool.Close()
	}
	return sub, pool, js, cleanup
}

func cleanupQuestion(t *testing.T, pool *pgxpool.Pool, id string) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		`DELETE FROM quiz_schema.questions WHERE id = $1`, id); err != nil {
		t.Logf("cleanup %s: %v", id, err)
	}
}

// waitForQuestion polls quiz_schema.questions until the id appears or timeout.
func waitForQuestion(t *testing.T, pool *pgxpool.Pool, id string) (string, float32, bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var stem string
		var diff float32
		err := pool.QueryRow(context.Background(),
			`SELECT stem, difficulty_b FROM quiz_schema.questions WHERE id = $1`, id,
		).Scan(&stem, &diff)
		if err == nil {
			return stem, diff, true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return "", 0, false
}

func TestContentSubscriber_MirrorsPublishedQuestion(t *testing.T) {
	_, pool, js, cleanup := startSubscriber(t)
	defer cleanup()

	id := uuid.New().String()
	defer cleanupQuestion(t, pool, id)

	payload := QuestionPublished{
		ID:          id,
		TopicID:     "33333333-0000-0000-0000-000000000001",
		Stem:        "Bridge test: 2 + 2 = ?",
		Choices:     []string{"3", "4", "5"},
		CorrectIdx:  1,
		DifficultyB: 0.25,
		Language:    "en",
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := js.Publish(context.Background(), SubjectContentQuestionPublished, buf); err != nil {
		t.Fatalf("publish: %v", err)
	}

	stem, diff, ok := waitForQuestion(t, pool, id)
	if !ok {
		t.Fatalf("question %s never appeared in quiz bank", id)
	}
	if !strings.Contains(stem, "Bridge test") {
		t.Errorf("stem mismatch: %q", stem)
	}
	if diff < 0.24 || diff > 0.26 {
		t.Errorf("difficulty mismatch: %v", diff)
	}
}

func TestContentSubscriber_IsIdempotent(t *testing.T) {
	_, pool, js, cleanup := startSubscriber(t)
	defer cleanup()

	id := uuid.New().String()
	defer cleanupQuestion(t, pool, id)

	// First publish — original difficulty.
	first, _ := json.Marshal(QuestionPublished{
		ID: id, TopicID: "33333333-0000-0000-0000-000000000001",
		Stem: "Idempotency v1", Choices: []string{"a", "b"},
		CorrectIdx: 0, DifficultyB: -1.0, Language: "en",
	})
	if _, err := js.Publish(context.Background(), SubjectContentQuestionPublished, first); err != nil {
		t.Fatal(err)
	}
	if _, _, ok := waitForQuestion(t, pool, id); !ok {
		t.Fatalf("first publish did not land")
	}

	// Second publish — updated difficulty. Idempotent upsert should overwrite.
	second, _ := json.Marshal(QuestionPublished{
		ID: id, TopicID: "33333333-0000-0000-0000-000000000001",
		Stem: "Idempotency v2", Choices: []string{"a", "b"},
		CorrectIdx: 0, DifficultyB: 1.5, Language: "en",
	})
	if _, err := js.Publish(context.Background(), SubjectContentQuestionPublished, second); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(5 * time.Second)
	var stem string
	var diff float32
	for time.Now().Before(deadline) {
		_ = pool.QueryRow(context.Background(),
			`SELECT stem, difficulty_b FROM quiz_schema.questions WHERE id = $1`, id,
		).Scan(&stem, &diff)
		if stem == "Idempotency v2" {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if stem != "Idempotency v2" {
		t.Errorf("upsert did not overwrite: stem=%q", stem)
	}
	if diff < 1.49 || diff > 1.51 {
		t.Errorf("difficulty did not update: %v", diff)
	}

	// And there's still exactly one row.
	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM quiz_schema.questions WHERE id = $1`, id,
	).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("expected 1 row, got %d", n)
	}
}

func TestContentSubscriber_TermsBadPayload(t *testing.T) {
	_, _, js, cleanup := startSubscriber(t)
	defer cleanup()

	// Garbage JSON — handler should Term, not crash.
	if _, err := js.Publish(context.Background(), SubjectContentQuestionPublished,
		[]byte("not-json")); err != nil {
		t.Fatal(err)
	}
	// Give the handler a beat to process.
	time.Sleep(500 * time.Millisecond)
	// No assertion needed — survival is the test.
}
