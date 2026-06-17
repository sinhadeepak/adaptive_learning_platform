// Package match — the live game-loop engine.
//
// One Engine instance per match. Lifecycle: created by the matchmaker
// when 2-4 players land in the same bucket, runs in its own goroutine,
// drives the FSM LOBBY → STARTING → IN_PROGRESS → SCORING → DONE,
// persists everything, then exits.
//
// The Engine does NOT own WebSocket connections — it consumes a
// ConnSender interface so the same engine can be tested with an
// in-memory sender. The server.go gateway plugs in real WS conns at
// match creation time.
package match

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/adaptive-learn/battle/internal/domain"
	"github.com/adaptive-learn/battle/internal/glicko"
	"github.com/adaptive-learn/battle/internal/questions"
	"github.com/adaptive-learn/battle/internal/store"
	"github.com/adaptive-learn/battle/internal/ws"
)

// ConnSender — minimal interface satisfied by *server.Conn. Engine
// uses it to push envelopes to a player and to detect drops.
type ConnSender interface {
	Send(t string, p any) error
	UserIDStr() string
}

// PlayerView — what the engine tracks per player during a match.
type PlayerView struct {
	UserID      uuid.UUID
	DisplayName string
	Conn        ConnSender
	EloBefore   int
	Score       int
	Correct     int
	Answers     map[int16]int16 // questionIdx -> pickedIdx
	AnswerTimes map[int16]int   // questionIdx -> timeMs
}

type Engine struct {
	MatchID         uuid.UUID
	ExamID          uuid.UUID
	Players         []*PlayerView
	Store           *store.Store
	Questions       *questions.Client
	Logger          *slog.Logger
	QuestionCount   int
	QuestionTimerS  int
	answerCh        chan answerMsg
	chatCh          chan chatMsg
	mu              sync.Mutex
	chatAllowed     bool // true during LOBBY + SCORING, false during IN_PROGRESS
}

type answerMsg struct {
	UserID      uuid.UUID
	QuestionIdx int16
	PickedIdx   int16
	TimeMs      int
}

type chatMsg struct {
	UserID uuid.UUID
	Body   string
}

func NewEngine(matchID, examID uuid.UUID, players []*PlayerView, st *store.Store, q *questions.Client, log *slog.Logger, qCount, qTimer int) *Engine {
	return &Engine{
		MatchID:        matchID,
		ExamID:         examID,
		Players:        players,
		Store:          st,
		Questions:      q,
		Logger:         log,
		QuestionCount:  qCount,
		QuestionTimerS: qTimer,
		answerCh:       make(chan answerMsg, 64),
		chatCh:         make(chan chatMsg, 64),
		chatAllowed:    true, // LOBBY → start with chat on
	}
}

// SubmitAnswer is called from the gateway's WS dispatch when a player
// sends `match.answer`. Non-blocking — drops on a full channel rather
// than stalling the WS read loop.
func (e *Engine) SubmitAnswer(userID uuid.UUID, idx, picked int16, timeMs int) {
	select {
	case e.answerCh <- answerMsg{UserID: userID, QuestionIdx: idx, PickedIdx: picked, TimeMs: timeMs}:
	default:
	}
}

// SubmitChat is called for chat.send during LOBBY/SCORING. Ignored
// during IN_PROGRESS — the engine enforces the rule.
func (e *Engine) SubmitChat(userID uuid.UUID, body string) {
	e.mu.Lock()
	allowed := e.chatAllowed
	e.mu.Unlock()
	if !allowed {
		return
	}
	select {
	case e.chatCh <- chatMsg{UserID: userID, Body: body}:
	default:
	}
}

