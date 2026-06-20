package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"math/rand/v2"

	"github.com/google/uuid"

	"github.com/adaptive-learn/quiz/internal/adaptive"
	"github.com/adaptive-learn/quiz/internal/adp"
	"github.com/adaptive-learn/quiz/internal/content"
	"github.com/adaptive-learn/quiz/internal/domain"
	"github.com/adaptive-learn/quiz/internal/events"
	"github.com/adaptive-learn/quiz/internal/learning"
	"github.com/adaptive-learn/quiz/internal/store"
)

// coldStartItems is the number of binary-search-selected items at the start of
// an IRT session before we hand off to the engine. < 3 responses give EAP very
// little signal so the early picks would just track the prior — wasted calls.
const coldStartItems = 3

// Per-item IRT params now live on the question row (Sprint 4 — migration 003).
// Existing rows default to a=1.0, c=0.0 (effectively 2PL) until calibration.

// SessionService coordinates the FSM around sessions: creation, next-question
// selection, idempotent answer recording, expiry, and submit.
type SessionService struct {
	store      *store.Store
	flags      FlagEvaluator
	adaptive   adaptive.Client
	publisher  events.Publisher
	clock      func() time.Time
	sessionTTL time.Duration
	target     int16
	// Sprint 8 R-3 — JWT secret for the MOCK-mode tier gate. Empty in
	// existing tests means the gate is disabled (anonymous traffic still
	// allowed for backwards compatibility); production sets this from
	// QUIZ_JWT_SECRET so tier gating is enforced.
	jwtSecret string
	// Sprint 12 S12-D — Content client for ASSIGNMENT mode session
	// creation. nil when QUIZ_CONTENT_BASE_URL is unset (tests / partial
	// stacks); the from-assignment endpoint then 503s.
	contentClient *content.Client
	// Sprint 23 (P4-S23) — Learning client for MOCK_BLUEPRINT mode
	// session creation. nil when QUIZ_LEARNING_BASE_URL is unset; the
	// from-blueprint endpoint then 503s.
	learningClient *learning.Client
	// Phase 1D-9 — engagement base URL for fire-and-forget XP awards
	// (e.g. mistake-replay session creation). Empty disables awards.
	engagementURL string
	// Phase B2 — ADP (Adaptive Difficulty Progression). When non-nil
	// AND the per-session strategy is StrategyADP, pickNext routes
	// through internal/adp instead of the cross-service learning
	// client. Wired via WithADP(). nil-safe so existing fixtures
	// don't need to change.
	adpStore *adp.Store
	adpRng   *rand.Rand
	// Phase B2 A/B harness — fraction of new sessions assigned to
	// the ADP arm. 0.0 means legacy IRT only; 0.5 = 50/50 split
	// sticky on user_id hash.
	adpABFraction float64
}

func NewSessionService(
	s *store.Store,
	flags FlagEvaluator,
	adapt adaptive.Client,
	pub events.Publisher,
	ttl time.Duration,
) *SessionService {
	return &SessionService{
		store:      s,
		flags:      flags,
		adaptive:   adapt,
		publisher:  pub,
		clock:      time.Now,
		sessionTTL: ttl,
		target:     10,
	}
}

// WithJWTSecret enables the Sprint 8 R-3 MOCK-mode tier gate by giving
// the service the shared HS256 secret. Optional fluent setter so existing
// test fixtures don't need to change.
func (svc *SessionService) WithJWTSecret(s string) *SessionService {
	svc.jwtSecret = s
	return svc
}

// WithADP wires the Phase B2 in-process adaptive difficulty
// progression. When set, sessions with Strategy=StrategyADP route
// pickNext through Thompson sampling in the flow corridor instead
// of the cross-service learning adaptive client.
func (svc *SessionService) WithADP(adpStore *adp.Store) *SessionService {
	svc.adpStore = adpStore
	// One shared RNG per service; goroutine-safe for math/rand/v2.
	svc.adpRng = rand.New(rand.NewPCG(uint64(time.Now().UnixNano()), 0xC0DEC0DE))
	return svc
}

// WithADPABFraction sets the rollout fraction for the Phase B2 A/B
// harness. Read at session-create time to decide IRT vs ADP arm.
// Sticky-per-user via FNV hash of user_id.
func (svc *SessionService) WithADPABFraction(f float64) *SessionService {
	svc.adpABFraction = f
	return svc
}

// WithContentClient wires the Sprint 12 S12-D from-assignment endpoint.
// Optional — when unset, the endpoint returns 503.
func (svc *SessionService) WithContentClient(c *content.Client) *SessionService {
	svc.contentClient = c
	return svc
}

// WithLearningClient wires the Sprint 23 from-blueprint endpoint.
// Optional — when unset, the endpoint returns 503.
func (svc *SessionService) WithLearningClient(c *learning.Client) *SessionService {
	svc.learningClient = c
	return svc
}

// WithEngagementURL configures the engagement base URL used for
// gamification XP HTTP awards. Empty string disables XP emission.
func (svc *SessionService) WithEngagementURL(url string) *SessionService {
	svc.engagementURL = url
	return svc
}

// resolveStrategy decides the picker arm for a new session:
//
//  1. If ADP is wired AND the user is in the A/B harness's ADP arm
//     (hash-based, sticky per user), return StrategyADP.
//  2. Otherwise honour the legacy `irt_model_enabled` flag; on/error
//     falls back to binary_search.
//
// Sticky-per-user assignment guarantees a user always lands in the
// same arm regardless of which session they start.
func (svc *SessionService) resolveStrategy(
	ctx context.Context, tenantID string, userID uuid.UUID,
) domain.Strategy {
	// Phase B2 A/B harness — opt-in users get ADP. The fraction is
	// 0.0 by default, so this branch is a no-op until the operator
	// flips QUIZ_ADP_AB_FRACTION upward.
	if svc.adpStore != nil && svc.adpABFraction > 0 && adp.AssignArm(userID, svc.adpABFraction) {
		return domain.StrategyADP
	}
	if svc.flags == nil {
		return domain.StrategyBinarySearch
	}
	on, err := svc.flags.Evaluate(ctx, "irt_model_enabled", tenantID)
	if err != nil || !on {
		return domain.StrategyBinarySearch
	}
	return domain.StrategyIRT
}

type startRequest struct {
	TopicID  string `json:"topicId"`
	UserID   string `json:"userId"`
	TenantID string `json:"tenantId,omitempty"`
	Mode     string `json:"mode,omitempty"`
	// DifficultyBand — optional UI hint from /catalog/topic/<id>'s
	// "Practice this topic" modal. Values: "easy" | "medium" | "hard"
	// | "mixed" | "adaptive" (default / unset). When set to a fixed
	// band, the picker is seeded with a target ability that biases
	// item selection toward that band; "adaptive" keeps the user's
	// current θ; "mixed" leaves θ=0 and widens the corridor.
	DifficultyBand string `json:"difficultyBand,omitempty"`
	// P6-S54 — pre-quiz intent picker. One of:
	//   "match"            (default; no offset)
	//   "push"             (+0.4 θ̂ — harder corridor)
	//   "build_confidence" (-0.4 θ̂ — easier corridor)
	// Unknown values are coerced to "match" so legacy callers stay safe.
	// The CHECK constraint in migration 010 enforces the same set DB-side.
	IntentAnchor string `json:"intentAnchor,omitempty"`
	// Student translation delivery — BCP-47 language tag the student
	// wants content delivered in. Allow-list: en, hi, ta, te, bn, mr.
	// Unknown/absent values are coerced to "en" by normalizeContentLanguage.
	Language string `json:"language,omitempty"`
}

// contentLanguages is the allow-list of supported content language tags.
var contentLanguages = map[string]bool{
	"en": true,
	"hi": true,
	"ta": true,
	"te": true,
	"bn": true,
	"mr": true,
}

// normalizeContentLanguage coerces an arbitrary client string to a supported
// BCP-47 tag. Empty / unknown (including "hinglish") → "en".
func normalizeContentLanguage(s string) string {
	if contentLanguages[s] {
		return s
	}
	return "en"
}

// normalizeIntentAnchor coerces an arbitrary client string to one of
// the three allowed enum values. Empty / unknown → "match" so legacy
// callers (and the DB's column DEFAULT) stay aligned.
func normalizeIntentAnchor(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "push":
		return "push"
	case "build_confidence":
		return "build_confidence"
	default:
		return "match"
	}
}

// intentAnchorThetaOffset maps the intent enum to its IRT bias. Same
// magnitudes as alp-learning's /adaptive/intent/theta-offset route.
func intentAnchorThetaOffset(anchor string) float32 {
	switch anchor {
	case "push":
		return 0.4
	case "build_confidence":
		return -0.4
	default:
		return 0
	}
}

// difficultyBandToTheta maps a UI band to an initial ability estimate
// used to seed the IRT/binary-search picker for cold-start sessions.
// Returned ok=true means the band is recognised; ok=false means use
// the picker's default (the user's current θ).
func difficultyBandToTheta(band string) (theta float32, ok bool) {
	switch strings.ToLower(band) {
	case "easy":
		return -1.2, true
	case "medium":
		return 0.0, true
	case "hard":
		return 1.2, true
	case "mixed":
		// Centre at 0 but the picker treats this as a wide corridor
		// rather than a tight one; logged on the session for visibility.
		return 0.0, true
	}
	return 0, false
}

