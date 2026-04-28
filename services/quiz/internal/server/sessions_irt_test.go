// Tests for the IRT routing branch of pickNext. These exercise the path that
// calls Adaptive Engine via a stub client; they need real Postgres for the
// session/question store but are still skipped when the DB is unavailable.
package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/adaptive-learn/quiz/internal/adaptive"
	"github.com/adaptive-learn/quiz/internal/db"
	"github.com/adaptive-learn/quiz/internal/store"
)

// stubAdaptive captures every call so tests can assert "was the engine asked?"
// and dictate what it returned. Concurrency-safe because httptest serves
// responses on multiple goroutines under -race.
type stubAdaptive struct {
	mu              sync.Mutex
	abilityCalls    []adaptive.AbilityRequest
	selectCalls     []adaptive.SelectNextRequest
	abilityResponse adaptive.AbilityResponse
	selectFn        func(req adaptive.SelectNextRequest) adaptive.SelectNextResponse
	abilityErr      error
	selectErr       error
}

func (s *stubAdaptive) Ability(_ context.Context, req adaptive.AbilityRequest) (adaptive.AbilityResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.abilityCalls = append(s.abilityCalls, req)
	if s.abilityErr != nil {
		return adaptive.AbilityResponse{}, s.abilityErr
	}
	return s.abilityResponse, nil
}

func (s *stubAdaptive) SelectNext(_ context.Context, req adaptive.SelectNextRequest) (adaptive.SelectNextResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.selectCalls = append(s.selectCalls, req)
	if s.selectErr != nil {
		return adaptive.SelectNextResponse{}, s.selectErr
	}
	if s.selectFn != nil {
		return s.selectFn(req), nil
	}
	// default: pick the first candidate
	if len(req.Candidates) > 0 {
		id := req.Candidates[0].ID
		return adaptive.SelectNextResponse{ItemID: &id, ThetaUsed: req.Theta}, nil
	}
	return adaptive.SelectNextResponse{}, nil
}

func newPGFixtureWithAdaptive(t *testing.T, flags FlagEvaluator, adapt adaptive.Client) (*pgFixture, *stubAdaptive) {
	t.Helper()
	url := os.Getenv("QUIZ_DATABASE_URL")
	if url == "" {
		url = "postgres://postgres:postgres@localhost:35432/quiz?sslmode=disable"
	}
	pool, err := db.New(context.Background(), url)
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
		return nil, nil
	}
	st := store.New(pool)
	svc := NewSessionService(st, flags, adapt, nil, 90*time.Minute)
	srv := httptest.NewServer(Router(slog.New(slog.NewJSONHandler(os.Stdout, nil)), svc, flags))
	t.Cleanup(func() {
		srv.Close()
		pool.Close()
	})
	stub, _ := adapt.(*stubAdaptive)
	return &pgFixture{srv: srv, svc: svc, st: st}, stub
}

func TestPG_IRT_ColdStartUsesLocalHeuristic(t *testing.T) {
	stub := &stubAdaptive{}
	f, _ := newPGFixtureWithAdaptive(t, stubFlags{irtEnabled: true}, stub)
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q}`,
		mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })

	if started.Strategy != "irt" {
		t.Fatalf("want strategy=irt, got %q", started.Strategy)
	}

	// First 3 calls (cold-start) MUST NOT hit Adaptive Engine.
	for i := 0; i < coldStartItems; i++ {
		nx := getNext(t, f.srv, started.SessionID)
		if nx.Item == nil {
			t.Fatalf("cold-start step %d: no item", i)
		}
		_ = postAnswer(t, f.srv, started.SessionID, nx.Item.ItemIdx, 0)
	}
	stub.mu.Lock()
	abilityCalls := len(stub.abilityCalls)
	selectCalls := len(stub.selectCalls)
	stub.mu.Unlock()
	if abilityCalls != 0 || selectCalls != 0 {
		t.Errorf("cold-start should not call Adaptive Engine; ability=%d select=%d", abilityCalls, selectCalls)
	}
}

func TestPG_IRT_PostColdStartCallsEngine(t *testing.T) {
	stub := &stubAdaptive{
		abilityResponse: adaptive.AbilityResponse{Theta: 0.7, SE: 0.5, N: 3},
	}
	f, _ := newPGFixtureWithAdaptive(t, stubFlags{irtEnabled: true}, stub)
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q}`,
		mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })

	for i := 0; i < coldStartItems; i++ {
		nx := getNext(t, f.srv, started.SessionID)
		_ = postAnswer(t, f.srv, started.SessionID, nx.Item.ItemIdx, 0)
	}
	// 4th /next must consult both Ability + SelectNext.
	nx := getNext(t, f.srv, started.SessionID)
	if nx.Item == nil {
		t.Fatal("expected 4th item")
	}
	stub.mu.Lock()
	defer stub.mu.Unlock()
	if len(stub.abilityCalls) != 1 {
		t.Errorf("want 1 ability call after cold-start, got %d", len(stub.abilityCalls))
	}
	if len(stub.selectCalls) != 1 {
		t.Errorf("want 1 select-next call, got %d", len(stub.selectCalls))
	}
	// Engine got the cold-start responses (3 answers).
	if got := len(stub.abilityCalls[0].Responses); got != 3 {
		t.Errorf("ability call should carry 3 responses, got %d", got)
	}
	// Theta passed to SelectNext is the value the engine returned, not the
	// session's stored ability_estimate.
	if stub.selectCalls[0].Theta != 0.7 {
		t.Errorf("want theta=0.7 passed to select, got %v", stub.selectCalls[0].Theta)
	}
}

func TestPG_IRT_EngineFailureFallsBackToLocalPick(t *testing.T) {
	stub := &stubAdaptive{selectErr: errStubFailure}
	f, _ := newPGFixtureWithAdaptive(t, stubFlags{irtEnabled: true}, stub)
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q}`,
		mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })

	for i := 0; i < coldStartItems; i++ {
		nx := getNext(t, f.srv, started.SessionID)
		_ = postAnswer(t, f.srv, started.SessionID, nx.Item.ItemIdx, 0)
	}
	// Engine errors; /next must still return an item via the local fallback.
	r, err := http.Get(f.srv.URL + "/quiz/sessions/" + started.SessionID + "/next")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		buf := new(bytes.Buffer)
		_, _ = buf.ReadFrom(r.Body)
		t.Fatalf("want 200 on engine fallback, got %d body=%s", r.StatusCode, buf.String())
	}
	var nx nextResponse
	_ = json.NewDecoder(r.Body).Decode(&nx)
	if nx.Item == nil {
		t.Errorf("expected fallback item, got done=%v", nx.Done)
	}
}

// errStubFailure is a sentinel for the engine-error test.
var errStubFailure = stubError("adaptive engine down")

type stubError string

func (e stubError) Error() string { return string(e) }
