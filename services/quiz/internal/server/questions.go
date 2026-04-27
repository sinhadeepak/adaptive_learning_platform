// Lightweight read endpoint surfacing the question bank for downstream
// consumers (Adaptive Engine's photo-doubt similar-problems retrieval, etc.).
//
// Public read for now — the question stem + choices are already served to
// every authenticated student in /quiz/sessions/{id}/next. JWT-gating can be
// added without a wire-format change when we tighten access in staging.

package server

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/google/uuid"
)

type questionDTO struct {
	ID         string   `json:"id"`
	TopicID    string   `json:"topicId"`
	Stem       string   `json:"stem"`
	Choices    []string `json:"choices"`
	CorrectIdx int16    `json:"correctIdx"`
	Difficulty float32  `json:"difficultyB"`
	Language   string   `json:"language"`
}

type questionsResponse struct {
	Items []questionDTO `json:"items"`
}

type answeredItemDTO struct {
	SessionID  string  `json:"sessionId"`
	ItemIdx    int16   `json:"itemIdx"`
	QuestionID string  `json:"questionId"`
	TopicID    string  `json:"topicId"`
	Stem       string  `json:"stem"`
	AnswerIdx  int16   `json:"answerIdx"`
	CorrectIdx int16   `json:"correctIdx"`
	IsCorrect  bool    `json:"isCorrect"`
	Difficulty float32 `json:"difficultyB"`
	AnsweredAt string  `json:"answeredAt"`
}

type answeredItemsResponse struct {
	UserID string            `json:"userId"`
	Items  []answeredItemDTO `json:"items"`
}

// ListQuestions returns published questions filtered by topic. Used by
// Adaptive Engine to retrieve similar-problem candidates after a photo-OCR
// doubt resolution. limit defaults to 5, capped at 20.
func (svc *SessionService) ListQuestions(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		topicIDStr := r.URL.Query().Get("topicId")
		if topicIDStr == "" {
			writeProblem(w, http.StatusBadRequest, "missing_field", "topicId is required")
			return
		}
		topicID, err := uuid.Parse(topicIDStr)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_topic_id", "topicId must be a UUID")
			return
		}
		limit := 5
		if l := r.URL.Query().Get("limit"); l != "" {
			if n, perr := strconv.Atoi(l); perr == nil && n > 0 {
				limit = n
			}
		}
		if limit > 20 {
			limit = 20
		}

		questions, err := svc.store.ListQuestionsByTopic(r.Context(), topicID, limit)
		if err != nil {
			logger.Error("list_questions.failed", "err", err, "topic", topicID)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to list questions")
			return
		}
		out := make([]questionDTO, 0, len(questions))
		for _, q := range questions {
			out = append(out, questionDTO{
				ID:         q.ID.String(),
				TopicID:    q.TopicID.String(),
				Stem:       q.Stem,
				Choices:    q.Choices,
				CorrectIdx: q.CorrectIdx,
				Difficulty: q.DifficultyB,
				Language:   q.Language,
			})
		}
		writeJSON(w, http.StatusOK, questionsResponse{Items: out})
	}
}

// UserAnsweredItems returns the most recent answered items for a user across
// all sessions, joined with question content. Used by Adaptive Engine's
// cross-topic weakness diagnosis to feed the LLM real wrong-answer evidence.
//
// Default limit 50, capped at 200. Local stack: no auth check; in production
// add JWT scoping (caller must match userId or be a moderator+).
func (svc *SessionService) UserAnsweredItems(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userIDStr := r.PathValue("userId")
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid_user_id", "userId must be a UUID")
			return
		}
		limit := 50
		if l := r.URL.Query().Get("limit"); l != "" {
			if n, perr := strconv.Atoi(l); perr == nil && n > 0 {
				limit = n
			}
		}
		if limit > 200 {
			limit = 200
		}

		rows, err := svc.store.UserAnsweredItems(r.Context(), userID, limit)
		if err != nil {
			logger.Error("user_answered_items.failed", "err", err, "user", userID)
			writeProblem(w, http.StatusInternalServerError, "store_error", "Failed to load history")
			return
		}
		out := make([]answeredItemDTO, 0, len(rows))
		for _, row := range rows {
			answeredAt := ""
			if row.AnsweredAt != nil {
				answeredAt = row.AnsweredAt.Format("2006-01-02T15:04:05Z")
			}
			out = append(out, answeredItemDTO{
				SessionID:  row.SessionID.String(),
				ItemIdx:    row.ItemIdx,
				QuestionID: row.QuestionID.String(),
				TopicID:    row.TopicID.String(),
				Stem:       row.Stem,
				AnswerIdx:  row.AnswerIdx,
				CorrectIdx: row.CorrectIdx,
				IsCorrect:  row.IsCorrect,
				Difficulty: row.DifficultyB,
				AnsweredAt: answeredAt,
			})
		}
		writeJSON(w, http.StatusOK, answeredItemsResponse{UserID: userID.String(), Items: out})
	}
}