type startResponse struct {
	SessionID string    `json:"sessionId"`
	Strategy  string    `json:"strategy"`
	Mode      string    `json:"mode"`
	Status    string    `json:"status"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (svc *SessionService) Start(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req startRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeProblem(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return
		}
		if req.TopicID == "" || req.UserID == "" {
			writeProblem(w, http.StatusBadRequest, "missing_field", "topicId and userId are required")
			return
		}
		topicID, err := uuid.Parse(req.TopicID)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_topic_id", "topicId must be a UUID")
			return
		}
		userID, err := uuid.Parse(req.UserID)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_user_id", "userId must be a UUID")
			return
		}
		mode := domain.Mode(strings.ToUpper(req.Mode))
		if mode == "" {
			mode = domain.ModePractice
		}
		if mode != domain.ModePractice && mode != domain.ModeMock && mode != domain.ModeAssignment {
			writeProblem(w, http.StatusBadRequest, "invalid_mode", "mode must be PRACTICE, MOCK, or ASSIGNMENT")
			return
		}
		// Sprint 8 R-3 — MOCK mode requires STUDENT_PREMIUM (or any
		// non-student role for internal tooling). Skip when jwtSecret is
		// unset to keep existing local/test runs anonymous-friendly.
		if mode == domain.ModeMock && svc.jwtSecret != "" {
			role := roleFromBearer(r.Header.Get("Authorization"), svc.jwtSecret)
			if !canStartMockMode(role) {
				writeProblemMockGated(w)
				return
			}
		}

		// Refuse to start if the topic has no published questions.
		count, err := svc.store.CountQuestions(r.Context(), topicID)
		if err != nil {
			logger.Error("count_questions.failed", "err", err, "topic", topicID)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to inspect question bank")
			return
		}
		if count == 0 {
			writeProblem(w, http.StatusUnprocessableEntity, "empty_topic", "No published questions for this topic")
			return
		}

		now := svc.clock()
		intentAnchor := normalizeIntentAnchor(req.IntentAnchor)
		sess := domain.Session{
			ID:           uuid.New(),
			UserID:       userID,
			TenantID:     req.TenantID,
			TopicID:      topicID,
			Mode:         mode,
			Strategy:     svc.resolveStrategy(r.Context(), req.TenantID, userID),
			Status:       domain.StatusInProgress,
			TargetCount:  svc.target,
			StartedAt:    now,
			ExpiresAt:    now.Add(svc.sessionTTL),
			IntentAnchor: intentAnchor,
		}
		// Seed the picker with a target θ when the caller asked for a
		// fixed difficulty band. The picker reads AbilityEstimate to
		// bias item selection, so writing the seed at create-time is
		// enough — no schema or picker change needed downstream.
		if seedTheta, ok := difficultyBandToTheta(req.DifficultyBand); ok {
			sess.AbilityEstimate = seedTheta
			logger.Info("session.difficulty_band_seeded",
				"band", req.DifficultyBand,
				"theta", seedTheta,
				"user", userID,
				"topic", topicID,
			)
		}
		// P6-S54 — apply the intent-anchor θ̂ offset on top of any
		// difficulty-band seed. Push biases items harder; build_confidence
		// biases them easier. Per ADR-0022 the offset only affects item
		// selection — mastery writes are sealed from this signal.
		if offset := intentAnchorThetaOffset(intentAnchor); offset != 0 {
			sess.AbilityEstimate += offset
			logger.Info("session.intent_anchor_applied",
				"anchor", intentAnchor,
				"offset", offset,
				"effective_theta", sess.AbilityEstimate,
				"user", userID,
				"topic", topicID,
			)
		}
		// Student translation delivery — capture the requested content
		// language. Unknown/absent values (e.g. "hinglish") fall back to "en".
		sess.ContentLanguage = normalizeContentLanguage(req.Language)
		if err := svc.store.CreateSession(r.Context(), sess); err != nil {
			logger.Error("create_session.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to create session")
			return
		}

		writeJSON(w, http.StatusCreated, startResponse{
			SessionID: sess.ID.String(),
			Strategy:  string(sess.Strategy),
			Mode:      string(sess.Mode),
			Status:    string(sess.Status),
			ExpiresAt: sess.ExpiresAt,
		})
	}
}

// Sprint 12 S12-D — from-assignment session creation.

type fromAssignmentRequest struct {
	AssignmentID string `json:"assignmentId"`
	UserID       string `json:"userId"`
	TenantID     string `json:"tenantId,omitempty"`
}

type fromAssignmentResponse struct {
	SessionID    string    `json:"sessionId"`
	AssignmentID string    `json:"assignmentId"`
	Mode         string    `json:"mode"`
	Status       string    `json:"status"`
	ExpiresAt    time.Time `json:"expiresAt"`
	ItemCount    int       `json:"itemCount"`
}

// StartFromAssignment opens an ASSIGNMENT-mode session pinned to the
// educator-curated question list. Calls Content over HTTP (forwarding
// the inbound bearer) to fetch the questions, then pre-serves them via
// the existing ServeQuestion path so /next walks them in order rather
// than going through the IRT/binary-search picker.
func (svc *SessionService) StartFromAssignment(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if svc.contentClient == nil {
			writeProblem(w, http.StatusServiceUnavailable,
				"content_unreachable", "Content service base URL not configured")
			return
		}
		var req fromAssignmentRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeProblem(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return
		}
		if req.AssignmentID == "" || req.UserID == "" {
			writeProblem(w, http.StatusBadRequest, "missing_field",
				"assignmentId and userId are required")
			return
		}
		assignmentID, err := uuid.Parse(req.AssignmentID)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_assignment_id",
				"assignmentId must be a UUID")
			return
		}
		userID, err := uuid.Parse(req.UserID)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_user_id",
				"userId must be a UUID")
			return
		}

		// Forward the inbound bearer to Content — its `published_at IS
		// NULL` check + role gate runs against the same JWT.
		bearer := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		bearer = strings.TrimPrefix(bearer, "bearer ")
		if bearer == "" {
			writeProblem(w, http.StatusUnauthorized, "missing_token",
				"Bearer token required")
			return
		}

		questions, err := svc.contentClient.FetchAssignmentQuestions(
			r.Context(), bearer, assignmentID,
		)
		if errors.Is(err, content.ErrAssignmentNotFound) {
			writeProblem(w, http.StatusNotFound, "assignment_not_found",
				"No published assignment with that id")
			return
		}
		if err != nil {
			logger.Error("content.fetch_questions.failed", "err", err)
			writeProblem(w, http.StatusBadGateway, "content_error",
				"Content service is unavailable")
			return
		}
		if len(questions) == 0 {
			writeProblem(w, http.StatusUnprocessableEntity, "empty_assignment",
				"Assignment has no questions yet")
			return
		}

		// Pick a representative topic for the session. Educator may have
		// pulled questions from multiple topics; we record the first one
		// so analytics / mastery flows still join cleanly. The full
		// per-question topic mapping is in assignment_questions on the
		// Content side.
		topicID := uuid.Nil
		for _, q := range questions {
			if q.TopicID != nil {
				topicID = *q.TopicID
				break
			}
		}

		now := svc.clock()
		sess := domain.Session{
			ID:           uuid.New(),
			UserID:       userID,
			TenantID:     req.TenantID,
			TopicID:      topicID,
			Mode:         domain.ModeAssignment,
			Strategy:     domain.StrategyBinarySearch, // not used; ASSIGNMENT walks the pinned list
			Status:       domain.StatusInProgress,
			TargetCount:  int16(len(questions)),
			StartedAt:    now,
			ExpiresAt:    now.Add(svc.sessionTTL),
			AssignmentID: &assignmentID,
		}
		if err := svc.store.CreateSession(r.Context(), sess); err != nil {
			logger.Error("create_session.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error",
				"Failed to create session")
			return
		}

		// Pre-serve the educator's exact ordering so /next walks them in
		// `position` order without hitting the picker. ServeQuestion is
		// idempotent on (session, item_idx); a partial failure is safe
		// to retry.
		for idx, q := range questions {
			if err := svc.store.ServeQuestion(
				r.Context(), sess.ID, int16(idx), q.QuestionID, now,
			); err != nil {
				logger.Error("preserve_question.failed",
					"err", err, "session", sess.ID, "idx", idx)
				writeProblem(w, http.StatusInternalServerError, "store_error",
					"Failed to seed assignment items")
				return
			}
		}

		writeJSON(w, http.StatusCreated, fromAssignmentResponse{
			SessionID:    sess.ID.String(),
			AssignmentID: assignmentID.String(),
			Mode:         string(sess.Mode),
			Status:       string(sess.Status),
			ExpiresAt:    sess.ExpiresAt,
			ItemCount:    len(questions),
		})
	}
}

// CountByShareSlug — F4. Returns the number of quiz_sessions launched
// with this source_share_slug. Used by Learning's
// /catalog/exam-blueprints/mine/{id}/stats to display "N attempts" on
// the author's MyTests row. Service-to-service GET; no auth gate today
// (slugs are opaque enough that enumeration is impractical at v1 scale,
// and the count is non-sensitive).
func (svc *SessionService) CountByShareSlug(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := r.URL.Query().Get("slug")
		if slug == "" {
			writeProblem(w, http.StatusBadRequest, "missing_field", "slug query param is required")
			return
		}
		n, err := svc.store.CountSessionsByShareSlug(r.Context(), slug)
		if err != nil {
			logger.Error("count_by_share_slug.failed", "err", err, "slug", slug)
			writeProblem(w, http.StatusInternalServerError, "store_error",
				"Failed to count sessions by slug")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"slug": slug, "count": n})
	}
}

