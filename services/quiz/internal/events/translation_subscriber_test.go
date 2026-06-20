// Integration test for the content.translation.published → quiz_schema.question_translations bridge.
// Reuses the startSubscriber helper from content_subscriber_test.go.

package events

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestContentSubscriber_MirrorsPublishedTranslation(t *testing.T) {
	_, pool, js, cleanup := startSubscriber(t) // reuse helper from content_subscriber_test.go
	defer cleanup()

	qid := uuid.New().String()
	defer func() {
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM quiz_schema.question_translations WHERE question_id=$1`, qid)
	}()

	ev := TranslationPublished{
		QuestionID:  qid,
		Language:    "hi",
		Stem:        strPtr("HI stem"),
		Choices:     []string{"क", "ख"},
		Explanation: strPtr("व्याख्या"),
		Version:     3,
	}
	buf, _ := json.Marshal(ev)
	if _, err := js.Publish(context.Background(), SubjectContentTranslationPublished, buf); err != nil {
		t.Fatalf("publish: %v", err)
	}

	// poll question_translations for the row
	var stem string
	ok := false
	for i := 0; i < 50; i++ {
		err := pool.QueryRow(context.Background(),
			`SELECT stem FROM quiz_schema.question_translations WHERE question_id=$1 AND language='hi'`, qid).Scan(&stem)
		if err == nil {
			ok = true
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !ok || stem != "HI stem" {
		t.Fatalf("translation row not mirrored (ok=%v stem=%q)", ok, stem)
	}
}

func strPtr(s string) *string { return &s }
