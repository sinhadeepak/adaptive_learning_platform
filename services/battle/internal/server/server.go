// Package server — HTTP + WebSocket gateway for alp-battle.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/adaptive-learn/battle/internal/config"
	"github.com/adaptive-learn/battle/internal/domain"
	"github.com/adaptive-learn/battle/internal/lobby"
	"github.com/adaptive-learn/battle/internal/match"
	"github.com/adaptive-learn/battle/internal/questions"
	"github.com/adaptive-learn/battle/internal/store"
	"github.com/adaptive-learn/battle/internal/ws"
)

type Server struct {
	cfg        config.Config
	upgrader   websocket.Upgrader
	conns      sync.Map // userID -> *Conn
	matches    sync.Map // matchID -> *match.Engine
	logger     *slog.Logger
	store      *store.Store
	mm         *lobby.Matchmaker
	qclient    *questions.Client
	pool       *pgxpool.Pool
}

func New(cfg config.Config, logger *slog.Logger, pool *pgxpool.Pool) *Server {
	st := store.New(pool)
	return &Server{
		cfg:    cfg,
		logger: logger,
		store:  st,
		mm:     lobby.New(cfg.QueueWidenAfterSec, cfg.QueueTimeoutSec, logger),
		qclient: questions.New(cfg.QuizBaseURL, cfg.LearningBaseURL),
		pool:   pool,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin:     func(r *http.Request) bool { return true },
		},
	}
}

// StartBackground spins up the matchmaker goroutine. Returns the
// cancel func so main can shut it down cleanly.
func (s *Server) StartBackground(ctx context.Context) {
	go s.mm.Start(ctx)
}

func (s *Server) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.healthz)
	mux.HandleFunc("/v1/socket", s.handleWebsocket)
	mux.HandleFunc("/v1/matches/", s.handleMatchHTTP)
	mux.HandleFunc("/v1/users/", s.handleUserHTTP)
	mux.HandleFunc("/v1/elo", s.handleELO)
	return mux
}

func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	_, _ = w.Write([]byte(`{"ok":true,"service":"battle"}`))
}

// ── HTTP read endpoints ──────────────────────────────────────────────

func (s *Server) handleMatchHTTP(w http.ResponseWriter, r *http.Request) {
	// /v1/matches/{id}
	path := strings.TrimPrefix(r.URL.Path, "/v1/matches/")
	if path == "" {
		http.NotFound(w, r)
		return
	}
	id, err := uuid.Parse(path)
	if err != nil {
		http.Error(w, `{"code":"bad_id"}`, http.StatusBadRequest)
		return
	}
	m, err := s.store.GetMatch(r.Context(), id)
	if err != nil {
		http.Error(w, `{"code":"not_found"}`, http.StatusNotFound)
		return
	}
	players, _ := s.store.ListPlayers(r.Context(), id)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"id":        m.ID.String(),
		"mode":      string(m.Mode),
		"status":    string(m.Status),
		"startedAt": m.StartedAt,
		"endedAt":   m.EndedAt,
		"players":   players,
	})
}

func (s *Server) handleUserHTTP(w http.ResponseWriter, r *http.Request) {
	// /v1/users/{id}/history
	path := strings.TrimPrefix(r.URL.Path, "/v1/users/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		http.NotFound(w, r)
		return
	}
	id, err := uuid.Parse(parts[0])
	if err != nil {
		http.Error(w, `{"code":"bad_id"}`, http.StatusBadRequest)
		return
	}
	switch parts[1] {
	case "history":
		rows, err := s.store.ListUserHistory(r.Context(), id, 25)
		if err != nil {
			http.Error(w, `{"code":"db_error"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"items": rows, "count": len(rows)})
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) handleELO(w http.ResponseWriter, r *http.Request) {
	uidStr := r.URL.Query().Get("userId")
	examStr := r.URL.Query().Get("examId")
	uid, err1 := uuid.Parse(uidStr)
	eid, err2 := uuid.Parse(examStr)
	if err1 != nil || err2 != nil {
		http.Error(w, `{"code":"bad_params"}`, http.StatusBadRequest)
		return
	}
	elo, err := s.store.GetOrSeedElo(r.Context(), uid, eid)
	if err != nil {
		http.Error(w, `{"code":"db_error"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"userId":     elo.UserID.String(),
		"examId":     elo.ExamID.String(),
		"rating":     elo.Rating,
		"rd":         elo.RD,
		"volatility": elo.Volatility,
		"nMatches":   elo.NMatches,
	})
}

// ── Auth ─────────────────────────────────────────────────────────────

type jwtClaims struct {
	Sub  string `json:"sub"`
	Role string `json:"role"`
	jwt.RegisteredClaims
}

func (s *Server) decodeJWT(raw string) (userID uuid.UUID, role string, err error) {
	tok, err := jwt.ParseWithClaims(raw, &jwtClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil {
		return uuid.Nil, "", err
	}
	claims, ok := tok.Claims.(*jwtClaims)
	if !ok || !tok.Valid {
		return uuid.Nil, "", errors.New("invalid token")
	}
	id, err := uuid.Parse(claims.Sub)
	if err != nil {
		return uuid.Nil, "", err
	}
	return id, claims.Role, nil
}

// ── WebSocket entry ──────────────────────────────────────────────────

type Conn struct {
	UserID  uuid.UUID
	Role    string
	WS      *websocket.Conn
	Out     chan []byte
	close   sync.Once
	done    chan struct{}
	matchID uuid.UUID // populated when player is in a match
	srv     *Server   // back-pointer for chat-store helper
}

func (c *Conn) Send(t string, p any) error {
	raw, err := ws.Marshal(t, p)
	if err != nil {
		return err
	}
	select {
	case c.Out <- raw:
		return nil
	case <-time.After(1 * time.Second):
		return errors.New("send queue full")
	case <-c.done:
		return errors.New("conn closed")
	}
}

func (c *Conn) UserIDStr() string { return c.UserID.String() }

func (c *Conn) Close() {
	c.close.Do(func() {
		close(c.done)
		_ = c.WS.Close()
	})
}

func (s *Server) handleWebsocket(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			token = strings.TrimSpace(auth[7:])
		}
	}
	if token == "" {
		http.Error(w, `{"code":"missing_token"}`, http.StatusUnauthorized)
		return
	}
	uid, role, err := s.decodeJWT(token)
	if err != nil {
		s.logger.Warn("battle.ws.auth_failed", "error", err)
		http.Error(w, `{"code":"invalid_token"}`, http.StatusUnauthorized)
		return
	}

	wsConn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.logger.Warn("battle.ws.upgrade_failed", "error", err)
		return
	}
	conn := &Conn{
		UserID: uid,
		Role:   role,
		WS:     wsConn,
		Out:    make(chan []byte, 64),
		done:   make(chan struct{}),
		srv:    s,
	}
	if prev, ok := s.conns.LoadAndDelete(uid.String()); ok {
		prev.(*Conn).Close()
	}
	s.conns.Store(uid.String(), conn)
	s.logger.Info("battle.ws.connected", "user_id", uid.String())

	go s.writeLoop(conn)
	go s.readLoop(conn)
}

