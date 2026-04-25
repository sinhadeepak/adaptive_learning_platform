// Integration tests for the SessionService against a real Postgres.
// Skipped when QUIZ_DATABASE_URL is unset (CI without DB).
//
// Each test wraps in a fresh session/topic so they don't bleed into each other,
// and cleans rows it created in t.Cleanup. The seeded question bank is shared.
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
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/adaptive-learn/quiz/internal/db"
	"github.com/adaptive-learn/quiz/internal/store"
)

const (
	mechanicsTopicID    = "33333333-0000-0000-0000-000000000001"
	thermodynamicsTopic = "33333333-0000-0000-0000-000000000002"
	emptyTopicID        = "55555555-0000-0000-0000-000000000099" // not seeded
)

// pgFixture spins up an httptest server backed by the real Postgres pool.
// Returns nil if QUIZ_DATABASE_URL isn't set.
type pgFixture struct {
	srv      *httptest.Server
	svc      *SessionService
	st       *store.Store
	closeAll func()
}

func newPGFixture(t *testing.T, flags FlagEvaluator) *pgFixture {
	t.Helper()
	url := os.Getenv("QUIZ_DATABASE_URL")
	if url == "" {
		url = "postgres://postgres:postgres@localhost:35432/quiz?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url)
	if err != nil {
		t.Skipf("postgres unavailable (%s) — skipping integration test: %v", url, err)
		return nil
	}
	st := store.New(pool)
	svc := NewSessionService(st, flags, nil, 90*time.Minute)
	srv := httptest.NewServer(Router(slog.New(slog.NewJSONHandler(os.Stdout, nil)), svc, flags))
	closeAll := func() {
		srv.Close()
		pool.Close()
	}
	t.Cleanup(closeAll)
	return &pgFixture{srv: srv, svc: svc, st: st, closeAll: closeAll}
}

// truncateSession removes any rows created by a single test (sessions cascade
// to items via FK).
func (f *pgFixture) cleanupSession(t *testing.T, sessionID string) {
	t.Helper()
	if sessionID == "" {
		return
	}
	_, _ = f.st.Pool().Exec(context.Background(),
		`DELETE FROM quiz_schema.quiz_sessions WHERE id = $1`, sessionID)
}

// startSession is a helper that POSTs /quiz/sessions/start and returns the
// decoded response body and session id.
func startSession(t *testing.T, srv *httptest.Server, body []byte) startResponse {
	t.Helper()
	resp, err := http.Post(srv.URL+"/quiz/sessions/start", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		buf := new(bytes.Buffer)
		_, _ = buf.ReadFrom(resp.Body)
		t.Fatalf("start: want 201, got %d body=%s", resp.StatusCode, buf.String())
	}
	var out startResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode start: %v", err)
	}
	return out
}

