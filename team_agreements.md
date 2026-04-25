# Team Working Agreements & Engineering Norms

**Version**: 1.1 (Sprint 0 baseline + ADR-0002 stack alignment) · **Status**: Living · **Date**: 2026-04-22
**Canonical signed copy**: [docs/02_planning/06_TeamWorkingAgreements_EngineeringNorms_AdaptiveLearningPlatform.docx](docs/02_planning/06_TeamWorkingAgreements_EngineeringNorms_AdaptiveLearningPlatform.docx) (v1.0, signed Sprint 0 Day 10)
**This file**: working-reference Markdown for daily use. Reflects current stack post-ADR-0002 (Flutter mobile, React+Vite web). Substantive changes here must round-trip into the .docx at the next retrospective.

> Action-oriented engineering process (branches, PRs, tests, ADRs, security checklist) lives in [CONTRIBUTING.md](CONTRIBUTING.md). This file covers culture, rituals, communication, on-call, psychological safety.

---

## 1. Values & Engineering Principles

### Core values
| Value | What it means | What it does NOT mean |
|---|---|---|
| **Craft** | Code is for the next engineer who reads it. Pride in clear names, clean logic, real tests. | Perfectionism that blocks shipping. |
| **Honesty** | Raise concerns early, in reviews, in standups. Tell the PO when a story is unclear *before* the sprint. | Brutal feedback without kindness. |
| **Ownership** | When something is broken, fix it — even if you didn't write it. Ship end-to-end: feature + tests + docs + monitoring. | Lone-wolf heroism. Ask for help before being blocked 2h. |
| **Curiosity** | Ask why. Read the actual error. Run spikes. Learn from post-mortems. | Analysis paralysis. Timebox investigations. |
| **Care** | Notice when someone is struggling. No 22:00 meetings. Celebrate small wins. | Avoiding hard conversations under cover of "kindness". |

### Engineering principles
- **Simple before clever** — write the obvious solution first. Abstract only when 3 concrete cases need it.
- **Boring technology** — established tools over the newest thing.
- **Explicit over implicit** — name things clearly, no magic, config in code.
- **Delete code** — celebrate removals in PRs.
- **Tests are not optional** — part of the feature, not added after.
- **Observability from day one** — every new feature gets logs + metric + alert threshold.
- **Security is everyone's job** — every engineer runs the security checklist before raising a PR.

---

## 2. Roles

Roles define accountability, not hierarchy. Every person has a voice in architecture decisions.

| Role | Primary accountability | Decisions they own | Escalates to |
|---|---|---|---|
| Tech Lead | Architecture, standards, unblocking the team. ~50% coding, ~50% leading. | Technology choices, cross-service contracts, ADR decisions. | Engineering Lead |
| Backend Eng × 3 (Python) | FastAPI services, DB migrations, NATS integration. | Service-level implementation. API design within agreed contract. | Tech Lead |
| Backend Eng × 1 (Go) | Quiz Service. | Go service implementation. | Tech Lead |
| Frontend Eng × 2 | React+Vite web app, Admin portal, design system. | Component arch, state management, web perf. | Tech Lead |
| Mobile Eng × 2 (iOS + Android) | Flutter app shared codebase per [ADR-0002](docs/adr/0002-flutter-mobile-stack.md), TrustKit/Keychain (iOS), EncryptedSharedPreferences (Android). | Mobile-specific technical decisions, store config. | Tech Lead |
| DevOps Engineer | Terraform/Terragrunt, EKS, ArgoCD, CI/CD, observability, cost. | Infra design, deploy strategy, env config. | Tech Lead |
| ML Engineer | Adaptive Engine (Python+gRPC), mastery algorithm, analytics pipeline, NATS consumers. | Algorithm design, model parameters, analytics schema. | Tech Lead |
| QA Lead | Test strategy, pytest/Playwright/k6, DoD enforcement, staging sign-off. | Test coverage decisions, QA toolchain, story DoD acceptance. | Tech Lead + PO |
| UI/UX Designer | All Figma designs, design tokens, EN/HI layout testing. | Visual design, component states, UX copy. | PO |
| Product Owner | Vision, backlog priority, story acceptance, stakeholder comms. | Feature scope, priority, launch criteria. | Engineering Lead |