// Sprint 23 (P4-S23) — from-blueprint session creation.
type fromBlueprintRequest struct {
	BlueprintID string `json:"blueprintId"`
	UserID      string `json:"userId"`
	TenantID    string `json:"tenantId,omitempty"`
	AttemptIdx  int    `json:"attemptIdx,omitempty"`
	// F4 — when launched via a shared link /t/<slug>, propagate the
	// slug so the resulting session counts toward the author's share
	// stats. Empty for organic launches.
	SourceShareSlug string `json:"sourceShareSlug,omitempty"`
}

type fromBlueprintSection struct {
	SectionID  string `json:"sectionId"`
	Name       string `json:"name"`
	NRequested int    `json:"nRequested"`
	NComposed  int    `json:"nComposed"`
	Short      bool   `json:"short"`
}

type fromBlueprintResponse struct {
	SessionID              string                  `json:"sessionId"`
	BlueprintID            string                  `json:"blueprintId"`
	BlueprintName          string                  `json:"blueprintName"`
	Mode                   string                  `json:"mode"`
	Status                 string                  `json:"status"`
	ExpiresAt              time.Time               `json:"expiresAt"`
	ItemCount              int                     `json:"itemCount"`
	TotalMinutes           int                     `json:"totalMinutes"`
	MarksCorrect           int                     `json:"marksCorrect"`
	MarksNegative          float64                 `json:"marksNegative"`
	Short                  bool                    `json:"short"`
	InterSectionNavigation bool                    `json:"interSectionNavigation"`
	PerSectionTimeLocked   bool                    `json:"perSectionTimeLocked"`
	Sections               []fromBlueprintSection  `json:"sections"`
}

// StartFromBlueprint opens a MOCK_BLUEPRINT-mode session pinned to the
// alp-learning composer's output. Mirrors StartFromAssignment in shape:
// pre-serves the questions via ServeQuestionWithSection (so /next walks
// them in `position` order and section_id is propagated to engagement's
// per-section aggregator at submit time).
func (svc *SessionService) StartFromBlueprint(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if svc.learningClient == nil {
			writeProblem(w, http.StatusServiceUnavailable,
				"learning_unreachable", "Learning service base URL not configured")
			return
		}
		var req fromBlueprintRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeProblem(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return
		}
		if req.BlueprintID == "" || req.UserID == "" {
			writeProblem(w, http.StatusBadRequest, "missing_field",
				"blueprintId and userId are required")
			return
		}
		blueprintID, err := uuid.Parse(req.BlueprintID)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_blueprint_id",
				"blueprintId must be a UUID")
			return
		}
		userID, err := uuid.Parse(req.UserID)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_user_id",
				"userId must be a UUID")
			return
		}

		bearer := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		bearer = strings.TrimPrefix(bearer, "bearer ")

		paper, err := svc.learningClient.FetchComposedPaper(
			r.Context(), bearer, blueprintID, userID, req.AttemptIdx,
		)
		if errors.Is(err, learning.ErrBlueprintNotFound) {
			writeProblem(w, http.StatusNotFound, "blueprint_not_found",
				"No blueprint with that id")
			return
		}
		if errors.Is(err, learning.ErrEmptyPaper) {
			// Honest content gate — blueprint exists, but the question bank
			// can't fill any of the sections yet (Phase 4 W1 is the parallel
			// content workstream that scales the bank).
			writeProblem(w, http.StatusUnprocessableEntity, "empty_paper",
				"Composer returned no questions — bank not yet scaled for this blueprint")
			return
		}
		if err != nil {
			logger.Error("learning.fetch_composed_paper.failed", "err", err)
			writeProblem(w, http.StatusBadGateway, "learning_error",
				"Learning service is unavailable")
			return
		}

		// Pick the first question's topic_id as the session's representative
		// topic — same convention as StartFromAssignment when items span
		// multiple topics. Mastery / readiness consumers join on session
		// items, not on the session row.
		topicID := uuid.Nil
		if len(paper.Items) > 0 {
			if t, perr := uuid.Parse(paper.Items[0].TopicID); perr == nil {
				topicID = t
			}
		}

		now := svc.clock()
		// Per-section time budget sums to total_minutes; we use total as the
		// session expiry so the FSM enforces the global time-out. Per-section
		// timer enforcement is a UI concern in this sprint; full server-side
		// section-locks ship in S25 alongside OMR + recovery.
		expiresAt := now.Add(time.Duration(paper.TotalMinutes) * time.Minute)
		if expiresAt.Before(now.Add(svc.sessionTTL)) {
			expiresAt = now.Add(svc.sessionTTL)
		}
		sess := domain.Session{
			ID:              uuid.New(),
			UserID:          userID,
			TenantID:        req.TenantID,
			TopicID:         topicID,
			Mode:            domain.ModeMockBlueprint,
			Strategy:        domain.StrategyBinarySearch, // not used; pinned list
			Status:          domain.StatusInProgress,
			TargetCount:     int16(len(paper.Items)),
			StartedAt:       now,
			ExpiresAt:       expiresAt,
			BlueprintID:     &blueprintID,
			SourceShareSlug: req.SourceShareSlug,
		}
		if err := svc.store.CreateSession(r.Context(), sess); err != nil {
			logger.Error("create_session.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error",
				"Failed to create session")
			return
		}

		for idx, it := range paper.Items {
			if err := svc.store.ServeQuestionWithSection(
				r.Context(), sess.ID, int16(idx), it.QuestionID, it.SectionID, now,
			); err != nil {
				logger.Error("preserve_question.failed",
					"err", err, "session", sess.ID, "idx", idx)
				writeProblem(w, http.StatusInternalServerError, "store_error",
					"Failed to seed blueprint items")
				return
			}
		}

		respSections := make([]fromBlueprintSection, 0, len(paper.Sections))
		for _, s := range paper.Sections {
			respSections = append(respSections, fromBlueprintSection{
				SectionID:  s.SectionID,
				Name:       s.Name,
				NRequested: s.NRequested,
				NComposed:  s.NComposed,
				Short:      s.Short,
			})
		}
		writeJSON(w, http.StatusCreated, fromBlueprintResponse{
			SessionID:              sess.ID.String(),
			BlueprintID:            blueprintID.String(),
			BlueprintName:          paper.BlueprintName,
			Mode:                   string(sess.Mode),
			Status:                 string(sess.Status),
			ExpiresAt:              sess.ExpiresAt,
			ItemCount:              len(paper.Items),
			TotalMinutes:           paper.TotalMinutes,
			MarksCorrect:           paper.MarksCorrect,
			MarksNegative:          paper.MarksNegative,
			Short:                  paper.Short,
			InterSectionNavigation: paper.InterSectionNavigation,
			PerSectionTimeLocked:   paper.PerSectionTimeLocked,
			Sections:               respSections,
		})
	}
}

type nextResponse struct {
	SessionID string   `json:"sessionId"`
	Status    string   `json:"status"`
	Item      *itemDTO `json:"item,omitempty"`
	Done      bool     `json:"done"`
}

type itemDTO struct {
	ItemIdx    int16    `json:"itemIdx"`
	QuestionID string   `json:"questionId"`
	Stem       string   `json:"stem"`
	Choices    []string `json:"choices"`
	// Sprint 7/8 — surfaces the polymorphic question_type to the
	// client so it can render the right input shape (MCQ choices vs
	// text input for FORMULA_INPUT, numeric input for NUMERIC_*, etc).
	// Empty / "MCQ_SINGLE" keeps backward-compatible MCQ rendering.
	QuestionType string `json:"questionType,omitempty"`
	// Phase 7 — typed payload passed through verbatim. Renderer-specific
	// schemas (CASE_STUDY rubric + sub_questions, ESSAY word_count_range,
	// DIAGRAM markers, MATCH pairs, …) are deserialised on the client.
	// json.RawMessage so we don't decode-and-re-encode here; null when
	// the question carries nothing extra (legacy MCQ).
	Payload json.RawMessage `json:"payload,omitempty"`
}

// answerKeyFields are payload keys that reveal the correct answer or
// grading internals. They are stripped before a question payload is sent
// to the student client (the pre-answer answer-key leak fix). Grading is
// unaffected: it reads the original payload from the store, not this DTO.
//
// Only keys that NO client renderer reads are listed here. Canonical
// renderers derive blank counts from `{{n}}`/`___` markers in the stem
// (not `accepted`), and the map renderer captures a free click (not the
// `target_*` coords), so those answer fields are safe to strip. Fields
// shown to the student by design — `rubric`, `key_concepts`, `word_bank`,
// the map `label` — are intentionally NOT stripped.
var answerKeyFields = []string{
	"correct_id",
	"correct_ids",
	"correct_option_id",
	"correct",
	"correct_pairs",
	"correct_order",
	"correct_assignments",
	"correct_markers",
	"model_answer",
	"is_correct",
	"explanation",
	"accepted",              // FILL_BLANK_SINGLE answer (multi/cloze in blanks[])
	"target_lat",            // MAP_LOCATION answer coords
	"target_lng",
	"tolerance_deg",
	"low",                   // NUMERIC_RANGE acceptable bounds = the answer
	"high",
	"target_expression",     // FORMULA_INPUT canonical answer expression
	"correct_statement_ids", // MULTI_STATEMENT answer
}

