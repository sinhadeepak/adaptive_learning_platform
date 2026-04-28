// Sprint 8 R-3 — MOCK-mode tier gate.
//
// Free students (role == STUDENT) get unlimited PRACTICE sessions but
// MOCK mode is reserved for STUDENT_PREMIUM. Non-student roles (TEACHER,
// MODERATOR, *_ADMIN) bypass the gate so internal tooling can keep
// running mock sims for content review.
//
// JWT is decoded but only the role claim is used here. The token is
// signed by Auth (HS256, shared secret); a tampered token fails verify
// and we treat the request as anonymous → free-tier rules apply.
package server

import (
	"errors"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// roleFromBearer extracts the role claim from an Authorization: Bearer
// header. Returns "" when the header is missing or the token is bad —
// callers must treat that as the free tier.
func roleFromBearer(authHeader, jwtSecret string) string {
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return ""
	}
	tokenStr := strings.TrimSpace(authHeader[len("bearer "):])
	if tokenStr == "" {
		return ""
	}
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(jwtSecret), nil
	})
	if err != nil || !tok.Valid {
		return ""
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return ""
	}
	role, _ := claims["role"].(string)
	return role
}

// canStartMockMode returns true when the bearer's role authorizes MOCK
// mode session creation. Non-student roles always bypass; STUDENT_PREMIUM
// passes; STUDENT and anonymous get rejected.
func canStartMockMode(role string) bool {
	if role == "" || role == "STUDENT" {
		return false
	}
	// STUDENT_PREMIUM, TEACHER, EXPERT, MODERATOR, INSTITUTION_ADMIN, PLATFORM_ADMIN.
	return true
}

// writeProblemMockGated is the canonical 403 for free students hitting MOCK.
func writeProblemMockGated(w http.ResponseWriter) {
	writeProblem(
		w,
		http.StatusForbidden,
		"premium_required",
		"Mock exams are a STUDENT_PREMIUM feature — upgrade to start a mock session.",
	)
}
