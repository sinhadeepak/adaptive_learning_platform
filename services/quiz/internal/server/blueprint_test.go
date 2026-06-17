// Sprint 23 (P4-S23) — handler-wiring tests for StartFromBlueprint.
//
// These are pure HTTP handler tests; the Postgres-backed end-to-end happy
// path lives in the smoke test (extended in S23-G).

package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/adaptive-learn/quiz/internal/learning"
)

func TestStartFromBlueprint_503WhenLearningClientMissing(t *testing.T) {
	svc := &SessionService{} // no learningClient
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/quiz/sessions/from-blueprint",
		strings.NewReader(`{"blueprintId":"44444444-0000-0000-0000-000000000001","userId":"00000000-0000-0000-0000-000000000abc"}`))
	svc.StartFromBlueprint(slog.Default())(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestStartFromBlueprint_400OnMissingFields(t *testing.T) {
	// learningClient is non-nil so we get past the 503 gate, but the body
	// is missing both fields → 400.
	svc := &SessionService{learningClient: learning.New("http://unused")}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/quiz/sessions/from-blueprint",
		strings.NewReader(`{}`))
	svc.StartFromBlueprint(slog.Default())(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestStartFromBlueprint_400OnBadUUID(t *testing.T) {
	svc := &SessionService{learningClient: learning.New("http://unused")}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/quiz/sessions/from-blueprint",
		strings.NewReader(`{"blueprintId":"not-a-uuid","userId":"`+uuid.NewString()+`"}`))
	svc.StartFromBlueprint(slog.Default())(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	// Just confirm the error code path was hit.
	if !strings.Contains(rr.Body.String(), "invalid_blueprint_id") {
		t.Fatalf("expected invalid_blueprint_id, got %s", rr.Body.String())
	}
}

// Compile-time guard: confirm the learning.Client type exposes the
// FetchComposedPaper method with the expected signature. Doesn't run a
// real HTTP call.
func TestLearningClientSurface(t *testing.T) {
	c := learning.New("http://unused")
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	_, err := c.FetchComposedPaper(ctx, "", uuid.New(), uuid.New(), 0)
	if err == nil {
		t.Fatal("expected an error against an unreachable URL, got nil")
	}
	if errors.Is(err, learning.ErrBlueprintNotFound) {
		t.Fatal("expected non-404 against an unreachable URL")
	}
}