func TestPG_FullSessionRoundTrip(t *testing.T) {
	f := newPGFixture(t, stubFlags{irtEnabled: false})
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q,"mode":"PRACTICE"}`,
		mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })

	if started.Strategy != "binary_search" {
		t.Errorf("want strategy=binary_search, got %q", started.Strategy)
	}
	if started.Status != "IN_PROGRESS" {
		t.Errorf("want status=IN_PROGRESS, got %q", started.Status)
	}
	if started.ExpiresAt.IsZero() {
		t.Errorf("expected non-zero expiresAt")
	}

	// Walk through 5 questions; alternate correct/wrong to cover both branches.
	for i := 0; i < 5; i++ {
		next := getNext(t, f.srv, started.SessionID)
		if next.Item == nil {
			t.Fatalf("step %d: expected item, got done=%v status=%s", i, next.Done, next.Status)
		}
		if next.Item.ItemIdx != int16(i) {
			t.Errorf("step %d: expected itemIdx=%d, got %d", i, i, next.Item.ItemIdx)
		}
		// Pick a deterministic answer: index 0 for even steps, 3 for odd
		ans := int16(0)
		if i%2 == 1 {
			ans = 3
		}
		_ = postAnswer(t, f.srv, started.SessionID, next.Item.ItemIdx, ans)
	}

	// Submit
	resp, err := http.Post(f.srv.URL+"/quiz/sessions/"+started.SessionID+"/submit",
		"application/json", bytes.NewReader([]byte(`{}`)))
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("submit: want 200, got %d", resp.StatusCode)
	}
	var sr submitResponse
	_ = json.NewDecoder(resp.Body).Decode(&sr)
	if sr.Status != "SUBMITTED" {
		t.Errorf("want status SUBMITTED, got %q", sr.Status)
	}
	if sr.ServedCount != 5 {
		t.Errorf("want servedCount=5, got %d", sr.ServedCount)
	}

	// /next on a SUBMITTED session must 409.
	r, err := http.Get(f.srv.URL + "/quiz/sessions/" + started.SessionID + "/next")
	if err != nil {
		t.Fatalf("next-after-submit: %v", err)
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusConflict {
		t.Errorf("next after submit: want 409, got %d", r.StatusCode)
	}
}

func TestPG_NextResumesUnansweredItem(t *testing.T) {
	f := newPGFixture(t, stubFlags{})
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q}`, mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })

	first := getNext(t, f.srv, started.SessionID)
	if first.Item == nil {
		t.Fatalf("first /next returned no item: %+v", first)
	}
	// Call /next again WITHOUT answering; same item must be returned (resume).
	again := getNext(t, f.srv, started.SessionID)
	if again.Item == nil {
		t.Fatalf("second /next returned no item")
	}
	if again.Item.ItemIdx != first.Item.ItemIdx {
		t.Errorf("expected same itemIdx on resume; first=%d second=%d",
			first.Item.ItemIdx, again.Item.ItemIdx)
	}
	if again.Item.QuestionID != first.Item.QuestionID {
		t.Errorf("expected same questionId on resume")
	}
}

func TestPG_AnswerIsIdempotent(t *testing.T) {
	f := newPGFixture(t, stubFlags{})
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q}`, mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })

	first := getNext(t, f.srv, started.SessionID)
	if first.Item == nil {
		t.Fatal("expected item")
	}
	// Submit answerIdx=0 twice; both should succeed and return the SAME isCorrect.
	a1 := postAnswer(t, f.srv, started.SessionID, first.Item.ItemIdx, 0)
	a2 := postAnswer(t, f.srv, started.SessionID, first.Item.ItemIdx, 0)
	if a1.IsCorrect != a2.IsCorrect {
		t.Errorf("idempotent same-answer should match: a1=%+v a2=%+v", a1, a2)
	}
	if a1.ServedCount != a2.ServedCount {
		t.Errorf("served_count must not change on duplicate: a1=%d a2=%d", a1.ServedCount, a2.ServedCount)
	}
	// Re-submit with a DIFFERENT answer index; first-write wins, so isCorrect must stay.
	a3 := postAnswer(t, f.srv, started.SessionID, first.Item.ItemIdx, 1)
	if a3.IsCorrect != a1.IsCorrect {
		t.Errorf("first-write wins: a3=%+v a1=%+v", a3, a1)
	}
	if a3.CorrectCount != a1.CorrectCount {
		t.Errorf("correct_count must not change on duplicate (different answer): a3=%d a1=%d",
			a3.CorrectCount, a1.CorrectCount)
	}
}

func TestPG_StrategyRoutingFlagOn(t *testing.T) {
	f := newPGFixture(t, stubFlags{irtEnabled: true})
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q}`, mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })
	if started.Strategy != "irt" {
		t.Errorf("want strategy=irt, got %q", started.Strategy)
	}
}

