# ADR-0009: Tutor session real-time signalling + media

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, Tech Lead
- **Related**: P3-S0 gating ADR #4, [ADR-0005](0005-service-consolidation.md)

## Context

Phase 3 P3-S2 launches live tutor sessions. A "session" is two people (tutor + student) on a real-time A/V call, possibly with screen-share, in-call chat, and a shared whiteboard. The platform needs:

1. **Session-state machine** — `BOOKED → STARTED → IN_PROGRESS → COMPLETED | CANCELLED | NO_SHOW`. Both participants need to see consistent state. Mid-session reconnects, late joins, dropped calls all need to update state correctly.
2. **A/V media** — actual video + audio streams. Selective Forwarding Unit (SFU), TURN/STUN, jitter buffers, codec negotiation, mobile network handling.
3. **Auxiliary streams** — chat messages, whiteboard strokes, "raise hand" signals. Lower bandwidth than A/V but real-time.

These three layers are usually conflated as "real-time". They have very different cost / risk / build profiles:

- **State machine**: cheap to build (NATS pub/sub + Postgres state). Existing infra handles it.
- **Auxiliary streams**: medium build cost. Could go on NATS (bytes through JetStream) or WebSockets.
- **A/V media**: building an SFU is a research project. Building TURN servers is an ops project. Buying it is a licence cost.

The Phase 3 plan budget is one engineer + 6 months. Building A/V is out of scope; we buy.

## Decision

**Three-tier:**

1. **Session-state machine**: NATS JetStream extensions in `alp-marketplace`. New stream `MARKETPLACE_EVENTS`, subjects `tutor_session.<state-transition>`. Durable consumer in `alp-marketplace` updates `marketplace_schema.tutor_sessions` rows. Both participants subscribe via SSE (re-using the alp-engagement leaderboard SSE pattern from S13).
2. **Auxiliary streams** (chat, whiteboard, raise-hand): NATS subjects `tutor_session.<session_id>.<channel>`, broadcast pattern (no durable). Clients connect via SSE on `alp-marketplace`'s `/marketplace/tutor-sessions/{id}/stream` endpoint.
3. **A/V media**: **Daily.co** (third-party SaaS). Daily handles SFU, TURN, codec negotiation, mobile network resilience, screen-share, and recording. Platform integrates via Daily's room API (create room when session moves to STARTED; embed Daily's iframe SDK on web; native Daily SDK on Flutter).

## Alternatives considered

- **Build everything on WebRTC + SFU + TURN ourselves**. *Rejected* — multi-month research project. Out of single-engineer 6-month budget. WebRTC tooling has dramatically improved but operating an SFU (mediasoup, Janus) in production at any scale needs dedicated SRE. Not us today.
- **Twilio Video** for A/V. *Rejected* in favour of Daily.co for two reasons: (1) Twilio Video's pricing is more expensive at our projected scale (Daily.co is $0.0036/participant-min vs. Twilio $0.0040 with worse free tier); (2) Twilio Video's V2 SDK had stability issues in late-2025 reports. Revisit if Daily quality drops.
- **Zoom SDK / Zoom Marketplace integration**. *Rejected* — heavyweight, brand mismatch, weak control over the in-call UX (we need the whiteboard + chat to live INSIDE our session shell, not in Zoom's UI). Zoom SDK is more for "embed our Zoom meeting" use cases.
- **Agora.io** for A/V. *Considered* — competitive on price, India-friendly. *Rejected* in favour of Daily.co primarily on developer experience: Daily's SDK is significantly cleaner per developer-tooling reviews and has better React + Flutter SDKs.
- **Build state-machine on WebSockets (FastAPI)** instead of NATS. *Rejected* — we already have NATS as the durable event bus. Adding a parallel WebSocket fan-out server doubles the infra. NATS-as-state-bus + SSE-as-client-edge worked in S13; reuse the pattern.
- **Push state via existing `quiz.session.completed` style events**. *Rejected* because the granularity is wrong: tutor sessions need transitions every few seconds (joined, raised hand, paused), not at-completion only. Distinct event-stream warranted.

## Consequences

### Positive

- **A/V is solved by buying it** — engineering effort goes into the platform's value-add (state machine, AI-assisted prompts, automated note-taking).
- **State machine + aux streams reuse NATS infra** — no new infrastructure components. SSE proxy already configured per S13.
- **Daily.co handles mobile network resilience** — Indian 4G is the target market; Daily's reconnection / jitter handling is production-tested for that profile.
- **Whiteboard + chat in our UI shell** — branded experience, AI integration possible (e.g. tutor whiteboard strokes feed into the platform's question-recommendation engine).

### Negative

- **Vendor dependency on Daily.co** — Daily SLA outage = our tutor-session product is offline. Mitigation: graceful degradation to "session marked started, students notified to retry". Documented in P3-S6 incident-response runbook.
- **Daily.co cost scales with session minutes** — at projected 10 sessions/day × 60 min × 2 participants × $0.0036 = ~$130/month at P3-S1 closed-beta. Linear scaling: 1,000 sessions/day = $13K/mo. **Phase 3 P&L must account for this**.
- **Two real-time stacks to monitor** — NATS state + Daily A/V. Means two failure modes to debug. Trade-off accepted.
- **No recording in P3-S2** unless we pay Daily's recording add-on ($0.01/participant-min on top). Recordings are a P3-S4 concern.

### Follow-up work

- [ ] Daily.co account + per-environment API keys (Marketing / DevOps owns).
- [ ] `MARKETPLACE_EVENTS` JetStream stream config (define in S15-2 follow-up; deferred).
- [ ] `tutor_sessions` table schema (P3-S1).
- [ ] SSE stream endpoint `/marketplace/tutor-sessions/{id}/stream` (P3-S2).
- [ ] Daily room provisioning — `alp-marketplace` calls Daily REST when session enters STARTED state (P3-S2).
- [ ] Cost monitoring dashboard for Daily participant-minutes (alp-engagement consumes Daily's webhooks for per-session billing).
- [ ] Disaster recovery runbook for Daily outages.

## Review

Revisit at **P3-S6 launch retrospective** or earlier if any of:

- Daily.co outage > 30 min during P3-S1 closed beta (signals SLA risk for full launch).
- A/V quality complaints from > 20% of tutors during P3-S1 (signals SFU mismatch with India network profile).
- Daily.co pricing increases > 25% YoY (review against Twilio / Agora alternatives).
- Need for features Daily doesn't expose (e.g. specific compliance recording requirements; AI-assisted in-call captioning if Daily doesn't add it).