### Shared responsibilities — everyone owns these
- Code quality in your PR, test coverage, doc updates, raising blockers in standup (not after).
- No code is exempt from review. Not the Tech Lead's. Not the ML Engineer's.
- When you see something broken (failing test, alert, staging bug) → either fix it or raise it. Do not walk past it.

---

## 3. Sprint rituals

| Ceremony | When | Duration | Required | Purpose & rules |
|---|---|---|---|---|
| Daily Standup | Mon–Fri 09:30 IST | 15 min | All engineers + QA + PO | Three questions only: completed / today / blockers. No solutions in standup. Video on. Timer enforced. |
| Sprint Planning | Day 1 of sprint | 3h | All team + PO | PO presents context. Engineers self-assign — PO does not assign. |
| Sprint Review / Demo | Day 10 of sprint, 14:00 IST | 90 min | All team + PO + stakeholders | Demos run by the engineer who built. PO accepts/rejects each story. No code walkthroughs. |
| Sprint Retro | Day 10 of sprint, 16:00 IST | 60 min | All engineers + QA | Format rotates. ≥ 3 action items with named owners. Notes published within 24h. |
| Backlog Grooming | Wed + Fri 30 min | 30 min | Tech Lead + QA + PO | Refine next sprint stories. Mark READY when DoR met. |
| Architecture Sync | Every other Mon, 11:00 IST | 60 min | Tech Lead + senior engineers, open | Tech decisions, ADR review, spike findings. |
| Tech Debt Review | Last Thursday of sprint, 14:00 IST | 30 min | Tech Lead + engineers | Score severity × age. Target 10% of capacity to tech debt. |
| Weekly 1:1s | Weekly | 30 min | Tech Lead with each engineer | Engineer sets agenda — career, blockers, wellbeing. Not status. |

### Meeting agreements
- Cameras on for ceremonies; optional for working sessions.
- Every meeting has a stated goal in the invite — if you can't articulate it, cancel.
- **No meetings 14:00–17:00 IST Tue + Thu.** Protected deep-work blocks.
- Decision meetings produce a written decision posted to Slack within 1h of ending.

---

## 4. Daily working norms

### Hours & availability
- **Core hours**: 10:00–17:00 IST Mon–Fri. Available for collaboration.
- **Deep work protection**: 14:00–17:00 IST Tue + Thu — no meetings, no @mentions unless P0.
- **Flex**: start time 08:00–11:00 IST OK as long as core hours covered.
- **Leave notification**: ≥ 2 business days for planned, by 09:00 IST same-day for sick.
- **Outside hours response**: not expected. Exception: PagerDuty page for P0.
- **DND**: respect Slack DND indicators. Urgent → call or PagerDuty, not repeated Slack pings.

### Blocker protocol — the 2-hour rule
You are never allowed to be blocked for more than **2 hours** without raising it.

| Blocked for | Action | Channel |
|---|---|---|
| < 30 min | Resolve yourself. Read docs / ADRs / actual error. | Your own head |
| 30–120 min | Ask in the relevant Slack channel; tag someone if you know who. | `#backend` / `#mobile` / `#devops` |
| 2+ hours | Post in `#sprint-N`: trying to do X, tried Y, need Z. @mention Tech Lead or domain expert. Don't wait for standup. | `#sprint-N` |
| Blocking another engineer | P1 — drop your work and resolve it. | Immediate |

### Shout before you drown
If you're struggling — technically, personally, or with workload — tell the Tech Lead or a trusted teammate before it becomes a crisis. The team will not judge you for asking. The team will judge itself if you were drowning and we didn't notice.

