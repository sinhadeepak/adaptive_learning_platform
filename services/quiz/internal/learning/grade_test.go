// Phase 5 (P5-S38) — GradeRemote unit tests against an httptest server.
package learning

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGradeRemoteHappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/grading/grade" {
			t.Errorf("expected /grading/grade, got %s", r.URL.Path)
		}
		var req GradeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode failed: %v", err)
		}
		if req.QuestionType != "NUMERIC_INTEGER" {
			t.Errorf("expected NUMERIC_INTEGER, got %s", req.QuestionType)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Resolution{
			QuestionID:     req.QuestionID,
			TypeID:         req.QuestionType,
			Status:         "CORRECT",
			MatchedCount:   1,
			TotalCount:     1,
			EvaluationMode: "DETERMINISTIC",
		})
	}))
	defer srv.Close()

	c := New(srv.URL)
	res, err := c.GradeRemote(
		context.Background(),
		"",
		"q1",
		"NUMERIC_INTEGER",
		map[string]interface{}{"stem": "5+5=?", "correct": 10},
		map[string]interface{}{"answer": 10},
		"en",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Status != "CORRECT" {
		t.Errorf("expected CORRECT, got %s", res.Status)
	}
}

func TestGradeRemoteServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := New(srv.URL)
	_, err := c.GradeRemote(
		context.Background(),
		"",
		"q1",
		"NUMERIC_INTEGER",
		map[string]interface{}{},
		map[string]interface{}{"answer": 10},
		"en",
	)
	if err == nil {
		t.Fatalf("expected error on 500 response")
	}
}

func TestGradeRemoteForwardsBearer(t *testing.T) {
	gotAuth := ""
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Resolution{
			Status: "INCORRECT", MatchedCount: 0, TotalCount: 1,
		})
	}))
	defer srv.Close()

	c := New(srv.URL)
	_, err := c.GradeRemote(
		context.Background(),
		"my-test-token",
		"q1",
		"NUMERIC_INTEGER",
		map[string]interface{}{},
		map[string]interface{}{"answer": 0},
		"en",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotAuth != "Bearer my-test-token" {
		t.Errorf("expected bearer to be forwarded, got %q", gotAuth)
	}
}
