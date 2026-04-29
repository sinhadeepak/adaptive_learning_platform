// Sprint 25 (P4-S25) — handler-side tests for the mode-filter passthrough
// on GET /quiz/sessions.
//
// Full integration coverage (real DB rows + mode filter SQL) is deferred to
// the Postgres-backed sessions_pg_test.go suite; these tests verify the
// handler argument-routing without standing up a database.

package server

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestListSessions_400OnMissingUserId(t *testing.T) {
	svc := &SessionService{}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/quiz/sessions", nil)
	svc.ListSessions(slog.Default())(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "missing_field") {
		t.Fatalf("expected missing_field code, got %s", rr.Body.String())
	}
}

func TestListSessions_400OnInvalidUserId(t *testing.T) {
	svc := &SessionService{}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodGet,
		"/quiz/sessions?userId=not-a-uuid&mode=MOCK_BLUEPRINT",
		nil,
	)
	svc.ListSessions(slog.Default())(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "invalid_user_id") {
		t.Fatalf("expected invalid_user_id, got %s", rr.Body.String())
	}
}