// studentPayload returns a copy of raw with answer-key fields removed so a
// served question never ships its own answer to the browser. raw is
// returned unchanged when empty or not a JSON object (a malformed payload
// is surfaced by the client renderer's error boundary, not here).
func studentPayload(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return raw
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return raw
	}
	stripped := false
	for _, k := range answerKeyFields {
		if _, ok := obj[k]; ok {
			delete(obj, k)
			stripped = true
		}
	}
	// FILL_BLANK_MULTI / CLOZE carry the answer inside blanks[].accepted —
	// strip it from each blank (the renderer reads stem markers, not blanks).
	if rawBlanks, ok := obj["blanks"]; ok {
		var blanks []map[string]json.RawMessage
		if json.Unmarshal(rawBlanks, &blanks) == nil {
			changed := false
			for _, b := range blanks {
				if _, has := b["accepted"]; has {
					delete(b, "accepted")
					changed = true
				}
			}
			if changed {
				if nb, mErr := json.Marshal(blanks); mErr == nil {
					obj["blanks"] = nb
					stripped = true
				}
			}
		}
	}
	if !stripped {
		return raw
	}
	out, err := json.Marshal(obj)
	if err != nil {
		return raw
	}
	return out
}

// Next returns the current unanswered item if one is already served (resume
// semantics), otherwise serves the next question and records it.
func (svc *SessionService) Next(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sess, ok := svc.loadActive(w, r, logger)
		if !ok {
			return
		}

		// Pre-served modes (MOCK_BLUEPRINT / ASSIGNMENT) sit at
		// served_count == target_count from session-create time. For
		// these, "done" means every item has been ANSWERED, not just
		// served. We look up the lowest-indexed unanswered row and
		// return it; if none exists the session is genuinely done.
		if sess.Mode == domain.ModeMockBlueprint || sess.Mode == domain.ModeAssignment {
			it, has, err := svc.store.GetFirstUnansweredItem(r.Context(), sess.ID)
			if err != nil {
				logger.Error("first_unanswered.failed", "err", err)
				writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to inspect session")
				return
			}
			if !has {
				writeJSON(w, http.StatusOK, nextResponse{
					SessionID: sess.ID.String(),
					Status:    string(sess.Status),
					Done:      true,
				})
				return
			}
			q, err := svc.store.GetQuestion(r.Context(), it.QuestionID, sess.ContentLanguage)
			if err != nil {
				logger.Error("get_question.failed", "err", err)
				writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load question")
				return
			}
			writeJSON(w, http.StatusOK, nextResponse{
				SessionID: sess.ID.String(),
				Status:    string(sess.Status),
				Item: &itemDTO{
					ItemIdx:      it.ItemIdx,
					QuestionID:   q.ID.String(),
					Stem:         q.Stem,
					Choices:      q.Choices,
					QuestionType: q.QuestionType,
					Payload:      studentPayload(q.Payload),
				},
			})
			return
		}

		if sess.ServedCount >= sess.TargetCount {
			writeJSON(w, http.StatusOK, nextResponse{
				SessionID: sess.ID.String(),
				Status:    string(sess.Status),
				Done:      true,
			})
			return
		}

		current, has, err := svc.store.GetCurrentItem(r.Context(), sess.ID)
		if err != nil {
			logger.Error("get_current_item.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to inspect session")
			return
		}
		if has {
			q, err := svc.store.GetQuestion(r.Context(), current.QuestionID, sess.ContentLanguage)
			if err != nil {
				logger.Error("get_question.failed", "err", err)
				writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load question")
				return
			}
			writeJSON(w, http.StatusOK, nextResponse{
				SessionID: sess.ID.String(),
				Status:    string(sess.Status),
				Item: &itemDTO{
					ItemIdx:      current.ItemIdx,
					QuestionID:   q.ID.String(),
					Stem:         q.Stem,
					Choices:      q.Choices,
					QuestionType: q.QuestionType,
					Payload:      studentPayload(q.Payload),
				},
			})
			return
		}

		q, err := svc.pickNext(r.Context(), sess, logger)
		if errors.Is(err, store.ErrQuestionNotFound) {
			writeJSON(w, http.StatusOK, nextResponse{
				SessionID: sess.ID.String(),
				Status:    string(sess.Status),
				Done:      true,
			})
			return
		}
		if err != nil {
			logger.Error("pick_question.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to pick next question")
			return
		}
		nextIdx := sess.ServedCount
		if err := svc.store.ServeQuestion(r.Context(), sess.ID, nextIdx, q.ID, svc.clock()); err != nil {
			logger.Error("serve_question.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to serve question")
			return
		}
		writeJSON(w, http.StatusOK, nextResponse{
			SessionID: sess.ID.String(),
			Status:    string(sess.Status),
			Item: &itemDTO{
				ItemIdx:      nextIdx,
				QuestionID:   q.ID.String(),
				Stem:         q.Stem,
				Choices:      q.Choices,
				QuestionType: q.QuestionType,
				Payload:      studentPayload(q.Payload),
			},
		})
	}
}

type answerRequest struct {
	ItemIdx   int16 `json:"itemIdx"`
	AnswerIdx int16 `json:"answerIdx"`
	// Phase 5 (P5-S38) — non-MCQ types submit a structured response
	// payload (e.g. {"answer": 30} for NUMERIC_INTEGER). Ignored when
	// the question is MCQ_SINGLE (existing path); AnswerIdx remains
	// the source of truth there. Wire shape mirrors what alp-learning's
	// /grading/grade expects.
	ResponsePayload map[string]any `json:"responsePayload,omitempty"`
	// Optional self-reported confidence (0..1). Pass-through to NATS
	// payload — S39 confidence-calibration aggregator consumes it.
	Confidence *float32 `json:"confidence,omitempty"`
}

type answerResponse struct {
	SessionID    string `json:"sessionId"`
	ItemIdx      int16  `json:"itemIdx"`
	IsCorrect    bool   `json:"isCorrect"`
	CorrectIdx   int16  `json:"correctIdx"`
	ServedCount  int16  `json:"servedCount"`
	CorrectCount int16  `json:"correctCount"`
}

// Answer records the answer for an item. Idempotent: re-submitting the same
// (sessionId, itemIdx) returns the original verdict (first-write wins per
// GAP-21 AC-05). Updates the session's running ability estimate.
// Items lists every session_item (with full question content) for a
// pre-served session. Used by the MockExam UI to render the whole
// paper up-front so the student can navigate freely via the palette.
// PRACTICE/MOCK adaptive sessions don't expose this — the items
// aren't all served yet — and the handler 422s for those.
func (svc *SessionService) Items(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sess, ok := svc.loadActive(w, r, logger)
		if !ok {
			return
		}
		if sess.Mode != domain.ModeMockBlueprint && sess.Mode != domain.ModeAssignment {
			writeProblem(w, http.StatusUnprocessableEntity, "wrong_mode",
				"Items endpoint is only available for pre-served sessions (MOCK_BLUEPRINT, ASSIGNMENT).")
			return
		}
		items, err := svc.store.ListSessionItems(r.Context(), sess.ID)
		if err != nil {
			logger.Error("list_items.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to list items")
			return
		}
		out := make([]itemDTO, 0, len(items))
		for _, it := range items {
			q, err := svc.store.GetQuestion(r.Context(), it.QuestionID, sess.ContentLanguage)
			if err != nil {
				logger.Error("get_question.failed", "err", err, "qid", it.QuestionID)
				continue
			}
			out = append(out, itemDTO{
				ItemIdx:      it.ItemIdx,
				QuestionID:   q.ID.String(),
				Stem:         q.Stem,
				Choices:      q.Choices,
				QuestionType: q.QuestionType,
				Payload:      studentPayload(q.Payload),
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"sessionId": sess.ID.String(),
			"items":     out,
		})
	}
}