---

## 5. Communication

### Slack channel guide
| Channel | Purpose | Response SLA |
|---|---|---|
| `#sprint-N` | Sprint updates, blockers, daily wraps. Post wrap by 17:30 IST. | Same day, core hours |
| `#engineering-general` | Tech discussions, links, ideas. No decisions made here without an ADR. | None — async |
| `#code-review` | PR review requests. | Ack 4h, complete 1 day |
| `#deploys` | ArgoCD notifications. Post smoke-test results. | Read-only for most |
| `#infra-alerts` | Grafana alerts, drift, cost. **Do not mute.** | DevOps 30 min, core hours |
| `#incident-response` | P0/P1 incidents. Updates every 10 min. | Senior engineers: 5 min |
| `#random` | Non-work, memes, celebrations. | None |
| `#team-learning` | Articles + 1-line summaries. | None — no link dumps |
| `#retro-async` | Pre-retro submissions, anonymous form available. | None |

### Written communication norms
- **Async first.** Slack before scheduling a meeting. Thread reaches 5+ messages → call.
- **Context, not just questions.** Include what you're trying, what you've tried, what you think the problem is.
- **One question per message.** Batched questions are hard to track.
- **Emojis are professional.** 👍 = "seen and agree / will do". 🤔 = "thinking".
- **Decisions in writing.** Verbal decisions get a Slack write-up within 1h.

### Feedback
- Specific, not general — "Line 47: extracting X into `getY()` would clarify intent" not "this is hard to read".
- About the work, not the person — "this endpoint doesn't handle 404" not "you always forget error handling".
- Ask, don't tell when uncertain — "I'm not sure I follow the reasoning here, can you walk me through it?"
- **Disagree and commit.** After discussion, if the team decides against your view: execute it fully. Raise it again at retro with data. No passive-aggressive half-implementation.

---

## 6. Code review culture

Code review is the single most impactful quality practice on this team. The goal is to make the code better AND share knowledge — both matter.

