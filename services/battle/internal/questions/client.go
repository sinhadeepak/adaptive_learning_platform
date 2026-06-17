// Package questions — thin HTTP client to fetch question bank items
// for a battle. Used by the match engine at game-start to pre-load
// the 10 questions before the LOBBY transitions to STARTING.
//
// Strategy: pick the catalog's "Mechanics" subject (or whatever's
// first under the exam) and call Quiz Go's /quiz/questions endpoint
// with a higher limit so we have slack to filter by difficulty.
package questions

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type Question struct {
	ID         uuid.UUID `json:"id"`
	TopicID    uuid.UUID `json:"topicId"`
	Stem       string    `json:"stem"`
	Choices    []string  `json:"choices"`
	CorrectIdx int       `json:"correctIdx"`
}

type Client struct {
	base       string
	learnBase  string
	httpClient *http.Client
}

func New(quizBase, learningBase string) *Client {
	return &Client{
		base:      quizBase,
		learnBase: learningBase,
		httpClient: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

// FetchForMatch returns `n` questions for the given exam. The MVP
// uses a single topic — match composition by blueprint is wired
// once the battle composer (S62) lands.
//
// Two-step fetch:
//  1. Learning catalog → exams/{id}/subjects → first subject's topics → pick 1.
//  2. Quiz /quiz/questions?topicId=…&limit=N*3 → shuffle, take N.
func (c *Client) FetchForMatch(ctx context.Context, examID uuid.UUID, n int) ([]Question, error) {
	topicID, err := c.firstTopicForExam(ctx, examID)
	if err != nil {
		return nil, fmt.Errorf("topic lookup: %w", err)
	}
	url := fmt.Sprintf("%s/quiz/questions?topicId=%s&limit=%d",
		c.base, topicID.String(), n*3)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("quiz GET: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("quiz %d: %s", resp.StatusCode, string(body))
	}
	var body struct {
		Items []struct {
			ID         string   `json:"id"`
			TopicID    string   `json:"topicId"`
			Stem       string   `json:"stem"`
			Choices    []string `json:"choices"`
			CorrectIdx int      `json:"correctIdx"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	if len(body.Items) == 0 {
		return nil, fmt.Errorf("no questions for exam %s", examID)
	}
	out := make([]Question, 0, len(body.Items))
	for _, it := range body.Items {
		qid, err := uuid.Parse(it.ID)
		if err != nil {
			continue
		}
		tid, _ := uuid.Parse(it.TopicID)
		out = append(out, Question{
			ID:         qid,
			TopicID:    tid,
			Stem:       it.Stem,
			Choices:    it.Choices,
			CorrectIdx: it.CorrectIdx,
		})
	}
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	rng.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	if len(out) > n {
		out = out[:n]
	}
	return out, nil
}

type subjectRow struct {
	ID string `json:"id"`
}

type topicRow struct {
	ID             string `json:"id"`
	QuestionCount  int    `json:"questionCount"`
	IsPublished    bool   `json:"isPublished"`
}

func (c *Client) firstTopicForExam(ctx context.Context, examID uuid.UUID) (uuid.UUID, error) {
	// /catalog/exams/{id}/subjects
	subjURL := fmt.Sprintf("%s/catalog/exams/%s/subjects", c.learnBase, examID.String())
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, subjURL, nil)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return uuid.Nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return uuid.Nil, fmt.Errorf("subjects %d", resp.StatusCode)
	}
	var subjects []subjectRow
	if err := json.NewDecoder(resp.Body).Decode(&subjects); err != nil {
		return uuid.Nil, err
	}
	for _, sj := range subjects {
		topicURL := fmt.Sprintf("%s/catalog/subjects/%s/topics", c.learnBase, sj.ID)
		req2, _ := http.NewRequestWithContext(ctx, http.MethodGet, topicURL, nil)
		resp2, err := c.httpClient.Do(req2)
		if err != nil {
			continue
		}
		var topics []topicRow
		_ = json.NewDecoder(resp2.Body).Decode(&topics)
		resp2.Body.Close()
		for _, t := range topics {
			if t.QuestionCount > 0 {
				return uuid.Parse(t.ID)
			}
		}
	}
	return uuid.Nil, fmt.Errorf("no topic with questions for exam %s", examID)
}