func (svc *SessionService) Answer(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sess, ok := svc.loadActive(w, r, logger)
		if !ok {
			return
		}
		var req answerRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeProblem(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return
		}
		if req.ItemIdx < 0 || req.AnswerIdx < 0 {
			writeProblem(w, http.StatusBadRequest, "invalid_answer", "itemIdx and answerIdx must be non-negative")
			return
		}

		item, err := svc.store.GetItem(r.Context(), sess.ID, req.ItemIdx)
		if errors.Is(err, store.ErrItemNotFound) {
			writeProblem(w, http.StatusNotFound, "item_not_found", "No served item at this itemIdx")
			return
		}
		if err != nil {
			logger.Error("get_item.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load item")
			return
		}
		q, err := svc.store.GetQuestion(r.Context(), item.QuestionID, sess.ContentLanguage)
		if err != nil {
			logger.Error("get_question.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load question")
			return
		}
		// Phase 5 (P5-S38) — branch on question_type. The existing
		// inline path stays for MCQ_SINGLE (which is what all 480 seeded
		// items today are). Non-MCQ types route through alp-learning's
		// /grading/grade and store the Resolution-derived is_correct.
		var isCorrect bool
		qtype := q.QuestionType
		if qtype == "" {
			qtype = "MCQ_SINGLE"
		}
		// Inline answer-idx grading. MCQ_SINGLE always grades here; so does
		// any other choice-rendered deterministic type (TRUE_FALSE,
		// ASSERTION_REASON, MULTI_STATEMENT, …) when the client submits a
		// bare choice index instead of a typed responsePayload. Quiz Go
		// mirrors choices + correct_idx for every type, so answer-idx
		// equality is authoritative for a selected choice (ADR-0018). We
		// only defer to alp-learning's typed grader when the client sends a
		// responsePayload Quiz Go can't grade locally (ESSAY, NUMERIC_*,
		// MATCH_THE_FOLLOWING, FILL_BLANK_*, …). This keeps the adaptive
		// player (which only ever submits answerIdx) working for every
		// choice-based type instead of 503-ing on a null grading payload.
		inlineGradable := qtype == "MCQ_SINGLE" ||
			(len(req.ResponsePayload) == 0 && len(q.Choices) > 0)
		if inlineGradable {
			if int(req.AnswerIdx) >= len(q.Choices) {
				writeProblem(w, http.StatusBadRequest, "invalid_answer",
					"answerIdx out of range for question choices")
				return
			}
			isCorrect = req.AnswerIdx == q.CorrectIdx
		} else {
			// Polymorphic typed types (ESSAY, NUMERIC_*, MATCH_*, …) route
			// to alp-learning's typed grader. Quiz Go mirrors the full
			// canonical payload (P7 migration 013), so forward it directly
			// rather than relying on id-based lookup against
			// content_schema.questions (P5-S50). That lookup 400s (→ 503
			// here) in any environment where the polymorphic bank was
			// seeded into quiz_schema but not content_schema (e.g. local
			// dev). Empty-payload fallback (id lookup) is kept for legacy
			// MCQ rows whose mirror is NULL.
			if svc.learningClient == nil {
				writeProblem(w, http.StatusServiceUnavailable,
					"grading_unavailable",
					"Quiz Go has no learning client configured for non-MCQ grading")
				return
			}
			payload := map[string]any{}
			if len(q.Payload) > 0 {
				if err := json.Unmarshal(q.Payload, &payload); err != nil {
					logger.Error("payload_unmarshal.failed", "err", err, "qid", q.ID)
					payload = map[string]any{} // fall back to id-based lookup
				}
			}
			res, gradeErr := svc.learningClient.GradeRemote(
				r.Context(),
				"", // bearer not required for internal grading
				q.ID.String(),
				qtype,
				payload,
				req.ResponsePayload,
				q.Language,
			)
			if gradeErr != nil {
				logger.Error("grade_remote.failed", "err", gradeErr,
					"question_type", qtype)
				writeProblem(w, http.StatusServiceUnavailable, "grading_failed",
					"Failed to grade non-MCQ response remotely")
				return
			}
			isCorrect = res.Status == "CORRECT"
		}
		newAbility := nextAbility(sess.AbilityEstimate, isCorrect, sess.ServedCount)
		recorded, err := svc.store.RecordAnswer(r.Context(), sess.ID, req.ItemIdx, req.AnswerIdx, isCorrect, svc.clock(), newAbility)
		if err != nil {
			logger.Error("record_answer.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to record answer")
			return
		}

		// Phase B2 ADP — fire-and-forget hooks for the bandit + θ update.
		// Wrapped in a goroutine so a slow/failed ADP write never
		// stalls the answer response. svc.adpStore is nil-safe; if
		// ADP isn't wired the goroutine is a no-op.
		if svc.adpStore != nil && sess.Strategy == domain.StrategyADP {
			go svc.updateADPAfterAnswer(
				context.Background(),
				sess.UserID, sess.TopicID, q.ID, isCorrect, logger,
			)
		}

		// Re-load session for the latest counts (RecordAnswer may have bumped them).
		fresh, err := svc.store.GetSession(r.Context(), sess.ID)
		if err != nil {
			logger.Error("get_session.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load session")
			return
		}
		writeJSON(w, http.StatusOK, answerResponse{
			SessionID:    fresh.ID.String(),
			ItemIdx:      recorded.ItemIdx,
			IsCorrect:    *recorded.IsCorrect,
			CorrectIdx:   q.CorrectIdx,
			ServedCount:  fresh.ServedCount,
			CorrectCount: fresh.CorrectCount,
		})
	}
}

// nextAbility is a placeholder local ability update — symmetrical step damped
// by the number of answered items. Used for the binary_search strategy and
// for the IRT cold-start phase (< coldStartItems answered). Once we have
// enough responses, /next pulls the canonical θ from Adaptive Engine.
func nextAbility(prev float32, isCorrect bool, served int16) float32 {
	step := float32(0.3) / float32(1+served/2)
	if !isCorrect {
		step = -step
	}
	return prev + step
}

// pickNext chooses the next question. The IRT branch consults Adaptive Engine
// once the session is past cold-start; everything else uses the local
// closest-difficulty heuristic. Falls back to the local heuristic on engine
// error so a transient outage doesn't break the quiz flow.
// updateADPAfterAnswer — fire-and-forget hook that runs after every
// answer in an ADP-mode session. Three jobs:
//
//   1. Bump n_attempts / n_correct on the question's calibration row
//      so future Thompson-sampling sees the fresh signal.
//   2. Re-estimate the student's θ for this concept via the in-
//      process EAP over the recent answer stream.
//   3. Run flow-corridor regulation (frustration / boredom) and log
//      a flow_corridor_event when the state changes.
//
// Errors are logged but never bubble up — the answer response has
// already been sent and we won't roll back student progress over a
// flaky background write.
func (svc *SessionService) updateADPAfterAnswer(
	ctx context.Context,
	userID, conceptID, questionID uuid.UUID,
	correct bool,
	logger *slog.Logger,
) {
	// 1. Bump the per-question counts.
	if err := svc.adpStore.BumpCalibrationCounts(ctx, questionID, correct); err != nil {
		logger.Warn("adp.bump_calibration.failed", "err", err)
	}

	// 2. Re-estimate θ over the last ~50 answers on this concept.
	//    Pull the student's recent answered items + their per-item
	//    calibrations and feed them through the EAP estimator.
	answered, err := svc.store.ListAnsweredForUserConcept(ctx, userID, conceptID, 50)
	if err != nil {
		logger.Warn("adp.list_answered.failed", "err", err)
		return
	}
	if len(answered) == 0 {
		return
	}

	// Pull question IDs once + fetch all calibrations in one batch.
	qids := make([]uuid.UUID, 0, len(answered))
	for _, a := range answered {
		qids = append(qids, a.QuestionID)
	}
	calibs, cerr := svc.adpStore.LoadCalibrations(ctx, qids)
	if cerr != nil {
		logger.Warn("adp.load_calibrations.failed", "err", cerr)
		return
	}
	obs := make([]adp.Observation, 0, len(answered))
	for _, a := range answered {
		cal := calibs[a.QuestionID]
		b := cal.B
		aDisc, cGuess := cal.A, cal.C
		if cal.NAttempts == 0 {
			// No calibration row yet — use the question's default
			// difficulty (the store-side IRT fallback).
			b, aDisc, cGuess = float64(a.DifficultyB), 1.0, 0.0
		}
		obs = append(obs, adp.Observation{
			B: b, A: aDisc, C: cGuess, Correct: a.IsCorrect,
		})
	}
	estimator := adp.NewEAP()
	res := estimator.Estimate(obs, 0.0, 1.0)
	ab := adp.Ability{
		UserID:    userID,
		ConceptID: conceptID,
		Theta:     res.Theta,
		SE:        res.SE,
		NAttempts: len(obs),
	}
	for _, o := range obs {
		if o.Correct {
			ab.NCorrect++
		}
	}
	if err := svc.adpStore.UpsertAbility(ctx, ab); err != nil {
		logger.Warn("adp.upsert_ability.failed", "err", err)
	}

	// 3. Flow-corridor regulation over the last 5 answers.
	tail := answered
	if len(tail) > 5 {
		tail = tail[len(tail)-5:]
	}
	signals := make([]adp.AnswerSignal, 0, len(tail))
	for _, a := range tail {
		signals = append(signals, adp.AnswerSignal{
			Correct: a.IsCorrect,
			// TimeMs may be 0 in legacy rows — flow.Detect handles
			// the zero case by skipping the timing-based branch.
			TimeMs: a.TimeMs,
		})
	}
	d := adp.Detect(signals, 0) // 0 = no per-concept median yet
	if d.State != adp.FlowNormal {
		correction := ""
		if d.BAdjustment != 0 {
			correction = "b_adjust=" + formatFloat(d.BAdjustment)
		}
		if err := svc.adpStore.LogFlowEvent(
			ctx, userID, conceptID, string(d.State), correction, d.Rationale,
		); err != nil {
			logger.Warn("adp.log_flow_event.failed", "err", err)
		}
		logger.Info("adp.flow_event",
			"state", d.State,
			"correction", correction,
			"rationale", d.Rationale,
		)
	}
}

func formatFloat(f float64) string {
	// Two-decimal format with explicit + on positives so log lines
	// read "b_adjust=+0.40" or "b_adjust=-0.50".
	s := strconv.FormatFloat(f, 'f', 2, 64)
	if f >= 0 {
		return "+" + s
	}
	return s
}