func (s *Server) writeLoop(c *Conn) {
	defer c.Close()
	defer s.conns.Delete(c.UserID.String())
	for {
		select {
		case <-c.done:
			return
		case msg, ok := <-c.Out:
			if !ok {
				return
			}
			_ = c.WS.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.WS.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}
}

func (s *Server) readLoop(c *Conn) {
	defer func() {
		// Cancel any in-flight queueing on disconnect.
		s.mm.Cancel(c.UserID)
		c.Close()
	}()
	c.WS.SetReadLimit(8 * 1024)
	for {
		_, raw, err := c.WS.ReadMessage()
		if err != nil {
			return
		}
		var env ws.Envelope
		if err := json.Unmarshal(raw, &env); err != nil {
			_ = c.Send("error", ws.ErrorPayload{Code: "bad_envelope", Message: err.Error()})
			continue
		}
		s.dispatch(c, env)
	}
}

// dispatch — wire types route here.
func (s *Server) dispatch(c *Conn, env ws.Envelope) {
	switch env.T {
	case "lobby.queue":
		s.handleLobbyQueue(c, env.P)
	case "room.leave":
		s.mm.Cancel(c.UserID)
		_ = c.Send("lobby.cancelled", nil)
	case "match.answer":
		s.handleMatchAnswer(c, env.P)
	case "chat.send":
		s.handleChatSend(c, env.P)
	default:
		_ = c.Send("error", ws.ErrorPayload{
			Code:    "unknown_type",
			Message: "type " + env.T + " not supported",
		})
	}
}

func (s *Server) handleLobbyQueue(c *Conn, p []byte) {
	var body ws.LobbyQueuePayload
	if err := json.Unmarshal(p, &body); err != nil {
		_ = c.Send("error", ws.ErrorPayload{Code: "bad_payload", Message: err.Error()})
		return
	}
	examID, err := uuid.Parse(body.ExamID)
	if err != nil {
		_ = c.Send("error", ws.ErrorPayload{Code: "bad_exam", Message: err.Error()})
		return
	}
	elo, err := s.store.GetOrSeedElo(context.Background(), c.UserID, examID)
	rating := 1500
	if err == nil {
		rating = elo.Rating
	}
	band := domain.EloBand(rating)
	_ = c.Send("lobby.queued", ws.LobbyQueuedPayload{EloBand: band})

	uid := c.UserID
	s.mm.Enqueue(&lobby.Queued{
		UserID:      uid,
		DisplayName: uid.String()[:8], // gateway doesn't fetch profile; UI substitutes
		ExamID:      examID,
		EloBand:     band,
		Rating:      rating,
		QueuedAt:    time.Now(),
		OnMatched: func(matchID uuid.UUID, peers []lobby.Queued) {
			s.startMatch(matchID, examID, peers)
		},
		OnExpired: func() {
			c2, _ := s.conns.Load(uid.String())
			if c2 != nil {
				_ = c2.(*Conn).Send("error", ws.ErrorPayload{
					Code: "queue_timeout", Message: "No opponents found. Try again in a moment.",
				})
			}
		},
	})
}

// startMatch — invoked by the matchmaker callback after enough players land
// in a bucket. Creates the match row, broadcasts `lobby.matched`, then
// spins up the engine goroutine.
func (s *Server) startMatch(matchID, examID uuid.UUID, peers []lobby.Queued) {
	ctx := context.Background()
	now := time.Now().UTC()
	_ = s.store.CreateMatch(ctx, domain.Match{
		ID:        matchID,
		Mode:      domain.ModeQuickPlay,
		ExamID:    &examID,
		Status:    domain.StatusLobby,
		CreatedAt: now,
	})
	players := make([]*match.PlayerView, 0, len(peers))
	for _, peer := range peers {
		conn, _ := s.conns.Load(peer.UserID.String())
		_ = s.store.AddPlayer(ctx, domain.MatchPlayer{
			MatchID:  matchID,
			UserID:   peer.UserID,
			JoinedAt: now,
		})
		var sender match.ConnSender
		if conn != nil {
			cc := conn.(*Conn)
			cc.matchID = matchID
			sender = cc
		}
		players = append(players, &match.PlayerView{
			UserID:      peer.UserID,
			DisplayName: peer.DisplayName,
			Conn:        sender,
		})
		if conn != nil {
			_ = conn.(*Conn).Send("lobby.matched", ws.LobbyMatchedPayload{MatchID: matchID.String()})
		}
	}
	eng := match.NewEngine(matchID, examID, players, s.store, s.qclient, s.logger,
		s.cfg.QuestionsPerMatch, s.cfg.QuestionTimerSec)
	s.matches.Store(matchID.String(), eng)
	go func() {
		defer s.matches.Delete(matchID.String())
		eng.Run(ctx)
		// Clear matchID on connections after match ends.
		for _, peer := range peers {
			if c, ok := s.conns.Load(peer.UserID.String()); ok {
				c.(*Conn).matchID = uuid.Nil
			}
		}
	}()
}

func (s *Server) handleMatchAnswer(c *Conn, p []byte) {
	if c.matchID == uuid.Nil {
		_ = c.Send("error", ws.ErrorPayload{Code: "not_in_match"})
		return
	}
	var body ws.MatchAnswerPayload
	if err := json.Unmarshal(p, &body); err != nil {
		return
	}
	if e, ok := s.matches.Load(c.matchID.String()); ok {
		e.(*match.Engine).SubmitAnswer(c.UserID, body.QuestionIdx, body.PickedIdx, body.TimeMs)
	}
}

func (s *Server) handleChatSend(c *Conn, p []byte) {
	if c.matchID == uuid.Nil {
		_ = c.Send("error", ws.ErrorPayload{Code: "not_in_match"})
		return
	}
	var body ws.ChatSendPayload
	if err := json.Unmarshal(p, &body); err != nil {
		return
	}
	body.Body = strings.TrimSpace(body.Body)
	if body.Body == "" {
		return
	}
	if profanityHit(body.Body) {
		_ = c.Send("error", ws.ErrorPayload{Code: "chat_blocked", Message: "Message blocked by filter."})
		return
	}
	// Engine guards against during-IN_PROGRESS; we still broadcast to
	// other players so LOBBY/SCORING chat is real-time.
	if e, ok := s.matches.Load(c.matchID.String()); ok {
		e.(*match.Engine).SubmitChat(c.UserID, body.Body)
	}
	// Persist + broadcast.
	_ = s.persistChat(c.matchID, c.UserID, body.Body)
	s.broadcastToMatch(c.matchID, "chat.msg", ws.ChatMsgPayload{
		UserID: c.UserID.String(),
		Body:   body.Body,
		SentAt: time.Now().UnixMilli(),
	})
}

func (s *Server) persistChat(matchID, userID uuid.UUID, body string) error {
	_, err := s.pool.Exec(context.Background(), `
		INSERT INTO battle_schema.match_chat (match_id, user_id, body, sent_at)
		VALUES ($1, $2, $3, now())`, matchID, userID, body)
	return err
}

func (s *Server) broadcastToMatch(matchID uuid.UUID, t string, p any) {
	s.conns.Range(func(_, v any) bool {
		c := v.(*Conn)
		if c.matchID == matchID {
			_ = c.Send(t, p)
		}
		return true
	})
}

func (s *Server) Shutdown(_ context.Context) {
	s.mm.Stop()
	s.conns.Range(func(_, v any) bool {
		v.(*Conn).Close()
		return true
	})
}

// Trivial profanity filter — extend the list in profanity.go if/when
// the moderation feedback warrants it. Returns true if a banned token
// appears as a whole word (lowercased, word-boundary check via
// strings.Fields).
var bannedWords = map[string]bool{
	"fuck": true, "shit": true, "asshole": true, "bitch": true,
	"cunt": true, "bastard": true, "dick": true,
}

func profanityHit(body string) bool {
	for _, w := range strings.Fields(strings.ToLower(body)) {
		// strip non-alphanum trailing punctuation
		w = strings.Trim(w, ".,!?;:\"'()[]{}")
		if bannedWords[w] {
			return true
		}
	}
	return false
}
