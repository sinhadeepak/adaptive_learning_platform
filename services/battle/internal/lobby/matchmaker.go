// Package lobby — ELO-bucket matchmaker.
//
// Players queue via WS `lobby.queue`. The matchmaker pools queued
// players by (examId, eloBand) where bands are 200pt wide. A match
// is formed when ≥2 players occupy the same band within 30s, or
// when widening across ±200 bands (after 30s) covers ≥2 players,
// or after 90s when widening becomes ±∞.
//
// The matchmaker runs a single goroutine that ticks every second
// over the pending queue. New queuers wait their turn in the next
// tick — keeps the data-structure simple (no per-player goroutines).
package lobby

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/adaptive-learn/battle/internal/domain"
)

// Queued — a player waiting in the lobby.
type Queued struct {
	UserID      uuid.UUID
	DisplayName string
	ExamID      uuid.UUID
	EloBand     int
	Rating      int
	QueuedAt    time.Time
	OnMatched   func(matchID uuid.UUID, peers []Queued) // called when matched
	OnExpired   func()                                  // called when timeout reached
}

type Matchmaker struct {
	mu               sync.Mutex
	pending          []*Queued
	widenAfter       time.Duration
	totalTimeout     time.Duration
	playersPerMatch  int
	tickInterval     time.Duration
	logger           *slog.Logger
	stop             chan struct{}
}

func New(widenAfterSec, totalTimeoutSec int, logger *slog.Logger) *Matchmaker {
	return &Matchmaker{
		widenAfter:      time.Duration(widenAfterSec) * time.Second,
		totalTimeout:    time.Duration(totalTimeoutSec) * time.Second,
		playersPerMatch: 2, // MVP: 2 players. 3-4 players ships with clan battles (F8b).
		tickInterval:    time.Second,
		logger:          logger,
		stop:            make(chan struct{}),
	}
}

// Start runs the tick loop. Returns when the context is cancelled.
func (m *Matchmaker) Start(ctx context.Context) {
	t := time.NewTicker(m.tickInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-m.stop:
			return
		case <-t.C:
			m.tick()
		}
	}
}

func (m *Matchmaker) Stop() {
	close(m.stop)
}

// Enqueue adds a player to the queue. Returns the ELO band so the
// client can be told where they're searching.
func (m *Matchmaker) Enqueue(q *Queued) {
	m.mu.Lock()
	defer m.mu.Unlock()
	// De-dupe: if the same user is already queued, replace their row.
	for i, existing := range m.pending {
		if existing.UserID == q.UserID {
			m.pending[i] = q
			m.logger.Info("matchmaker.enqueue",
				"user_id", q.UserID.String(),
				"exam_id", q.ExamID.String(),
				"rating", q.Rating,
				"band", q.EloBand,
				"replaced", true,
				"queue_size", len(m.pending))
			return
		}
	}
	m.pending = append(m.pending, q)
	m.logger.Info("matchmaker.enqueue",
		"user_id", q.UserID.String(),
		"exam_id", q.ExamID.String(),
		"rating", q.Rating,
		"band", q.EloBand,
		"replaced", false,
		"queue_size", len(m.pending))
}

// Cancel removes a player from the queue. No-op if not queued.
func (m *Matchmaker) Cancel(userID uuid.UUID) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := m.pending[:0]
	for _, p := range m.pending {
		if p.UserID != userID {
			out = append(out, p)
		}
	}
	m.pending = out
}

// tick scans the pending queue, expires timeouts, forms matches.
func (m *Matchmaker) tick() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()

	// Expire timed-out queuers first.
	expired := []*Queued{}
	keep := m.pending[:0]
	for _, p := range m.pending {
		if now.Sub(p.QueuedAt) >= m.totalTimeout {
			expired = append(expired, p)
		} else {
			keep = append(keep, p)
		}
	}
	m.pending = keep
	for _, p := range expired {
		if p.OnExpired != nil {
			go p.OnExpired()
		}
	}

	// Form matches. Iterate from oldest first.
	for {
		if len(m.pending) < m.playersPerMatch {
			return
		}
		// Pick the head player as the anchor.
		anchor := m.pending[0]
		band := domain.EloBand(anchor.Rating)
		// Bucket-widening: how many bands either side of `band` to allow.
		var widen int
		switch {
		case now.Sub(anchor.QueuedAt) < m.widenAfter:
			widen = 0
		case now.Sub(anchor.QueuedAt) < 3*m.widenAfter:
			widen = 1
		default:
			widen = 99 // effectively ±∞
		}

		mates := m.findMates(anchor, band, widen)
		if len(mates) < m.playersPerMatch-1 {
			return // not enough mates yet; try again next tick
		}

		// Form the match: pop anchor + mates.
		picked := append([]*Queued{anchor}, mates...)
		matchID := uuid.New()
		m.removeUsers(picked)
		peers := make([]Queued, 0, len(picked))
		for _, q := range picked {
			peers = append(peers, *q)
		}
		// Fire callbacks. Each callback is responsible for spinning up the
		// match engine goroutine.
		for _, q := range picked {
			if q.OnMatched != nil {
				cb := q.OnMatched
				go cb(matchID, peers)
			}
		}
		// Loop again — may have more mates queued for separate matches.
	}
}

// findMates picks players from the queue (excluding anchor) whose
// (examId matches AND |band - anchor.band| <= widen). Returns up to
// playersPerMatch-1 mates.
//
// After the second widen step (widen >= 99 ⇒ "match anyone"), the
// exam filter is also dropped — the anchor's exam wins for question
// composition. Without this fallback a student whose enrolled-exam
// order differs from their opponent's would wait forever even though
// both could meaningfully compete.
func (m *Matchmaker) findMates(anchor *Queued, anchorBand, widen int) []*Queued {
	need := m.playersPerMatch - 1
	// Relax the exam filter as soon as widening kicks in (i.e., the
	// initial 30 s exact-band window has passed). For the first 30 s
	// we still prefer same-exam matches.
	strictExam := widen == 0
	out := []*Queued{}
	for _, q := range m.pending {
		if q.UserID == anchor.UserID {
			continue
		}
		if strictExam && q.ExamID != anchor.ExamID {
			continue
		}
		delta := q.EloBand - anchorBand
		if delta < 0 {
			delta = -delta
		}
		if delta > widen {
			continue
		}
		out = append(out, q)
		if len(out) >= need {
			break
		}
	}
	return out
}

func (m *Matchmaker) removeUsers(picked []*Queued) {
	picked2 := map[uuid.UUID]bool{}
	for _, q := range picked {
		picked2[q.UserID] = true
	}
	out := m.pending[:0]
	for _, q := range m.pending {
		if !picked2[q.UserID] {
			out = append(out, q)
		}
	}
	m.pending = out
}

// Stats returns observability data for /metrics.
func (m *Matchmaker) Stats() map[string]int {
	m.mu.Lock()
	defer m.mu.Unlock()
	bands := map[int]int{}
	for _, p := range m.pending {
		bands[p.EloBand]++
	}
	out := map[string]int{
		"queued_total": len(m.pending),
	}
	for b, n := range bands {
		out["band_"+itoa(b)] = n
	}
	return out
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	if neg {
		return "-" + string(digits)
	}
	return string(digits)
}