// pickNextADP — Phase B2 in-process ADP path. Loads the user's θ
// from concept_ability, builds the Csikszentmihalyi flow corridor,
// filters calibrated candidates by their difficulty, and Thompson-
// samples one to serve. All inside Quiz Go — no learning HTTP hop.
//
// Caller is responsible for already having confirmed adpStore is
// non-nil. Falls back to PickNextQuestion on any failure so a flaky
// ADP path never blocks question delivery.
func (svc *SessionService) pickNextADP(
	ctx context.Context, sess domain.Session, logger *slog.Logger,
) (domain.Question, error) {
	candidates, err := svc.store.ListUnservedCandidates(ctx, sess.ID, sess.TopicID)
	if err != nil || len(candidates) == 0 {
		if err != nil {
			logger.Warn("adp.list_candidates.failed", "err", err)
		}
		return svc.store.PickNextQuestion(ctx, sess)
	}

	// Load the user's current θ for this concept. The session's
	// TopicID is treated as the concept proxy until Quiz models the
	// concept dimension separately — keeps the Phase B2 wiring
	// minimal.
	ability, _, aerr := svc.adpStore.GetAbility(ctx, sess.UserID, sess.TopicID)
	if aerr != nil {
		logger.Warn("adp.get_ability.failed", "err", aerr)
		return svc.store.PickNextQuestion(ctx, sess)
	}

	// Load per-question calibrations in one round-trip.
	qids := make([]uuid.UUID, 0, len(candidates))
	for _, c := range candidates {
		qids = append(qids, c.ID)
	}
	calibs, cerr := svc.adpStore.LoadCalibrations(ctx, qids)
	if cerr != nil {
		logger.Warn("adp.load_calibrations.failed", "err", cerr)
		return svc.store.PickNextQuestion(ctx, sess)
	}

	// Build the candidate set. Prefer the calibrated b from
	// quiz_schema.question_calibration; fall back to whatever the
	// question table has (legacy calibration).
	adpCands := make([]adp.Candidate, 0, len(candidates))
	idIndex := make(map[uuid.UUID]int, len(candidates))
	for i, c := range candidates {
		cal := calibs[c.ID]
		b := cal.B
		if cal.NAttempts == 0 {
			// No calibration yet — use the question row's stored b.
			b = float64(c.DifficultyB)
		}
		adpCands = append(adpCands, adp.Candidate{
			QuestionID: c.ID,
			B:          b,
			NAttempts:  cal.NAttempts,
			NCorrect:   cal.NCorrect,
		})
		idIndex[c.ID] = i
	}

	// Flow-corridor filter.
	lo, hi := adp.DefaultCorridor(ability.Theta)
	inCorridor := adp.FilterByCorridor(adpCands, lo, hi)
	// If nothing in corridor (e.g., very early θ outside item bank's
	// range), widen by ±0.5 once before giving up.
	if len(inCorridor) == 0 {
		inCorridor = adp.FilterByCorridor(adpCands, lo-0.5, hi+0.5)
	}
	if len(inCorridor) == 0 {
		// Still nothing — fall back to the legacy picker.
		logger.Info("adp.empty_corridor", "theta", ability.Theta)
		return svc.store.PickNextQuestion(ctx, sess)
	}

	picked, ok := adp.ThompsonPick(inCorridor, svc.adpRng)
	if !ok {
		return svc.store.PickNextQuestion(ctx, sess)
	}
	logger.Debug("adp.pick",
		"question_id", picked.QuestionID,
		"theta", ability.Theta,
		"b", picked.B,
		"corridor_size", len(inCorridor),
	)
	return svc.store.GetQuestion(ctx, picked.QuestionID, sess.ContentLanguage)
}

func (svc *SessionService) pickNext(ctx context.Context, sess domain.Session, logger *slog.Logger) (domain.Question, error) {
	// Phase B2 — route through the in-process ADP path when the
	// session is opted in. The opt-in is via Strategy field on
	// quiz_sessions; the A/B harness flips this per-user at session
	// create time.
	if svc.adpStore != nil && sess.Strategy == domain.StrategyADP {
		if sess.ServedCount >= coldStartItems {
			return svc.pickNextADP(ctx, sess, logger)
		}
	}
	if svc.adaptive == nil ||
		sess.Strategy != domain.StrategyIRT ||
		sess.ServedCount < coldStartItems {
		return svc.store.PickNextQuestion(ctx, sess)
	}

	candidates, err := svc.store.ListUnservedCandidates(ctx, sess.ID, sess.TopicID)
	if err != nil {
		logger.Warn("list_candidates.failed", "err", err)
		return svc.store.PickNextQuestion(ctx, sess)
	}
	if len(candidates) == 0 {
		return domain.Question{}, store.ErrQuestionNotFound
	}

	answered, err := svc.store.ListAnsweredItemsWithDifficulty(ctx, sess.ID)
	if err != nil {
		logger.Warn("list_answered.failed", "err", err)
		return svc.store.PickNextQuestion(ctx, sess)
	}

	theta := sess.AbilityEstimate
	if len(answered) > 0 {
		responses := make([]adaptive.ResponseDTO, 0, len(answered))
		for _, a := range answered {
			responses = append(responses, adaptive.ResponseDTO{
				IRTItem:   adaptive.IRTItem{A: a.DiscriminationA, B: a.DifficultyB, C: a.GuessingC},
				IsCorrect: a.IsCorrect,
			})
		}
		ar, aerr := svc.adaptive.Ability(ctx, adaptive.AbilityRequest{
			Responses: responses,
			PriorMean: 0,
			PriorSD:   1,
			// F2a — pass user_id so the engine resolves a per-user
			// theta prior from the screening result (when present).
			UserID: sess.UserID.String(),
		})
		if aerr != nil {
			logger.Warn("adaptive.ability.failed", "err", aerr)
		} else {
			theta = ar.Theta
		}
	}

	cands := make([]adaptive.CandidateDTO, 0, len(candidates))
	for _, c := range candidates {
		cands = append(cands, adaptive.CandidateDTO{
			ID:      c.ID.String(),
			IRTItem: adaptive.IRTItem{A: c.DiscriminationA, B: c.DifficultyB, C: c.GuessingC},
		})
	}
	sel, serr := svc.adaptive.SelectNext(ctx, adaptive.SelectNextRequest{
		Theta:       theta,
		Candidates:  cands,
		ExposureCap: 5,
	})
	if serr != nil || sel.ItemID == nil {
		if serr != nil {
			logger.Warn("adaptive.select_next.failed", "err", serr)
		}
		return svc.store.PickNextQuestion(ctx, sess)
	}
	chosenID, err := uuid.Parse(*sel.ItemID)
	if err != nil {
		logger.Warn("adaptive.select_next.bad_id", "id", *sel.ItemID, "err", err)
		return svc.store.PickNextQuestion(ctx, sess)
	}
	return svc.store.GetQuestion(ctx, chosenID, sess.ContentLanguage)
}

type submitResponse struct {
	SessionID    string  `json:"sessionId"`
	Status       string  `json:"status"`
	ServedCount  int16   `json:"servedCount"`
	CorrectCount int16   `json:"correctCount"`
	Score        float32 `json:"score"`
}

// Submit closes the session.
func (svc *SessionService) Submit(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sess, ok := svc.loadActive(w, r, logger)
		if !ok {
			return
		}
		if err := svc.store.MarkSubmitted(r.Context(), sess.ID, svc.clock()); err != nil {
			logger.Error("mark_submitted.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to submit session")
			return
		}
		// Sprint 22 (P4-S22) — compute per-item time_spent_ms once, server-side
		// (NFR-P4-02 — clients cannot tamper). Best-effort: the durable record
		// is the items table itself; a failure here doesn't block submit.
		if err := svc.store.WriteItemDurations(r.Context(), sess.ID); err != nil {
			logger.Warn("write_item_durations.failed", "err", err, "session", sess.ID)
		}
		fresh, err := svc.store.GetSession(r.Context(), sess.ID)
		if err != nil {
			logger.Error("get_session.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load session")
			return
		}
		var score float32
		if fresh.ServedCount > 0 {
			score = float32(fresh.CorrectCount) / float32(fresh.ServedCount)
		}
		// Best-effort domain event so Analytics + Notification can react.
		// Publish errors are swallowed: the session row is the durable record;
		// missed events are reconciled by Analytics' nightly backfill (Sprint 3).
		if svc.publisher != nil {
			submittedAt := svc.clock()
			if fresh.SubmittedAt != nil {
				submittedAt = *fresh.SubmittedAt
			}
			ev := events.SessionCompleted{
				SessionID:       fresh.ID.String(),
				UserID:          fresh.UserID.String(),
				TenantID:        fresh.TenantID,
				TopicID:         fresh.TopicID.String(),
				Mode:            string(fresh.Mode),
				Strategy:        string(fresh.Strategy),
				ServedCount:     fresh.ServedCount,
				CorrectCount:    fresh.CorrectCount,
				AbilityEstimate: fresh.AbilityEstimate,
				Score:           score,
				SubmittedAt:     submittedAt,
				TS:              svc.clock(),
			}
			// Sprint 12 S12-D — carry assignment_id through so Content's
			// subscriber can mirror the score into assignment_progress.
			if fresh.AssignmentID != nil {
				ev.AssignmentID = fresh.AssignmentID.String()
			}
			// Sprint 22 (P4-S22) — per-item array for engagement's per-section
			// aggregator + downstream time-per-question analytics. omitempty
			// preserves the historical payload for any consumer that doesn't
			// read Items.
			if items, lerr := svc.store.LoadItemEvents(r.Context(), fresh.ID); lerr == nil {
				ev.Items = make([]events.SessionItemEvent, 0, len(items))
				for _, it := range items {
					itemEv := events.SessionItemEvent{
						ItemIdx:     it.ItemIdx,
						QuestionID:  it.QuestionID.String(),
						TopicID:     it.TopicID.String(),
						IsCorrect:   it.IsCorrect,
						TimeSpentMs: it.TimeSpentMs,
					}
					if it.SectionID != nil {
						itemEv.SectionID = *it.SectionID
					}
					ev.Items = append(ev.Items, itemEv)
				}
			} else {
				logger.Warn("load_item_events.failed", "err", lerr, "session", fresh.ID)
			}
			if perr := svc.publisher.PublishSessionCompleted(r.Context(), ev); perr != nil {
				logger.Warn("publish.session_completed.failed", "err", perr, "session", fresh.ID)
			}
		}
		writeJSON(w, http.StatusOK, submitResponse{
			SessionID:    fresh.ID.String(),
			Status:       string(fresh.Status),
			ServedCount:  fresh.ServedCount,
			CorrectCount: fresh.CorrectCount,
			Score:        score,
		})
	}
}

