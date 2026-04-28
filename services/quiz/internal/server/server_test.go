package server

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/adaptive-learn/quiz/internal/domain"
)

// stubFlags returns a fixed value for `irt_model_enabled` and an error otherwise —
// keeps tests insulated from the real Institution + NATS.
type stubFlags struct {
	irtEnabled bool
}

func (s stubFlags) Evaluate(_ context.Context, flag, _ string) (bool, error) {
	if flag == "irt_model_enabled" {
		return s.irtEnabled, nil
	}
	return false, nil
}

func newTestSrv(t *testing.T, flags FlagEvaluator) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(Router(slog.New(slog.NewJSONHandler(os.Stdout, nil)), nil, flags))
	t.Cleanup(srv.Close)
	return srv
}

// legacyResp mirrors the Sprint 1 /quiz/sessions/start response when no
// SessionService is wired (used by these unit tests until they migrate to a
// real Postgres-backed integration test in sessions_pg_test.go).
type legacyResp struct {
	SessionID string `json:"sessionId"`
	Strategy  string `json:"strategy"`
}

func TestHealthReturnsOK(t *testing.T) {
	srv := newTestSrv(t, nil)

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["status"] != "ok" || body["service"] != "quiz" {
		t.Fatalf("unexpected body: %v", body)
	}
}

func TestReadyReturnsReady(t *testing.T) {
	srv := newTestSrv(t, nil)

	resp, err := http.Get(srv.URL + "/ready")
	if err != nil {
		t.Fatalf("GET /ready failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}
}

func TestStartSession_BinarySearchWhenIRTOff(t *testing.T) {
	srv := newTestSrv(t, stubFlags{irtEnabled: false})

	resp, err := http.Post(srv.URL+"/quiz/sessions/start", "application/json",
		bytes.NewReader([]byte(`{"topicId":"t1","userId":"u1"}`)))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("want 201, got %d", resp.StatusCode)
	}

	var body legacyResp
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Strategy != "binary_search" {
		t.Errorf("want strategy=binary_search, got %q", body.Strategy)
	}
	if body.SessionID == "" {
		t.Errorf("expected sessionId, got empty")
	}
}

func TestStartSession_IRTWhenFlagOn(t *testing.T) {
	srv := newTestSrv(t, stubFlags{irtEnabled: true})

	resp, err := http.Post(srv.URL+"/quiz/sessions/start", "application/json",
		bytes.NewReader([]byte(`{"topicId":"t1","userId":"u1"}`)))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	var body legacyResp
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if body.Strategy != "irt" {
		t.Errorf("want strategy=irt, got %q", body.Strategy)
	}
}

func TestStartSession_BadRequest(t *testing.T) {
	srv := newTestSrv(t, stubFlags{})

	resp, err := http.Post(srv.URL+"/quiz/sessions/start", "application/json",
		bytes.NewReader([]byte(`{"topicId":"t1"}`)))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("want 400, got %d", resp.StatusCode)
	}
}

// Sprint 12 S12-D — pure constant check. The cross-service
// "from-assignment" creator (Quiz fetches the question list from
// Content) lands in Sprint 13; for now we just guard the constant so
// the FSM enum stays in sync between Quiz Go and Content's payload
// expectations. Live mode validation is exercised in sessions_pg_test.go
// via the SessionService path (this test file's newTestSrv helper
// intentionally exposes the legacy un-validated handler).
func TestModeAssignment_ConstantValue(t *testing.T) {
	if domain.ModeAssignment != "ASSIGNMENT" {
		t.Errorf("ModeAssignment = %q, want ASSIGNMENT", domain.ModeAssignment)
	}
}

func TestStartSession_NoFlagsClientFallsBackToBinarySearch(t *testing.T) {
	srv := newTestSrv(t, nil) // flags client unavailable
	resp, err := http.Post(srv.URL+"/quiz/sessions/start", "application/json",
		bytes.NewReader([]byte(`{"topicId":"t1","userId":"u1"}`)))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body legacyResp
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if body.Strategy != "binary_search" {
		t.Errorf("want strategy=binary_search, got %q", body.Strategy)
	}
}
