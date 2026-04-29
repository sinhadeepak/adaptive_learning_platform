// Package learning is a thin HTTP client for the alp-learning service.
//
// Sprint 23 (P4-S23) — Quiz needs to fetch a composed paper when starting a
// MOCK_BLUEPRINT-mode session. The client forwards the inbound bearer so
// alp-learning's auth runs against the same JWT.
package learning

import (
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
