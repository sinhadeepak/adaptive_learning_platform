// Package ws — wire protocol types for the WebSocket gateway.
//
// All messages are wrapped:
//   { "t": "<type>", "p": <payload> }
//
// Per ADR-0027:
//   - Client → server types:
//       lobby.queue            { examId }
//       lobby.create           { examId }
//       lobby.join             { inviteCode }
//       room.ready
//       room.leave
//       match.answer           { questionIdx, pickedIdx, timeMs }
//   - Server → client types:
//       lobby.queued           { eloBand }
//       lobby.matched          { matchId }
//       room.state             full room snapshot
//       room.player_joined     { userId, displayName }
//       room.player_ready      { userId }
//       match.starting         { startsAtMs, totalQuestions }
//       match.question         { idx, stem, choices, deadlineMs }
//       match.player_answered  { userId, idx } (fact only, no choice)
//       match.tick             { idx, secondsRemaining }
//       match.scored           { perPlayer, leaderboard, eloDelta }
//       error                  { code, message }

package ws

import (
	"encoding/json"
)

// Envelope wraps every WS message.
type Envelope struct {
	T string          `json:"t"`
	P json.RawMessage `json:"p,omitempty"`
}

// Client → server payloads.

type LobbyQueuePayload struct {
	ExamID string `json:"examId"`
}

type LobbyCreatePayload struct {
	ExamID string `json:"examId"`
}

type LobbyJoinPayload struct {
	InviteCode string `json:"inviteCode"`
}

type MatchAnswerPayload struct {
	QuestionIdx int16 `json:"questionIdx"`
	PickedIdx   int16 `json:"pickedIdx"`
	TimeMs      int   `json:"timeMs"`
}

// Server → client payloads.

type LobbyQueuedPayload struct {
	EloBand int `json:"eloBand"`
}

type LobbyMatchedPayload struct {
	MatchID string `json:"matchId"`
}

type RoomStatePayload struct {
	MatchID    string         `json:"matchId"`
	Mode       string         `json:"mode"`
	InviteCode string         `json:"inviteCode,omitempty"`
	Players    []PlayerPublic `json:"players"`
}

type PlayerPublic struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
	Ready       bool   `json:"ready"`
	Rating      int    `json:"rating"`
}

type MatchStartingPayload struct {
	StartsAtMs       int64 `json:"startsAtMs"`
	TotalQuestions   int   `json:"totalQuestions"`
	QuestionTimerSec int   `json:"questionTimerSec"`
}

type MatchQuestionPayload struct {
	Idx        int16    `json:"idx"`
	Stem       string   `json:"stem"`
	Choices    []string `json:"choices"`
	DeadlineMs int64    `json:"deadlineMs"`
}

type MatchPlayerAnsweredPayload struct {
	UserID string `json:"userId"`
	Idx    int16  `json:"idx"`
}

type MatchTickPayload struct {
	Idx              int16 `json:"idx"`
	SecondsRemaining int   `json:"secondsRemaining"`
}

type MatchScoredPayload struct {
	PerPlayer   []PlayerScore     `json:"perPlayer"`
	Leaderboard []LeaderboardRow  `json:"leaderboard"`
	EloDelta    map[string]int    `json:"eloDelta"` // userId -> rating delta
}

type PlayerScore struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
	Score       int    `json:"score"`
	Correct     int    `json:"correct"`
	Total       int    `json:"total"`
}

type LeaderboardRow struct {
	UserID string `json:"userId"`
	Rank   int    `json:"rank"`
	Score  int    `json:"score"`
}

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// F8a — in-match chat. Permitted only during LOBBY + SCORING phases.

type ChatSendPayload struct {
	Body string `json:"body"`
}

type ChatMsgPayload struct {
	UserID string `json:"userId"`
	Body   string `json:"body"`
	SentAt int64  `json:"sentAt"`
}

// Marshal returns a fully-encoded envelope ready to write to a WS
// connection. Caller passes any payload struct; nil payload is fine.
func Marshal(t string, p any) ([]byte, error) {
	var raw json.RawMessage
	if p != nil {
		var err error
		raw, err = json.Marshal(p)
		if err != nil {
			return nil, err
		}
	}
	return json.Marshal(Envelope{T: t, P: raw})
}
