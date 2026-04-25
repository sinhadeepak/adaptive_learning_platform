// Package adaptive is the HTTP client Quiz uses to talk to the Adaptive Engine
// when a session's strategy resolves to "irt".
package adaptive

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client is the narrow interface SessionService depends on. Tests inject a stub.
type Client interface {
	Ability(ctx context.Context, req AbilityRequest) (AbilityResponse, error)
	SelectNext(ctx context.Context, req SelectNextRequest) (SelectNextResponse, error)
}

type IRTItem struct {
	A float32 `json:"a"`
	B float32 `json:"b"`
	C float32 `json:"c"`
}

type ResponseDTO struct {
	IRTItem
	IsCorrect bool `json:"is_correct"`
}

type CandidateDTO struct {
	IRTItem
	ID string `json:"id"`
}

type AbilityRequest struct {
	Responses []ResponseDTO `json:"responses"`
	PriorMean float32       `json:"prior_mean"`
	PriorSD   float32       `json:"prior_sd"`
}

type AbilityResponse struct {
	Theta float32 `json:"theta"`
	SE    float32 `json:"se"`
	N     int     `json:"n"`
}

type SelectNextRequest struct {
	Theta         float32        `json:"theta"`
	Candidates    []CandidateDTO `json:"candidates"`
	Exclude       []string       `json:"exclude,omitempty"`
	ExposureCount map[string]int `json:"exposure_count,omitempty"`
	ExposureCap   int            `json:"exposure_cap,omitempty"`
}

type SelectNextResponse struct {
	ItemID     *string `json:"item_id"`
	FisherInfo float32 `json:"fisher_info"`
	ThetaUsed  float32 `json:"theta_used"`
}

// HTTPClient implements Client over plain HTTP.
type HTTPClient struct {
	baseURL string
	http    *http.Client
}

func NewHTTPClient(baseURL string, timeout time.Duration) *HTTPClient {
	return &HTTPClient{
		baseURL: baseURL,
		http:    &http.Client{Timeout: timeout},
	}
}

func (c *HTTPClient) Ability(ctx context.Context, req AbilityRequest) (AbilityResponse, error) {
	var out AbilityResponse
	return out, c.post(ctx, "/irt/ability", req, &out)
}

func (c *HTTPClient) SelectNext(ctx context.Context, req SelectNextRequest) (SelectNextResponse, error) {
	var out SelectNextResponse
	return out, c.post(ctx, "/irt/select-next", req, &out)
}

func (c *HTTPClient) post(ctx context.Context, path string, body, out any) error {
	buf, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("post %s: %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		preview, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("post %s: %d %s", path, resp.StatusCode, string(preview))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