func TestPG_EmptyTopicIs422(t *testing.T) {
	f := newPGFixture(t, stubFlags{})
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q}`, emptyTopicID, uuid.New().String()))
	resp, err := http.Post(f.srv.URL+"/quiz/sessions/start", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("want 422 on empty topic, got %d", resp.StatusCode)
	}
}

func TestPG_ExpiredSessionRejectsNext(t *testing.T) {
	url := os.Getenv("QUIZ_DATABASE_URL")
	if url == "" {
		url = "postgres://postgres:postgres@localhost:35432/quiz?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url)
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
		return
	}
	t.Cleanup(pool.Close)
	st := store.New(pool)
	// 1 ns TTL — session is born expired.
	svc := NewSessionService(st, stubFlags{}, nil, 1*time.Nanosecond)
	srv := httptest.NewServer(Router(slog.New(slog.NewJSONHandler(os.Stdout, nil)), svc, stubFlags{}))
	t.Cleanup(srv.Close)

	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q}`, mechanicsTopicID, uuid.New().String()))
	started := startSession(t, srv, body)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM quiz_schema.quiz_sessions WHERE id = $1`, started.SessionID)
	})
	// Sleep so the session is past its expiresAt regardless of clock skew.
	time.Sleep(10 * time.Millisecond)

	r, err := http.Get(srv.URL + "/quiz/sessions/" + started.SessionID + "/next")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusConflict {
		t.Errorf("expired /next: want 409, got %d", r.StatusCode)
	}
	// And the GET endpoint should report status=EXPIRED.
	r2, err := http.Get(srv.URL + "/quiz/sessions/" + started.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	defer r2.Body.Close()
	var sr sessionResponse
	_ = json.NewDecoder(r2.Body).Decode(&sr)
	if sr.Status != "EXPIRED" {
		t.Errorf("want status=EXPIRED, got %q", sr.Status)
	}
}

func TestPG_MockModeOrdersByDifficulty(t *testing.T) {
	f := newPGFixture(t, stubFlags{})
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q,"mode":"MOCK"}`,
		thermodynamicsTopic, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })

	// First 3 questions in MOCK mode must come back in ascending difficulty.
	prev := float32(-99)
	for i := 0; i < 3; i++ {
		nx := getNext(t, f.srv, started.SessionID)
		if nx.Item == nil {
			t.Fatalf("step %d: no item", i)
		}
		// Look up difficulty via a direct store call.
		qid, _ := uuid.Parse(nx.Item.QuestionID)
		q, err := f.st.GetQuestion(context.Background(), qid)
		if err != nil {
			t.Fatalf("step %d: get question: %v", i, err)
		}
		if q.DifficultyB < prev {
			t.Errorf("step %d: difficulty regressed prev=%v this=%v", i, prev, q.DifficultyB)
		}
		prev = q.DifficultyB
		_ = postAnswer(t, f.srv, started.SessionID, nx.Item.ItemIdx, 0)
	}
}

func TestPG_GetSessionUnknownIs404(t *testing.T) {
	f := newPGFixture(t, stubFlags{})
	if f == nil {
		return
	}
	r, err := http.Get(f.srv.URL + "/quiz/sessions/" + uuid.New().String())
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusNotFound {
		t.Errorf("want 404 on unknown session, got %d", r.StatusCode)
	}
}

// --- helpers --------------------------------------------------------------

func getNext(t *testing.T, srv *httptest.Server, sessionID string) nextResponse {
	t.Helper()
	r, err := http.Get(srv.URL + "/quiz/sessions/" + sessionID + "/next")
	if err != nil {
		t.Fatalf("next: %v", err)
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		buf := new(bytes.Buffer)
		_, _ = buf.ReadFrom(r.Body)
		t.Fatalf("next: want 200, got %d body=%s", r.StatusCode, buf.String())
	}
	var nx nextResponse
	if err := json.NewDecoder(r.Body).Decode(&nx); err != nil {
		t.Fatalf("decode next: %v", err)
	}
	return nx
}

func postAnswer(t *testing.T, srv *httptest.Server, sessionID string, itemIdx, answerIdx int16) answerResponse {
	t.Helper()
	body := []byte(fmt.Sprintf(`{"itemIdx":%d,"answerIdx":%d}`, itemIdx, answerIdx))
	r, err := http.Post(srv.URL+"/quiz/sessions/"+sessionID+"/answers", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("answer: %v", err)
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		buf := new(bytes.Buffer)
		_, _ = buf.ReadFrom(r.Body)
		t.Fatalf("answer: want 200, got %d body=%s", r.StatusCode, buf.String())
	}
	var ar answerResponse
	if err := json.NewDecoder(r.Body).Decode(&ar); err != nil {
		t.Fatalf("decode answer: %v", err)
	}
	return ar
}