Mechanics (PR size, MUST/SUGGEST/NIT/QUESTION prefixes, SLAs, merge rules) live in [CONTRIBUTING.md §4](CONTRIBUTING.md#4-pull-requests).

### Review red lines
- No PR merges without ≥ 1 approving review from a non-author. Enforced by branch protection.
- No merges with red CI. No exceptions, not even "urgent" fixes.
- A `MUST:` comment is a blocker — addressed before re-request.
- Security comments (SQL injection, IDOR, missing audit log, PII in logs) are always `MUST`.

### What good looks like
- Specific, actionable comments that explain the *why* (especially the security risk).
- Approval with positive callouts: "Approved. The separation of concerns between mastery calculator and score publisher is particularly clean." — much more valuable than 👍.

---

## 7. Git & branches

Detailed in [CONTRIBUTING.md §2–4](CONTRIBUTING.md#2-branches). Highlights:
- `main` is protected, always deployable.
- Squash-merge to `main`. Never force-push, never `--no-verify`, never amend published commits.
- Conventional Commits enforced by commitlint (pre-commit + CI).

---

## 8. Decision-making

Decisions made at the **lowest level that the decision affects**. Centralisation only when broad impact.

| Decision type | Who decides | Process | Reversible? |
|---|---|---|---|
| Implementation (local) | Engineer who owns the code | Decide and implement | Yes — easy |
| Implementation (shared) | Engineer + reviewer | PR; tag Tech Lead on disagreement | Yes — PR |
| Service-level design | Owning engineer + Tech Lead | Brief Slack or arch sync. Document in code or service README. | Medium |
| Cross-service API contract | Tech Lead + affected engineers | Architecture sync. OpenAPI change as evidence. ADR if significant. | Hard |
| Tech / tool change | Tech Lead + team vote | Spike → proposal → arch sync → vote → ADR | Hard |
| Product scope change | Product Owner | PO decides with Eng Lead input. Announced in sprint channel. | Medium |
| Team process change | Whole team | Proposed at retro. Majority (7 of 12). Committed to repo. | Yes — retro |
| Security control change | Security Lead + Tech Lead | Written rationale. ADR. Cannot be overridden by product pressure. | No |

### ADRs
Write an ADR whenever a decision is architectural, not easily reversible, OR important for future engineers to understand. See [CONTRIBUTING.md §7](CONTRIBUTING.md#7-adrs-architecture-decision-records). Status lifecycle: `Proposed → Accepted → Superseded` (or `Deprecated`). Never edit an Accepted ADR's decision in place — supersede it.

Once Accepted: implement it. **Disagree and commit.** Disagreement is raised in the ADR discussion phase or at the next architecture sync, not during implementation.

---

## 9. Knowledge sharing & documentation

Knowledge that lives only in one head is a liability.

### Documentation ownership

| Document | Location | Owner | Freshness SLA |
|---|---|---|---|
| Service README | `services/<name>/README.md` | Service owner | 24h after change |
| ADRs | `docs/adr/` | Engineer writes, Tech Lead reviews | 48h of decision |
| OpenAPI spec | `openapi/phase1.yaml` (Sprint 1+) | All BE engineers per endpoint | Same PR as endpoint change |
| Runbooks | `runbook/` | DevOps (infra), service owner (service) | 1 sprint after procedure used |
| Sprint retro notes | Confluence /Team/Retros/ | Scrum Master | 24h after retro |
| Spike findings | `docs/02_planning/spikes/` + ADR | Engineer who ran spike | 48h of timebox end |
| Team agreements | This file (working) + canonical .docx | Whole team | Same day as retro decision |
| Post-mortems | `pirs/` (per [runbook/pir_template.md](runbook/pir_template.md)) | Incident Commander | 48h of resolution |

### Knowledge transfer practices
- **Pair programming** — at least once per sprint per engineer. 30-min driver/navigator switches. Use for complex algorithms, security-sensitive code, onboarding.
- **Tech talks (15 min)** — once per sprint, volunteer-based, in the architecture sync slot.
- **README-driven development** — write the README first for new services or major features. If you can't explain it in prose, you don't understand it well enough to code it.
- **Comments for WHY not WHAT** — code shows what; comments explain why a decision was made.
- **Spike briefings** — 5-min briefing in next architecture sync after every spike.
- **Bus factor check** — quarterly. Identify single-headed knowledge. Pair, document, or transfer.

---

## 10. On-call & incident response

Begins at soft launch (Phase 1b, Week 9). Until then, dev/staging incidents are handled in business hours.

### Severity levels

| Level | Criteria | Response | Who |
|---|---|---|---|
| **P0** | Platform down. Auth broken. Payments failing. Data loss. Security breach. | < 15 min | On-call (24/7); Tech Lead notified immediately |
| **P1** | Major feature unavailable. Error rate > 1%. Perf degraded > 50%. | < 1 h | On-call; Eng Lead notified |
| **P2** | Non-critical feature broken. Minority of users. | < 4 h business hours | On-call business hours |
| **P3** | Minor / cosmetic. | Next business day | Picked up in sprint planning |

### Rotation
- Weekly. 7 on / off. Tech Lead + 3 senior backend engineers rotate.
- Junior engineers shadow 2 rotations before solo on-call.
- **Incident fatigue rule**: > 2 P0 in a week → engineer immediately removed from next rotation. Non-negotiable.

### Process — the canonical procedure is [runbook/rollback.md](runbook/rollback.md) + [runbook/feature_flag_kill_switch.md](runbook/feature_flag_kill_switch.md). Briefly:
1. PagerDuty → on-call ack within 5 min.
2. Severity decided. P0 → open `#incident-response` thread immediately.
3. Investigate via Grafana / Loki / OTEL. Updates every 10 min.
4. Stuck > 15 min → bring in second engineer.
5. Fix or roll back.
6. Verify via smoke tests, watch Grafana 10 min.
7. Post resolution message.
8. Write PIR within 48h using [runbook/pir_template.md](runbook/pir_template.md). Action items into next sprint.

### Blameless post-mortem culture
- Incidents are systems failures, not people failures. Ask "what in our system made this possible?" not "who did it?"
- Stories of incidents that taught lessons are shared, not hidden.
- The PIR author is the incident commander, not the person who triggered the incident. Position of trust, not blame.

---

## 11. Engineering quality standards

These are CI-enforced. Engineers are expected to meet them before requesting review.

### Testing
- **Unit coverage ≥ 80%** on business logic (services, repositories, algorithms). Not on framework glue.
- **Integration test per HTTP endpoint** — happy path + at least one error path. Real DB, not mocks.
- **E2E for critical flows** — Playwright: register, login, start quiz, submit quiz, payment.
- **No mocks of the system under test** — mocks are for external dependencies (Stripe, Twilio).
- **Tests are deterministic** — flaky tests are fixed immediately, not disabled.
- **Tests document intent** — `test_quiz_submit_returns_422_when_no_answers_provided`, not `test_submit_1`.
- **Tests own their data** — create what you need, clean up after, no inter-test dependencies.

### Performance
- Every new endpoint benchmarked against NFR targets in DoD. Story not done if endpoint misses p95 target.
- N+1 queries are a PR blocker.
- New web deps > 50KB or mobile deps > 50KB → Tech Lead approval.

### Observability
- **Structured JSON logs** — fields: `service`, `request_id`, `user_id`, `event_type`, `level`, `message`. No string concat in messages.
- **No PII in logs.** Email/name/phone/national ID/tokens never logged. Reviewer checks.
- **Metrics for new features** — counter (runs), histogram (duration), error counter.
- **Alerts for new services** — health check + Grafana panel + PagerDuty alert if error rate > 1% over 5 min.
- **Request IDs** propagate across services via header.
- **Distributed traces** via OpenTelemetry → Tempo.

---

## 12. Security culture

Security is a first-class engineering value, not an audit checkbox.

### Daily practice
- The security checklist (in [CONTRIBUTING.md §8](CONTRIBUTING.md#8-security-checklist-every-pr)) is completed by the **author**, not the reviewer. Self-certify.
- Found a vuln in code you didn't write? Raise it immediately — `#incident-response` if exploitable in prod, P1 bug otherwise.
- Never commit a secret. If you do: rotate immediately (don't wait), then remove from history (`git filter-branch` or BFG), then notify Tech Lead + Security Lead in the same hour.
- "We'll add authentication next sprint" is not an acceptable engineering decision. Security controls are part of the feature, not optional extras.

### Knowledge expectations (every engineer)
- **OWASP Top 10** — name a concrete example of each from this codebase.
- **SQL injection** — explain why parameterised queries prevent it; identify it in review.
- **JWT** — RS256 vs HS256, why `none` algorithm is dangerous, how our refresh rotation works.
- **PII handling** — which schema fields are L1/L2; what that means for log/storage/transit.
- **IDOR** — explain it; demonstrate the ownership check in code review.
- **Secrets** — secrets come from `/mnt/secrets/`, not env vars; gitleaks catches commits; what to do if you commit a secret.

---

## 13. Psychological safety & wellbeing

Psychological safety is the belief that you can speak up, ask, make mistakes, disagree — without fear. It is the single biggest predictor of high-performing teams.

### Core agreements
- **You will never be made to feel stupid for asking.** Every question is legitimate.
- **Mistakes are expected and welcome.** The only real mistake is a hidden one. Own it, fix it, share what you learned.
- **Disagreement is healthy. Silence is not consensus.** Say so clearly when you disagree. Passive agreement that you execute half-heartedly is worse than open disagreement.
- **Nobody is too senior to be wrong.** The Tech Lead's code gets reviewed. Architectural decisions get questioned.
- **"I don't know" is a complete and honourable answer.** Followed by "and I'll find out" is even better.

### What we do not tolerate
| Behaviour | How it shows up | How we handle it |
|---|---|---|
| Condescension | "Obviously you need to…", sighing at questions in standup. | Private conversation by Tech Lead. Repeated → Eng Lead. |
| Dismissiveness | Ignoring suggestions, talking over. | Called out kindly in the moment: "I noticed X's point wasn't acknowledged — can we come back?" |
| Blame language | "Who did this?", finger-pointing in PIRs. | Reframed immediately to systems language. |
| Credit theft | Presenting another's work or idea as your own. | Zero tolerance. Addressed by Tech Lead privately and immediately. |
| Late-night pressure | 23:00 messages expecting replies; weekend implications. | Tech Lead intervenes. Working hours enforced. |
| Knowledge gatekeeping | Withholding info to appear irreplaceable; refusing to document. | Addressed in 1:1 as a performance concern. Opposite of ownership. |

### Reporting concerns
Witness or experience any of the above and uncomfortable raising directly: report to Tech Lead, PO, or HR contact. Confidential. No retaliation for good-faith reports.

---

## 14. Career growth & learning

This project is an opportunity to build skills that matter.

### Learning agreements
- **Learning budget** — per employment contract. Use it.
- **10% of sprint capacity** is reserved for tech debt and learning (spike time, refactoring, doc, exploring relevant tools).
- **Conferences** — 15-min team summary required within 2 weeks of attendance.
- **Online courses** — can be done during core hours with Tech Lead awareness. Encouraged, not hidden.
- **Side projects** — encouraged if relevant; conflict of interest disclosed.

### Growth areas this project provides
- Distributed systems design (NATS, eventual consistency, SAGA, distributed tracing).
- ML in production (IRT/3PL adaptive, mastery scoring, recommendation, embedding search) — for the ML Engineer + interested BE.
- Platform security (STRIDE, pen test participation, mTLS, JWT, OWASP — applied not theoretical).
- Mobile engineering (Flutter, certificate pinning, Keychain/EncryptedSharedPreferences).
- IaC at scale (Terraform + Terragrunt, Karpenter, ArgoCD, EKS).
- Product thinking (working with PO on backlog, sprint planning, launch decisions).
- Technical writing (ADRs, runbooks, spike findings, README-driven development).

### 1:1 agreements
- Weekly 1:1s are for the engineer, not the Tech Lead. Engineer sets agenda. Status updates are not the agenda — career, blockers to growth, feedback on the team, wellbeing are.
- Feedback flows in both directions. Engineers encouraged to give the Tech Lead feedback. Welcomed, not merely tolerated.

---

## 15. Acknowledgement & sign-off

Sign-off is captured on the canonical [.docx](docs/02_planning/06_TeamWorkingAgreements_EngineeringNorms_AdaptiveLearningPlatform.docx) at Sprint 0 Day 10. This `.md` is the working reference and is updated more frequently; substantive changes round-trip into the .docx at the next retrospective.

### Amendment log

| Version | Date | Changed by | What changed | Agreed by |
|---|---|---|---|---|
| 1.0 | April 2026 | Whole team | Initial version — Sprint 0 baseline (canonical .docx) | All 12 team members |
| 1.1 | 2026-04-22 | Tech Lead (per ADR-0002) | Stack alignment in §2 (Roles): mobile is now Flutter shared codebase, web is React+Vite (was Next.js + native iOS/Android in v1.0). Working-reference .md created; substance unchanged. | Pending retro confirmation |

This document is the property of the team — not management, not any individual. It belongs to the people who signed it, and it will be updated by them, for them.
