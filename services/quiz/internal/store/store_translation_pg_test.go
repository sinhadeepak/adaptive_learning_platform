// Integration test for GetQuestion translation overlay.
// Requires QUIZ_DATABASE_URL (or the default local dev URL).
// Skipped when Postgres is unavailable.
package store

import (
	"context"
	"os"
	"testing"

	"github.com/adaptive-learn/quiz/internal/db"
	"github.com/google/uuid"
)

func TestPG_GetQuestion_OverlaysTranslation(t *testing.T) {
	url := os.Getenv("QUIZ_DATABASE_URL")
	if url == "" {
		url = "postgres://postgres:postgres@localhost:35432/quiz?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url)
	if err != nil {
		t.Skipf("postgres unavailable (%s) — skipping integration test: %v", url, err)
		return
	}
	t.Cleanup(func() { pool.Close() })
	st := New(pool)

	qid := uuid.New()
	// Use a fixed topic_id that exists in the seeded data.
	topicID := uuid.MustParse("33333333-0000-0000-0000-000000000001")
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM quiz_schema.question_translations WHERE question_id=$1`, qid)
		_, _ = pool.Exec(ctx, `DELETE FROM quiz_schema.questions WHERE id=$1`, qid)
	}()
	_, err = pool.Exec(ctx, `
		INSERT INTO quiz_schema.questions (id, topic_id, stem, choices, correct_idx, difficulty_b, language, status)
		VALUES ($1,$2,'EN stem','["a","b"]'::jsonb,0,0.0,'en','PUBLISHED')`, qid, topicID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO quiz_schema.question_translations (question_id, language, stem, choices, version)
		VALUES ($1,'hi','HI stem','["क","ख"]'::jsonb,1)`, qid)
	if err != nil {
		t.Fatal(err)
	}

	// hi → translated
	q, err := st.GetQuestion(ctx, qid, "hi")
	if err != nil {
		t.Fatal(err)
	}
	if q.Stem != "HI stem" || q.Choices[0] != "क" {
		t.Fatalf("want translated, got stem=%q choices=%v", q.Stem, q.Choices)
	}
	// en → canonical English
	qen, err := st.GetQuestion(ctx, qid, "en")
	if err != nil {
		t.Fatal(err)
	}
	if qen.Stem != "EN stem" {
		t.Fatalf("want EN stem, got %q", qen.Stem)
	}
	// unknown lang → English fallback
	qx, err := st.GetQuestion(ctx, qid, "zz")
	if err != nil {
		t.Fatal(err)
	}
	if qx.Stem != "EN stem" {
		t.Fatalf("want EN fallback, got %q", qx.Stem)
	}
}