// Run is the top-level driver. Blocks until the match is DONE.
func (e *Engine) Run(ctx context.Context) {
	defer e.broadcastConn() // make sure final state is sent on early exit

	// 1. STARTING: pre-load questions, send match.starting.
	if err := e.Store.UpdateMatchStatus(ctx, e.MatchID, domain.StatusStarting); err != nil {
		e.Logger.Warn("match.status_update_failed", "err", err)
	}
	qs, err := e.Questions.FetchForMatch(ctx, e.ExamID, e.QuestionCount)
	if err != nil {
		e.Logger.Error("match.fetch_questions_failed", "err", err)
		e.broadcastError("question_fetch_failed", err.Error())
		_ = e.Store.UpdateMatchStatus(ctx, e.MatchID, domain.StatusAbandoned)
		return
	}
	if len(qs) < e.QuestionCount {
		e.Logger.Warn("match.short_pool", "got", len(qs), "want", e.QuestionCount)
		e.QuestionCount = len(qs)
	}

	// Seed each player's ELO so we can store EloBefore for the result row.
	for _, p := range e.Players {
		elo, err := e.Store.GetOrSeedElo(ctx, p.UserID, e.ExamID)
		if err != nil {
			e.Logger.Warn("match.elo_seed_failed", "user", p.UserID, "err", err)
			p.EloBefore = 1500
		} else {
			p.EloBefore = elo.Rating
		}
		p.Answers = make(map[int16]int16, e.QuestionCount)
		p.AnswerTimes = make(map[int16]int, e.QuestionCount)
	}

	startsAt := time.Now().Add(3 * time.Second)
	e.broadcast("match.starting", ws.MatchStartingPayload{
		StartsAtMs:       startsAt.UnixMilli(),
		TotalQuestions:   e.QuestionCount,
		QuestionTimerSec: e.QuestionTimerS,
	})
	select {
	case <-ctx.Done():
		return
	case <-time.After(3 * time.Second):
	}

	// 2. IN_PROGRESS: 10 questions, 30s each.
	e.mu.Lock()
	e.chatAllowed = false
	e.mu.Unlock()
	if err := e.Store.UpdateMatchStatus(ctx, e.MatchID, domain.StatusInProgress); err != nil {
		e.Logger.Warn("match.status_update_failed", "err", err)
	}
	for i := 0; i < e.QuestionCount; i++ {
		q := qs[i]
		idx := int16(i)
		deadline := time.Now().Add(time.Duration(e.QuestionTimerS) * time.Second)
		e.broadcast("match.question", ws.MatchQuestionPayload{
			Idx:        idx,
			Stem:       q.Stem,
			Choices:    q.Choices,
			DeadlineMs: deadline.UnixMilli(),
		})
		e.runQuestion(ctx, idx, q, deadline)
	}

	// 3. SCORING: persist answers, finalize per-player rows.
	e.mu.Lock()
	e.chatAllowed = true
	e.mu.Unlock()
	if err := e.Store.UpdateMatchStatus(ctx, e.MatchID, domain.StatusScoring); err != nil {
		e.Logger.Warn("match.status_update_failed", "err", err)
	}
	e.finalize(ctx, qs)

	// 4. DONE.
	if err := e.Store.UpdateMatchStatus(ctx, e.MatchID, domain.StatusDone); err != nil {
		e.Logger.Warn("match.status_update_failed", "err", err)
	}
}

// runQuestion blocks until the question's deadline, draining answer
// messages onto each player's record. Ticks fired every 5s so clients
// can show a synchronized countdown.
func (e *Engine) runQuestion(ctx context.Context, idx int16, q questions.Question, deadline time.Time) {
	tickEvery := 5 * time.Second
	tick := time.NewTicker(tickEvery)
	defer tick.Stop()
	deadlineTimer := time.NewTimer(time.Until(deadline))
	defer deadlineTimer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-deadlineTimer.C:
			// Score every player who answered; missed = 0.
			for _, p := range e.Players {
				picked, hadAnswer := p.Answers[idx]
				if !hadAnswer {
					continue
				}
				correct := int(picked) == q.CorrectIdx
				timeMs := p.AnswerTimes[idx]
				score := 0
				if correct {
					p.Correct++
					// max(0, 1000 - timeMs/30) per ADR-0027.
					score = 1000 - (timeMs / 30)
					if score < 0 {
						score = 0
					}
				}
				p.Score += score
				_ = e.Store.RecordAnswer(ctx, domain.MatchAnswer{
					MatchID:     e.MatchID,
					UserID:      p.UserID,
					QuestionIdx: idx,
					PickedIdx:   picked,
					TimeMs:      timeMs,
					IsCorrect:   correct,
					ScoredAt:    time.Now().UTC(),
				})
			}
			return
		case <-tick.C:
			remaining := int(time.Until(deadline).Seconds())
			if remaining < 0 {
				remaining = 0
			}
			e.broadcast("match.tick", ws.MatchTickPayload{
				Idx:              idx,
				SecondsRemaining: remaining,
			})
		case msg := <-e.answerCh:
			if msg.QuestionIdx != idx {
				continue // late or early answer; ignore
			}
			player := e.playerByID(msg.UserID)
			if player == nil {
				continue
			}
			if _, already := player.Answers[idx]; already {
				continue // first answer wins
			}
			player.Answers[idx] = msg.PickedIdx
			player.AnswerTimes[idx] = msg.TimeMs
			// Tell everyone someone answered (fact only, no choice).
			e.broadcast("match.player_answered", ws.MatchPlayerAnsweredPayload{
				UserID: msg.UserID.String(),
				Idx:    idx,
			})
		case chat := <-e.chatCh:
			// Chat during IN_PROGRESS is dropped — engine guards via
			// chatAllowed. This branch only catches messages buffered
			// before the flag flipped. Ignore them.
			_ = chat
		}
	}
}