type sessionResponse struct {
	SessionID    string        `json:"sessionId"`
	UserID       string        `json:"userId"`
	TopicID      string        `json:"topicId"`
	Mode         string        `json:"mode"`
	Strategy     string        `json:"strategy"`
	Status       string        `json:"status"`
	TargetCount  int16         `json:"targetCount"`
	ServedCount  int16         `json:"servedCount"`
	CorrectCount int16         `json:"correctCount"`
	StartedAt    time.Time     `json:"startedAt"`
	ExpiresAt    time.Time     `json:"expiresAt"`
	Items        []itemSummary `json:"items"`
}

type itemSummary struct {
	ItemIdx     int16    `json:"itemIdx"`
	QuestionID  string   `json:"questionId"`
	AnswerIdx   *int16   `json:"answerIdx,omitempty"`
	IsCorrect   *bool    `json:"isCorrect,omitempty"`
	Answered    bool     `json:"answered"`
	Stem        string   `json:"stem,omitempty"`
	Choices     []string `json:"choices,omitempty"`
	CorrectIdx  *int16   `json:"correctIdx,omitempty"`
	Explanation *string  `json:"explanation,omitempty"`
	// QuestionType lets the results UI decide whether the answerIdx /
	// correctIdx letters are meaningful. They only are for MCQ_SINGLE
	// (and untyped legacy) — every other type is answered with a typed
	// response payload, so answerIdx is a meaningless zero default.
	QuestionType string `json:"questionType,omitempty"`
}

// Get returns the full session state with served-item history (resume / review).
func (svc *SessionService) Get(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := parseSessionID(r)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_session_id", err.Error())
			return
		}
		sess, err := svc.store.GetSession(r.Context(), id)
		if errors.Is(err, store.ErrSessionNotFound) {
			writeProblem(w, http.StatusNotFound, "session_not_found", "No such session")
			return
		}
		if err != nil {
			logger.Error("get_session.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load session")
			return
		}
		// Inline expiry sweep: if status is IN_PROGRESS but TTL has passed, flip it.
		if sess.Status == domain.StatusInProgress && sess.IsExpired(svc.clock()) {
			_ = svc.store.MarkExpired(r.Context(), sess.ID)
			sess.Status = domain.StatusExpired
		}
		items, err := svc.store.ListItems(r.Context(), sess.ID)
		if err != nil {
			logger.Error("list_items.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load items")
			return
		}
		// Hydrate each item with its question content (stem + choices +
		// correctIdx + explanation) so QuizResult can render a real teaching
		// moment without N round-trips. We hydrate when the session is
		// SUBMITTED, OR per-item for any item the user has already ANSWERED:
		// an answered item's stem + correct answer were already revealed to
		// the student (the answer endpoint returns correctIdx), so this leaks
		// nothing — while unanswered items (e.g. not-yet-reached questions in
		// a pre-served mock) stay hidden to preserve mid-quiz integrity.
		// Practice sessions complete without an explicit SUBMITTED transition,
		// so the per-item gate is what makes their results page show real
		// questions instead of placeholders.
		hydrate := sess.Status == domain.StatusSubmitted
		summaries := make([]itemSummary, 0, len(items))
		for _, it := range items {
			s := itemSummary{
				ItemIdx:    it.ItemIdx,
				QuestionID: it.QuestionID.String(),
				AnswerIdx:  it.AnswerIdx,
				IsCorrect:  it.IsCorrect,
				Answered:   it.IsAnswered(),
			}
			if hydrate || it.IsAnswered() {
				if q, qerr := svc.store.GetQuestion(r.Context(), it.QuestionID, sess.ContentLanguage); qerr == nil {
					s.Stem = q.Stem
					s.Choices = q.Choices
					ci := q.CorrectIdx
					s.CorrectIdx = &ci
					s.Explanation = q.Explanation
					s.QuestionType = q.QuestionType
				}
			}
			summaries = append(summaries, s)
		}
		writeJSON(w, http.StatusOK, sessionResponse{
			SessionID:    sess.ID.String(),
			UserID:       sess.UserID.String(),
			TopicID:      sess.TopicID.String(),
			Mode:         string(sess.Mode),
			Strategy:     string(sess.Strategy),
			Status:       string(sess.Status),
			TargetCount:  sess.TargetCount,
			ServedCount:  sess.ServedCount,
			CorrectCount: sess.CorrectCount,
			StartedAt:    sess.StartedAt,
			ExpiresAt:    sess.ExpiresAt,
			Items:        summaries,
		})
	}
}

type sessionListItem struct {
	SessionID    string     `json:"sessionId"`
	TopicID      string     `json:"topicId"`
	Mode         string     `json:"mode"`
	Strategy     string     `json:"strategy"`
	Status       string     `json:"status"`
	TargetCount  int16      `json:"targetCount"`
	ServedCount  int16      `json:"servedCount"`
	CorrectCount int16      `json:"correctCount"`
	StartedAt    time.Time  `json:"startedAt"`
	SubmittedAt  *time.Time `json:"submittedAt,omitempty"`
	// Sprint 25 (P4-S25) — present only for MOCK_BLUEPRINT sessions.
	BlueprintID *string `json:"blueprintId,omitempty"`
}

type sessionListResponse struct {
	UserID string            `json:"userId"`
	Items  []sessionListItem `json:"items"`
}

// ListSessions surfaces a user's quiz session history newest-first. The mobile
// "History" screen and web's /history page render directly from this — the
// endpoint stays slim (status counts + topic id) and the client resolves topic
// titles from catalog. Local stack: no JWT enforcement to mirror the rest of
// /quiz; production layers add scoping by reading user_id from the bearer.
func (svc *SessionService) ListSessions(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userIDStr := r.URL.Query().Get("userId")
		if userIDStr == "" {
			writeProblem(w, http.StatusBadRequest, "missing_field", "userId is required")
			return
		}
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_user_id", "userId must be a UUID")
			return
		}
		limit := 50
		if l := r.URL.Query().Get("limit"); l != "" {
			if n, perr := parseLimit(l); perr == nil && n > 0 {
				limit = n
			}
		}
		// Sprint 25 (P4-S25) — optional ?mode= filter for the Mocks series view.
		mode := r.URL.Query().Get("mode")
		rows, err := svc.store.ListSessionsForUser(r.Context(), userID, limit, mode)
		if err != nil {
			logger.Error("list_sessions.failed", "err", err, "user", userID)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to list sessions")
			return
		}
		out := make([]sessionListItem, 0, len(rows))
		for _, row := range rows {
			item := sessionListItem{
				SessionID:    row.ID.String(),
				TopicID:      row.TopicID.String(),
				Mode:         row.Mode,
				Strategy:     row.Strategy,
				Status:       row.Status,
				TargetCount:  row.TargetCount,
				ServedCount:  row.ServedCount,
				CorrectCount: row.CorrectCount,
				StartedAt:    row.StartedAt,
				SubmittedAt:  row.SubmittedAt,
			}
			if row.BlueprintID != nil {
				bp := row.BlueprintID.String()
				item.BlueprintID = &bp
			}
			out = append(out, item)
		}
		writeJSON(w, http.StatusOK, sessionListResponse{
			UserID: userIDStr,
			Items:  out,
		})
	}
}

func parseLimit(s string) (int, error) {
	var n int
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, errors.New("not a number")
		}
		n = n*10 + int(c-'0')
		if n > 1000 {
			return 1000, nil
		}
	}
	return n, nil
}

// loadActive parses the session id, loads it, and refuses if it's not
// IN_PROGRESS (or, if expired-but-not-yet-marked, marks it EXPIRED first).
// Returns false and writes a problem response on every failure path.
func (svc *SessionService) loadActive(w http.ResponseWriter, r *http.Request, logger *slog.Logger) (domain.Session, bool) {
	id, err := parseSessionID(r)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_session_id", err.Error())
		return domain.Session{}, false
	}
	sess, err := svc.store.GetSession(r.Context(), id)
	if errors.Is(err, store.ErrSessionNotFound) {
		writeProblem(w, http.StatusNotFound, "session_not_found", "No such session")
		return domain.Session{}, false
	}
	if err != nil {
		logger.Error("get_session.failed", "err", err)
		writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load session")
		return domain.Session{}, false
	}
	if sess.Status == domain.StatusInProgress && sess.IsExpired(svc.clock()) {
		_ = svc.store.MarkExpired(r.Context(), sess.ID)
		sess.Status = domain.StatusExpired
	}
	if sess.Status != domain.StatusInProgress {
		writeProblem(w, http.StatusConflict, "session_"+strings.ToLower(string(sess.Status)),
			"Session is "+string(sess.Status))
		return sess, false
	}
	return sess, true
}

// ── P6-S54 — Post-session calibration feedback ──────────────────────

type calibrationPatchRequest struct {
	Feedback string `json:"feedback"`
}

type calibrationPatchResponse struct {
	SessionID            string `json:"sessionId"`
	CalibrationFeedback  string `json:"calibrationFeedback"`
}

// normalizeCalibrationFeedback coerces the client value against the
// CHECK constraint enum. Empty / unknown → error (caller-side typo
// shouldn't silently write 'right').
func normalizeCalibrationFeedback(v string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "too_easy":
		return "too_easy", true
	case "right":
		return "right", true
	case "too_hard":
		return "too_hard", true
	}
	return "", false
}

