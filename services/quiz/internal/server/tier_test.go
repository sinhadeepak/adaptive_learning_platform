// Sprint 8 R-3 — tier gate unit tests.
//
// Two layers covered here:
//  1. roleFromBearer — pure JWT decode/verify, no HTTP.
//  2. canStartMockMode — pure-logic role policy.
//
// The full Start handler integration (gate firing 403 for STUDENT) is
// covered in sessions_pg_test.go alongside the rest of the start flow.
package server

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-32-bytes-or-more-pls-thanks"

func issueRoleToken(t *testing.T, role string) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  "00000000-0000-0000-0000-000000000001",
		"role": role,
		"exp":  time.Now().Add(10 * time.Minute).Unix(),
	})
	s, err := tok.SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return s
}

func TestRoleFromBearer_Valid(t *testing.T) {
	tok := issueRoleToken(t, "STUDENT_PREMIUM")
	got := roleFromBearer("Bearer "+tok, testSecret)
	if got != "STUDENT_PREMIUM" {
		t.Fatalf("expected STUDENT_PREMIUM, got %q", got)
	}
}

func TestRoleFromBearer_LowerCaseScheme(t *testing.T) {
	// RFC 7235 says auth-scheme is case-insensitive; mobile sometimes sends
	// "bearer ".
	tok := issueRoleToken(t, "STUDENT")
	if got := roleFromBearer("bearer "+tok, testSecret); got != "STUDENT" {
		t.Fatalf("expected STUDENT, got %q", got)
	}
}

func TestRoleFromBearer_MissingHeader(t *testing.T) {
	if got := roleFromBearer("", testSecret); got != "" {
		t.Fatalf("expected empty for missing header, got %q", got)
	}
}

func TestRoleFromBearer_BadScheme(t *testing.T) {
	if got := roleFromBearer("Basic dXNlcjpwYXNz", testSecret); got != "" {
		t.Fatalf("expected empty for non-Bearer scheme, got %q", got)
	}
}

func TestRoleFromBearer_BadSignature(t *testing.T) {
	tok := issueRoleToken(t, "STUDENT_PREMIUM")
	// Verify with the wrong secret → must reject.
	if got := roleFromBearer("Bearer "+tok, "different-secret-totally"); got != "" {
		t.Fatalf("expected empty for tampered token, got %q", got)
	}
}

func TestRoleFromBearer_ExpiredToken(t *testing.T) {
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"role": "STUDENT_PREMIUM",
		"exp":  time.Now().Add(-1 * time.Hour).Unix(),
	})
	s, err := tok.SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if got := roleFromBearer("Bearer "+s, testSecret); got != "" {
		t.Fatalf("expected empty for expired token, got %q", got)
	}
}

func TestRoleFromBearer_GarbageToken(t *testing.T) {
	if got := roleFromBearer("Bearer not-a-jwt-at-all", testSecret); got != "" {
		t.Fatalf("expected empty for garbage token, got %q", got)
	}
}

func TestCanStartMockMode(t *testing.T) {
	cases := map[string]bool{
		"":                  false, // anonymous
		"STUDENT":           false, // free tier
		"STUDENT_PREMIUM":   true,
		"TEACHER":           true,
		"EXPERT":            true,
		"MODERATOR":         true,
		"INSTITUTION_ADMIN": true,
		"PLATFORM_ADMIN":    true,
	}
	for role, want := range cases {
		if got := canStartMockMode(role); got != want {
			t.Errorf("canStartMockMode(%q) = %v, want %v", role, got, want)
		}
	}
}