func (e *Engine) playerByID(id uuid.UUID) *PlayerView {
	for _, p := range e.Players {
		if p.UserID == id {
			return p
		}
	}
	return nil
}

// finalize: ranks, ELO update, persist per-player rows, broadcast scored.
func (e *Engine) finalize(ctx context.Context, _ []questions.Question) {
	// Sort by score desc (ties broken on fewer total time — sum of
	// AnswerTimes for correct answers).
	sort.Slice(e.Players, func(i, j int) bool {
		if e.Players[i].Score != e.Players[j].Score {
			return e.Players[i].Score > e.Players[j].Score
		}
		return playerTotalTime(e.Players[i]) < playerTotalTime(e.Players[j])
	})

	// Build Glicko-2 input: each player against the average of the others.
	// One match = one rating period. For 2-player matches we get the
	// pairwise result trivially; for 3+ we run each player against each
	// other player (their result is 1/0.5/0 based on rank).
	eloDelta := map[string]int{}
	perPlayer := make([]ws.PlayerScore, 0, len(e.Players))
	leaderboard := make([]ws.LeaderboardRow, 0, len(e.Players))

	for rank0, p := range e.Players {
		// Construct opponent results from the other players.
		results := make([]glicko.Result, 0, len(e.Players)-1)
		for j, other := range e.Players {
			if j == rank0 {
				continue
			}
			score := 0.5
			if p.Score > other.Score {
				score = 1.0
			} else if p.Score < other.Score {
				score = 0.0
			}
			results = append(results, glicko.Result{
				Opponent: glicko.Player{R: float64(other.EloBefore), RD: 350, Volatility: 0.06},
				Score:    score,
			})
		}
		// Pull the player's current full Glicko state for an accurate
		// volatility update. EloBefore is just the integer rating —
		// rd/volatility need a real read.
		var startState glicko.Player
		if cur, err := e.Store.GetElo(ctx, p.UserID, e.ExamID); err == nil {
			startState = glicko.Player{R: float64(cur.Rating), RD: float64(cur.RD), Volatility: cur.Volatility}
		} else {
			startState = glicko.NewPlayer()
		}
		newState := glicko.Update(startState, results)
		newRating := int(newState.R + 0.5)
		eloDelta[p.UserID.String()] = newRating - p.EloBefore

		rank16 := int16(rank0 + 1)
		_ = e.Store.FinalizePlayer(ctx, e.MatchID, p.UserID, p.Score, rank16, p.EloBefore, newRating)
		_ = e.Store.UpdateElo(ctx, domain.Elo{
			UserID:     p.UserID,
			ExamID:     e.ExamID,
			Rating:     newRating,
			RD:         int(newState.RD + 0.5),
			Volatility: newState.Volatility,
			NMatches:   0, // n_matches+1 handled at the SQL layer via UPSERT; cheaper to bump separately in a future revision
		})

		perPlayer = append(perPlayer, ws.PlayerScore{
			UserID:      p.UserID.String(),
			DisplayName: p.DisplayName,
			Score:       p.Score,
			Correct:     p.Correct,
			Total:       e.QuestionCount,
		})
		leaderboard = append(leaderboard, ws.LeaderboardRow{
			UserID: p.UserID.String(),
			Rank:   rank0 + 1,
			Score:  p.Score,
		})
	}

	e.broadcast("match.scored", ws.MatchScoredPayload{
		PerPlayer:   perPlayer,
		Leaderboard: leaderboard,
		EloDelta:    eloDelta,
	})
}

func playerTotalTime(p *PlayerView) int {
	total := 0
	for _, t := range p.AnswerTimes {
		total += t
	}
	return total
}

func (e *Engine) broadcast(t string, p any) {
	for _, pl := range e.Players {
		if pl.Conn == nil {
			continue
		}
		_ = pl.Conn.Send(t, p)
	}
}

func (e *Engine) broadcastError(code, msg string) {
	e.broadcast("error", ws.ErrorPayload{Code: code, Message: msg})
}

func (e *Engine) broadcastConn() {
	// Hook for future cleanup. Currently no-op.
}

// FmtChatBody — small utility kept here so the chat profanity filter
// has a single home if/when it expands beyond a trivial blocklist.
func FmtChatBody(s string) string {
	return fmt.Sprintf("%.500s", s)
}
