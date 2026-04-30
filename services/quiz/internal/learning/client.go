// Package learning is a thin HTTP client for the alp-learning service.
//
// Sprint 23 (P4-S23) — Quiz needs to fetch a composed paper when starting a
// MOCK_BLUEPRINT-mode session. The client forwards the inbound bearer so
// alp-learning's auth runs against the same JWT.
package learning

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// ComposedPaperItem mirrors the alp-learning composer's per-item shape.
type ComposedPaperItem struct {
	Position   int       `json:"position"`
	SectionID  string    `json:"sectionId"`
	QuestionID uuid.UUID `json:"questionId"`
	TopicID    string    `json:"topicId"`
}

// ComposedPaperSection mirrors the per-section summary.
type ComposedPaperSection struct {
	SectionID  string `json:"sectionId"`
	Name       string `json:"name"`
	NRequested int    `json:"nRequested"`
	NComposed  int    `json:"nComposed"`
	Short      bool   `json:"short"`
}

// ComposedPaper is the composer's output shape returned over HTTP.
type ComposedPaper struct {
	BlueprintID              string                 `json:"blueprintId"`
	BlueprintName            string                 `json:"blueprintName"`
	TotalRequested           int                    `json:"totalRequested"`
	TotalComposed            int                    `json:"totalComposed"`
	TotalMinutes             int                    `json:"totalMinutes"`
	MarksCorrect             int                    `json:"marksCorrect"`
	MarksNegative            float64                `json:"marksNegative"`
	Short                    bool                   `json:"short"`
	InterSectionNavigation   bool                   `json:"interSectionNavigation"`
	PerSectionTimeLocked     bool                   `json:"perSectionTimeLocked"`
	Items                    []ComposedPaperItem    `json:"items"`
	Sections                 []ComposedPaperSection `json:"sections"`
}

var (
	// ErrBlueprintNotFound surfaces 404 from alp-learning.
	ErrBlueprintNotFound = errors.New("blueprint not found")
	// ErrEmptyPaper surfaces when the composer returns zero items —
	// content gate not yet met (parallel workstream W1 fills the bank).
	ErrEmptyPaper = errors.New("composed paper has no questions")
)

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

func New(baseURL string) *Client {
	return &Client{
		BaseURL: baseURL,
		HTTP:    &http.Client{Timeout: 5 * time.Second},
	}
}

// FetchComposedPaper calls POST /catalog/exam-blueprints/{id}/compose
// with userId + attemptIdx so the composer can derive a stable per-user
// per-attempt seed.
func (c *Client) FetchComposedPaper(
	ctx context.Context,
	bearerToken string,
	blueprintID uuid.UUID,
	userID uuid.UUID,
	attemptIdx int,
) (*ComposedPaper, error) {
	url := fmt.Sprintf(
		"%s/catalog/exam-blueprints/%s/compose?userId=%s&attemptIdx=%d",
		c.BaseURL, blueprintID, userID, attemptIdx,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call learning: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrBlueprintNotFound
	}
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("learning responded %d", resp.StatusCode)
	}
	var out ComposedPaper
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if len(out.Items) == 0 {
		return &out, ErrEmptyPaper
	}
	return &out, nil
}

// GradeRequest is the wire shape Quiz Go sends to alp-learning's
// /grading/grade endpoint for non-MCQ types per ADR-0018.
type GradeRequest struct {
	QuestionID   string                 `json:"question_id"`
	QuestionType string                 `json:"question_type"`
	Payload      map[string]interface{} `json:"payload"`
	Response     map[string]interface{} `json:"response"`
	Language     string                 `json:"language"`
}

// Resolution is the wire shape /grading/grade returns. Mirrors the
// Pydantic Resolution model; never carries marks (per ADR-0018).
type Resolution struct {
	QuestionID        string                 `json:"question_id"`
	TypeID            string                 `json:"type_id"`
	Status            string                 `json:"status"` // CORRECT|PARTIAL_CORRECT|INCORRECT|UNATTEMPTED|PENDING_HUMAN_REVIEW
	MatchedCount      int                    `json:"matched_count"`
	TotalCount        int                    `json:"total_count"`
	PerPart           []map[string]interface{} `json:"per_part"`
	EvaluationMode    string                 `json:"evaluation_mode"`
	EvaluatorMetadata map[string]interface{} `json:"evaluator_metadata"`
}

// GradeRemote calls POST /grading/grade for non-MCQ question types.
// Per ADR-0018: DETERMINISTIC types eligible for inline Go grading
// stay on the existing answer-idx-equality path; AI_ASSISTED / HYBRID
// / HUMAN types and any non-MCQ DETERMINISTIC type that lacks a Go
// port route here.
func (c *Client) GradeRemote(
	ctx context.Context,
	bearerToken string,
	questionID string,
	questionType string,
	payload map[string]interface{},
	response map[string]interface{},
	language string,
) (*Resolution, error) {
	if language == "" {
		language = "en"
	}
	body, err := json.Marshal(GradeRequest{
		QuestionID:   questionID,
		QuestionType: questionType,
		Payload:      payload,
		Response:     response,
		Language:     language,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal grade request: %w", err)
	}
	url := fmt.Sprintf("%s/grading/grade", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build grade request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call grading: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("grading responded %d", resp.StatusCode)
	}
	var out Resolution
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode grade response: %w", err)
	}
	return &out, nil
}