// PatchCalibration handles PATCH /quiz/sessions/{id}/calibration.
// Writes a single string to quiz_sessions.calibration_feedback. The
// session must be SUBMITTED, EXPIRED, or IN_PROGRESS — calibration
// is a post-session signal but we accept it on in-flight sessions
// too so the student doesn't have to wait for the submit round-trip.
func (svc *SessionService) PatchCalibration(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := parseSessionID(r)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_session_id", err.Error())
			return
		}
		var req calibrationPatchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeProblem(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return
		}
		feedback, ok := normalizeCalibrationFeedback(req.Feedback)
		if !ok {
			writeProblem(w, http.StatusBadRequest, "invalid_feedback",
				"feedback must be one of too_easy | right | too_hard")
			return
		}
		// Confirm the session exists. We don't gate on status — the
		// student should be able to record calibration mid-quiz if they
		// already know how the round feels.
		_, err = svc.store.GetSession(r.Context(), id)
		if errors.Is(err, store.ErrSessionNotFound) {
			writeProblem(w, http.StatusNotFound, "session_not_found", "No such session")
			return
		}
		if err != nil {
			logger.Error("get_session.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load session")
			return
		}
		if err := svc.store.SetCalibrationFeedback(r.Context(), id, feedback); err != nil {
			logger.Error("set_calibration.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to record calibration")
			return
		}
		writeJSON(w, http.StatusOK, calibrationPatchResponse{
			SessionID:           id.String(),
			CalibrationFeedback: feedback,
		})
	}
}

func parseSessionID(r *http.Request) (uuid.UUID, error) {
	raw := r.PathValue("id")
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, errors.New("session id must be a UUID")
	}
	return id, nil
}

// ── Phase 1D-7 — Batch user mock summaries (for national rank) ───────

type batchMockReq struct {
	UserIDs []string `json:"userIds"`
}

type batchMockRespRow struct {
	UserID      string  `json:"userId"`
	AvgScorePct float64 `json:"avgScorePct"`
	NMocks      int     `json:"nMocks"`
}

// BatchUserMockSummaries handles POST /quiz/internal/users/mock-summaries
// with a JSON body of {"userIds": [...]}. Returns one row per user that
// has at least one submitted mock; users with no mocks are absent.
func (svc *SessionService) BatchUserMockSummaries(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req batchMockReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeProblem(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return
		}
		if len(req.UserIDs) == 0 {
			writeJSON(w, http.StatusOK, map[string]any{"items": []any{}})
			return
		}
		if len(req.UserIDs) > 5000 {
			writeProblem(w, http.StatusBadRequest, "too_many", "max 5000 user ids per call")
			return
		}
		ids := make([]uuid.UUID, 0, len(req.UserIDs))
		for _, s := range req.UserIDs {
			id, err := uuid.Parse(s)
			if err == nil {
				ids = append(ids, id)
			}
		}
		summaries, err := svc.store.BatchUserMockSummaries(r.Context(), ids)
		if err != nil {
			logger.Error("batch_mock_summaries.failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to aggregate")
			return
		}
		out := make([]batchMockRespRow, 0, len(summaries))
		for _, s := range summaries {
			out = append(out, batchMockRespRow{
				UserID:      s.UserID.String(),
				AvgScorePct: s.AvgScorePct,
				NMocks:      s.NMocks,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": out})
	}
}

// awardXP fires a best-effort POST to engagement's gamification endpoint.
// Errors are logged but never bubble up to the user-facing flow.
func (svc *SessionService) awardXP(_ context.Context, logger *slog.Logger, userID, eventType, sourceID string) {
	if svc.engagementURL == "" {
		return
	}
	go func() {
		body := map[string]any{"eventType": eventType}
		if sourceID != "" {
			body["sourceId"] = sourceID
		}
		buf, err := json.Marshal(body)
		if err != nil {
			return
		}
		url := svc.engagementURL + "/gamification/users/" + userID + "/xp"
		c, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(c, http.MethodPost, url, bytes.NewReader(buf))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			logger.Warn("xp_award.failed", "err", err, "event", eventType, "user", userID)
			return
		}
		_ = resp.Body.Close()
	}()
}

// ── Phase 1D-1 — Per-question time deep-dive ─────────────────────────

type perQuestionTimeItem struct {
	ItemIdx     int16    `json:"itemIdx"`
	QuestionID  string   `json:"questionId"`
	SectionID   *string  `json:"sectionId,omitempty"`
	TimeSeconds *float32 `json:"timeSeconds"`
	IsCorrect   *bool    `json:"isCorrect"`
	AnswerIdx   *int16   `json:"answerIdx"`
	CorrectIdx  int16    `json:"correctIdx"`
	DifficultyB float32  `json:"difficultyB"`
	TopicID     string   `json:"topicId"`
}

type perQuestionTimeResponse struct {
	SessionID string                `json:"sessionId"`
	Items     []perQuestionTimeItem `json:"items"`
}

// PerQuestionTime returns per-question detail for a session: time, correctness,
// section, difficulty. Used by the post-test deep-dive page on web-student.
func (svc *SessionService) PerQuestionTime(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sid, err := parseSessionID(r)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_session_id", err.Error())
			return
		}
		details, err := svc.store.SessionItemDetails(r.Context(), sid)
		if err != nil {
			logger.Error("per_question_time.fetch_failed", "err", err, "session", sid)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to fetch session items")
			return
		}
		out := perQuestionTimeResponse{SessionID: sid.String(), Items: make([]perQuestionTimeItem, 0, len(details))}
		for _, d := range details {
			out.Items = append(out.Items, perQuestionTimeItem{
				ItemIdx:     d.ItemIdx,
				QuestionID:  d.QuestionID.String(),
				SectionID:   d.SectionID,
				TimeSeconds: d.TimeSeconds,
				IsCorrect:   d.IsCorrect,
				AnswerIdx:   d.AnswerIdx,
				CorrectIdx:  d.CorrectIdx,
				DifficultyB: d.DifficultyB,
				TopicID:     d.TopicID.String(),
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// ── Phase 1C — Mistake Replay ─────────────────────────────────────────

type mistakeReplayRequest struct {
	UserID   string `json:"userId"`
	TopicID  string `json:"topicId,omitempty"`
	TenantID string `json:"tenantId,omitempty"`
	Limit    int    `json:"limit,omitempty"`
	// SinceDays narrows the replay to mistakes answered in the last N
	// days. 0 = no time filter (all-time most recent). Capped at 365.
	SinceDays int `json:"sinceDays,omitempty"`
}

type mistakeReplayResponse struct {
	SessionID  string    `json:"sessionId"`
	Mode       string    `json:"mode"`
	Status     string    `json:"status"`
	ExpiresAt  time.Time `json:"expiresAt"`
	ItemCount  int       `json:"itemCount"`
	TopicID    string    `json:"topicId,omitempty"`
	ReplayKind string    `json:"replayKind"`
}

// StartMistakeReplay opens a PRACTICE-mode session pre-seeded with the
// user's most recent wrong-answered questions. Optional topicId narrows
// the replay to a single topic. Limit defaults to 10, capped at 30.
func (svc *SessionService) StartMistakeReplay(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req mistakeReplayRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeProblem(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return
		}
		if req.UserID == "" {
			writeProblem(w, http.StatusBadRequest, "missing_field", "userId is required")
			return
		}
		userID, err := uuid.Parse(req.UserID)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_user_id", "userId must be a UUID")
			return
		}
		topicID := uuid.Nil
		if req.TopicID != "" {
			tid, perr := uuid.Parse(req.TopicID)
			if perr != nil {
				writeProblem(w, http.StatusBadRequest, "invalid_topic_id", "topicId must be a UUID")
				return
			}
			topicID = tid
		}
		limit := req.Limit
		if limit <= 0 {
			limit = 10
		}
		if limit > 30 {
			limit = 30
		}
		sinceDays := req.SinceDays
		if sinceDays < 0 {
			sinceDays = 0
		}
		if sinceDays > 365 {
			sinceDays = 365
		}

		items, err := svc.store.UserWrongQuestions(r.Context(), userID, topicID, limit, sinceDays)
		if err != nil {
			logger.Error("mistake_replay.fetch_failed", "err", err, "user", userID)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load wrong-answered history")
			return
		}
		if len(items) == 0 {
			writeProblem(w, http.StatusUnprocessableEntity, "no_mistakes",
				"No wrong-answered questions yet — answer a few practice items first")
			return
		}

		sessionTopic := topicID
		if sessionTopic == uuid.Nil {
			sessionTopic = items[0].TopicID
		}

		now := svc.clock()
		sess := domain.Session{
			ID:          uuid.New(),
			UserID:      userID,
			TenantID:    req.TenantID,
			TopicID:     sessionTopic,
			Mode:        domain.ModePractice,
			Strategy:    domain.StrategyBinarySearch,
			Status:      domain.StatusInProgress,
			TargetCount: int16(len(items)),
			StartedAt:   now,
			ExpiresAt:   now.Add(svc.sessionTTL),
		}
		if err := svc.store.CreateSession(r.Context(), sess); err != nil {
			logger.Error("mistake_replay.create_failed", "err", err)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to create session")
			return
		}

		for idx, it := range items {
			if err := svc.store.ServeQuestion(
				r.Context(), sess.ID, int16(idx), it.QuestionID, now,
			); err != nil {
				logger.Error("mistake_replay.preserve_failed",
					"err", err, "session", sess.ID, "idx", idx)
				writeProblem(w, http.StatusInternalServerError, "store_error",
					"Failed to seed replay items")
				return
			}
		}

		// Phase 1D-9 — fire-and-forget XP award for mistake replay.
		svc.awardXP(r.Context(), logger, userID.String(), "mistake_replay", sess.ID.String())

		writeJSON(w, http.StatusCreated, mistakeReplayResponse{
			SessionID:  sess.ID.String(),
			Mode:       string(sess.Mode),
			Status:     string(sess.Status),
			ExpiresAt:  sess.ExpiresAt,
			ItemCount:  len(items),
			TopicID:    sess.TopicID.String(),
			ReplayKind: "MISTAKE_REPLAY",
		})
	}
}
