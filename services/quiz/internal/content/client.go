// Package content is a thin HTTP client for the Content service.
//
// Sprint 12 S12-D — Quiz needs to fetch the educator-curated question
// list when starting an ASSIGNMENT-mode session. The client forwards
// the inbound bearer token so Content's existing auth (educator/student
// role gates + the not-published check) keeps working without a service
// account.
package content

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// AssignmentQuestion mirrors the Sprint 9 assignments_routes.py payload.
// We only consume the fields we need here.
type AssignmentQuestion struct {
	QuestionID uuid.UUID `json:"questionId"`
	Position   int       `json:"position"`
	TopicID    *uuid.UUID `json:"topicId,omitempty"`
}

// ErrAssignmentNotFound surfaces 404 from Content so the caller can
// translate it into a 404 on the from-assignment endpoint.
var ErrAssignmentNotFound = errors.New("assignment not found")

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

func New(baseURL string) *Client {
	return &Client{
		BaseURL: baseURL,
		HTTP:    &http.Client{Timeout: 3 * time.Second},
	}
}

// FetchAssignmentQuestions calls GET /content/assignments/{id}/questions
// using the inbound bearer so Content authorises against the same JWT.
//
// Returns ErrAssignmentNotFound on 404. Any other non-2xx is wrapped in
// a generic error — Quiz translates it into a 502 (we proxied a backend
// that misbehaved; not the user's fault).
func (c *Client) FetchAssignmentQuestions(
	ctx context.Context, bearerToken string, assignmentID uuid.UUID,
) ([]AssignmentQuestion, error) {
	req, err := http.NewRequestWithContext(
		ctx, http.MethodGet,
		fmt.Sprintf("%s/content/assignments/%s/questions", c.BaseURL, assignmentID),
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+bearerToken)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call content: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrAssignmentNotFound
	}
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("content responded %d", resp.StatusCode)
	}
	var out []AssignmentQuestion
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return out, nil
}
