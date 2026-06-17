// Sprint 22 (P4-S22) — payload-shape tests for the SessionCompleted
// extension. The Items array is omitempty so pre-S22 consumers (which
// don't read it) keep working.

package events

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestSessionCompletedOmitsItemsWhenAbsent(t *testing.T) {
	ev := SessionCompleted{
		SessionID:   "sess-1",
		UserID:      "user-1",
		TopicID:     "topic-1",
		Mode:        "PRACTICE",
		Strategy:    "irt",
		ServedCount: 5,
		SubmittedAt: time.Now(),
		TS:          time.Now(),
	}
	buf, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if strings.Contains(string(buf), `"items"`) {
		t.Errorf("expected items to be omitted when nil, got: %s", buf)
	}
}

func TestSessionCompletedIncludesItemsWhenPresent(t *testing.T) {
	ev := SessionCompleted{
		SessionID:   "sess-1",
		UserID:      "user-1",
		TopicID:     "topic-1",
		Mode:        "PRACTICE",
		Strategy:    "irt",
		ServedCount: 2,
		SubmittedAt: time.Now(),
		TS:          time.Now(),
		Items: []SessionItemEvent{
			{ItemIdx: 0, QuestionID: "q-1", TopicID: "topic-1", IsCorrect: true, TimeSpentMs: 4500},
			{ItemIdx: 1, QuestionID: "q-2", TopicID: "topic-1", IsCorrect: false, TimeSpentMs: 8000},
		},
	}
	buf, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	s := string(buf)
	if !strings.Contains(s, `"items"`) {
		t.Errorf("expected items field, got: %s", s)
	}
	if !strings.Contains(s, `"time_spent_ms":4500`) {
		t.Errorf("expected per-item time_spent_ms, got: %s", s)
	}
	if !strings.Contains(s, `"is_correct":true`) {
		t.Errorf("expected per-item is_correct, got: %s", s)
	}
}

func TestSessionItemEventOmitsZeroTimeSpent(t *testing.T) {
	// Unanswered items have TimeSpentMs == 0. omitempty drops the field so
	// downstream consumers can distinguish "answered in 0ms" (impossible)
	// from "unanswered" (field absent).
	ev := SessionItemEvent{
		ItemIdx:    0,
		QuestionID: "q-1",
		TopicID:    "topic-1",
		IsCorrect:  false,
	}
	buf, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if strings.Contains(string(buf), `"time_spent_ms"`) {
		t.Errorf("expected time_spent_ms omitted when zero, got: %s", buf)
	}
}

func TestSessionItemEventOmitsEmptySectionID(t *testing.T) {
	ev := SessionItemEvent{
		ItemIdx:     0,
		QuestionID:  "q-1",
		TopicID:     "topic-1",
		IsCorrect:   true,
		TimeSpentMs: 1000,
	}
	buf, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if strings.Contains(string(buf), `"section_id"`) {
		t.Errorf("expected section_id omitted when empty, got: %s", buf)
	}
}
