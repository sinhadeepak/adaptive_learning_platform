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

	"github.com/adaptive-learn/quiz/internal/domain"
	"github.com/adaptive-learn/quiz/internal/store"
)

// SessionService coordinates the FSM around sessions: creation, next-question
// selection, idempotent answer recording, expiry, and submit.
type SessionService struct {
	store      *store.Store
	flags      FlagEvaluator
	clock      func() time.Time
	sessionTTL time.Duration
	target     int16
}

func NewSessionService(s *store.Store, flags FlagEvaluator, ttl time.Duration) *SessionService {
	return &SessionService{
		store:      s,
		flags:      flags,
		clock:      time.Now,
		sessionTTL: ttl,
		target:     10,
	}
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
		if mode != domain.ModePractice && mode != domain.ModeMock {
			writeProblem(w, http.StatusBadRequest, "invalid_mode", "mode must be PRACTICE or MOCK")
			return
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

		q, err := svc.store.PickNextQuestion(r.Context(), sess)
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
		if int(req.AnswerIdx) >= len(q.Choices) {
			writeProblem(w, http.StatusBadRequest, "invalid_answer", "answerIdx out of range for question choices")
			return
		}

		isCorrect := req.AnswerIdx == q.CorrectIdx
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

// nextAbility is a placeholder ability update — symmetrical step damped by
// the number of answered items. Replaced by the full 3PL IRT EAP/MAP
// estimator when SPIKE-01 lands.
func nextAbility(prev float32, isCorrect bool, served int16) float32 {
	step := float32(0.3) / float32(1+served/2)
	if !isCorrect {
		step = -step
	}
	return prev + step
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
	ItemIdx    int16  `json:"itemIdx"`
	QuestionID string `json:"questionId"`
	AnswerIdx  *int16 `json:"answerIdx,omitempty"`
	IsCorrect  *bool  `json:"isCorrect,omitempty"`
	Answered   bool   `json:"answered"`
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
		summaries := make([]itemSummary, 0, len(items))
		for _, it := range items {
			summaries = append(summaries, itemSummary{
				ItemIdx:    it.ItemIdx,
				QuestionID: it.QuestionID.String(),
				AnswerIdx:  it.AnswerIdx,
				IsCorrect:  it.IsCorrect,
				Answered:   it.IsAnswered(),
			})
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
