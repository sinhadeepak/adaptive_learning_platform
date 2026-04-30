package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/adaptive-learn/quiz/internal/adaptive"
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

// resolveStrategy honours the irt_model_enabled flag; flag errors fall back to binary_search.
func (svc *SessionService) resolveStrategy(ctx context.Context, tenantID string) domain.Strategy {
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
		sess := domain.Session{
			ID:          uuid.New(),
			UserID:      userID,
			TenantID:    req.TenantID,
			TopicID:     topicID,
			Mode:        mode,
			Strategy:    svc.resolveStrategy(r.Context(), req.TenantID),
			Status:      domain.StatusInProgress,
			TargetCount: svc.target,
			StartedAt:   now,
			ExpiresAt:   now.Add(svc.sessionTTL),
		}
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

// Sprint 23 (P4-S23) — from-blueprint session creation.
type fromBlueprintRequest struct {
	BlueprintID string `json:"blueprintId"`
	UserID      string `json:"userId"`
	TenantID    string `json:"tenantId,omitempty"`
	AttemptIdx  int    `json:"attemptIdx,omitempty"`
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
			ID:          uuid.New(),
			UserID:      userID,
			TenantID:    req.TenantID,
			TopicID:     topicID,
			Mode:        domain.ModeMockBlueprint,
			Strategy:    domain.StrategyBinarySearch, // not used; pinned list
			Status:      domain.StatusInProgress,
			TargetCount: int16(len(paper.Items)),
			StartedAt:   now,
			ExpiresAt:   expiresAt,
			BlueprintID: &blueprintID,
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
}

// Next returns the current unanswered item if one is already served (resume
// semantics), otherwise serves the next question and records it.
func (svc *SessionService) Next(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sess, ok := svc.loadActive(w, r, logger)
		if !ok {
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
			q, err := svc.store.GetQuestion(r.Context(), current.QuestionID)
			if err != nil {
				logger.Error("get_question.failed", "err", err)
				writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load question")
				return
			}
			writeJSON(w, http.StatusOK, nextResponse{
				SessionID: sess.ID.String(),
				Status:    string(sess.Status),
				Item:      &itemDTO{ItemIdx: current.ItemIdx, QuestionID: q.ID.String(), Stem: q.Stem, Choices: q.Choices},
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
			Item:      &itemDTO{ItemIdx: nextIdx, QuestionID: q.ID.String(), Stem: q.Stem, Choices: q.Choices},
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
		q, err := svc.store.GetQuestion(r.Context(), item.QuestionID)
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
		if qtype == "MCQ_SINGLE" {
			if int(req.AnswerIdx) >= len(q.Choices) {
				writeProblem(w, http.StatusBadRequest, "invalid_answer",
					"answerIdx out of range for question choices")
				return
			}
			isCorrect = req.AnswerIdx == q.CorrectIdx
		} else {
			// Polymorphic types — Quiz Go only mirrors
			// choices/correct_idx; alp-learning is the source of truth
			// for the typed payload. Quiz Go submits an empty payload;
			// /grading/grade does id-based lookup against
			// content_schema.questions (P5-S50).
			if svc.learningClient == nil {
				writeProblem(w, http.StatusServiceUnavailable,
					"grading_unavailable",
					"Quiz Go has no learning client configured for non-MCQ grading")
				return
			}
			payload := map[string]any{} // empty -> grading service does id-based lookup (P5-S50)
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
func (svc *SessionService) pickNext(ctx context.Context, sess domain.Session, logger *slog.Logger) (domain.Question, error) {
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
	return svc.store.GetQuestion(ctx, chosenID)
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
		// When the session is SUBMITTED, hydrate each item with the question
		// content (stem + choices + correctIdx + explanation) so QuizResult can
		// render a real teaching moment without N round-trips. For active
		// sessions we still hide correctIdx/explanation to avoid leaking the
		// answer mid-quiz.
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
			if hydrate {
				if q, qerr := svc.store.GetQuestion(r.Context(), it.QuestionID); qerr == nil {
					s.Stem = q.Stem
					s.Choices = q.Choices
					ci := q.CorrectIdx
					s.CorrectIdx = &ci
					s.Explanation = q.Explanation
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

func parseSessionID(r *http.Request) (uuid.UUID, error) {
	raw := r.PathValue("id")
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, errors.New("session id must be a UUID")
	}
	return id, nil
}
