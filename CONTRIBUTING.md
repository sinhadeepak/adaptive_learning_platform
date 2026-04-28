# Contributing

Engineering process for the Adaptive Learning Platform. Cultural agreements (values, ceremonies, on-call, psychological safety) live in [team_agreements.md](team_agreements.md). This file is the action-oriented "how to ship code here" reference.

---

## 1. Getting set up

```bash
git clone git@github.com:<org>/adaptive_learning_platform.git
cd adaptive_learning_platform
make check-tools          # verify Python 3.11, Go 1.22, Node 20, Docker, uv, pnpm
pre-commit install        # one-time per clone — installs hooks listed in .pre-commit-config.yaml
make install              # uv sync per service + pnpm install
make dev                  # bring up local stack: Postgres, Redis, OpenSearch, NATS, LocalStack, Mailpit
```

Full bootstrap detail: [docs/02_planning/08_DevEnvironmentRequirements_AdaptiveLearningPlatform.md](docs/02_planning/08_DevEnvironmentRequirements_AdaptiveLearningPlatform.md).

If `make check-tools` fails, **stop and install the missing tool** — do not work around it. The pinned versions are non-negotiable; CI runs the same versions.

---

## 2. Branches

Branch from `main`. Delete after merge.

| Type | Naming | Example |
|---|---|---|
| Feature | `feat/<ST-id>-<slug>` | `feat/ST-02-01-01-register-email` |
| Bug fix | `fix/<ticket-id>-<slug>` | `fix/BUG-042-jwt-refresh-race` |
| Refactor / chore | `chore/<slug>` | `chore/upgrade-fastapi-0.115` |
| Hotfix | `hotfix/<ticket-id>-<slug>` | `hotfix/PROD-001-stripe-sig` |
| Infra / CI | `infra/<slug>` | `infra/add-opensearch-vpc-endpoint` |

`main` is protected: no direct push, PR + 1 approval + green CI required.

---

## 3. Commits

Conventional Commits, enforced by commitlint (pre-commit + CI). Format: `type(scope): short description` ≤ 72 chars.

| Type | Use |
|---|---|
| `feat` | New user-visible functionality |
| `fix` | Bug fix |
| `chore` | Tooling, deps, build, no user-facing change |
| `docs` | Documentation only |
| `test` | Tests added/updated |
| `refactor` | Code change, no behaviour change |
| `perf` | Performance improvement |
| `ci` | CI/CD changes |
| `revert` | Reverts a prior commit |

Scope (one of): `auth | quiz | adaptive | analytics | catalog | content | search | institution | payment | notification | web | mobile | infra | shared | db`.

**Breaking changes**: append `!` and explain in body.
```
feat(auth)!: rotate refresh token on every refresh

BREAKING CHANGE: clients must persist the new refresh token after each /refresh call.
```

---

## 4. Pull requests

### Author checklist (before requesting review)

- [ ] PR ≤ 400 lines changed (excluding generated files + migrations). If larger → split.
- [ ] Self-reviewed your own diff.
- [ ] CI green. Don't request review on red CI.
- [ ] [PR template](.github/pull_request_template.md) sections all completed (Summary, Related, DoD, backward-compat, Rollout & rollback).
- [ ] One PR, one concern. Feature + refactor + bug fix is three PRs.
- [ ] If touching `main` API surface → `openapi.yaml` updated in the same PR.
- [ ] Observability: structured log for new error paths, metric for new operations.
- [ ] Test coverage: every new branch has a test. Zero exceptions.

### Reviewer SLA

- **Acknowledge within 4 business hours.** Even just "I'll review by EOD."
- **Complete within 1 business day.** If you can't, say so and tag a backup reviewer.
- **One approval is enough** for non-architectural PRs. Cross-service or schema-changing PRs need Tech Lead approval as well.

### Comment categories (use these prefixes)

- **`MUST:`** — blocker. Must be addressed before merge. Security and correctness comments are always MUST.
- **`SUGGEST:`** — non-blocking improvement. Author can take it or leave it; explain choice if leaving it.
- **`NIT:`** — very minor (style, naming). Author free to ignore.
- **`QUESTION:`** — reviewer needs context before deciding.

A `MUST:` comment blocks merge until resolved. The author either fixes it or persuades the reviewer in thread; silent re-request without addressing `MUST` is not acceptable.

### Merge

- **Squash merge** to `main`. One feature, one commit in history.
- **Rebase your branch on `main` before merge** — don't merge `main` into your branch.
- Branches auto-delete after merge.
- **Never `--no-verify`, `--force-push` to `main`, or `--amend` published commits.** No exceptions.

---

## 5. Tests

A PR is not done until tests are. Untested code is broken code that hasn't been discovered yet.

| Layer | Tool | When required |
|---|---|---|
| Unit | `pytest` (Python), `go test` (Go), `vitest` (Web) | Every PR with code changes |
| Integration | `pytest` against the local Compose stack | Every PR touching DB / NATS / Redis / OpenSearch interactions |
| Contract | `pytest` against `openapi/phase1.yaml` | Every PR adding/modifying a public endpoint (Sprint 2+, OI-01) |
| E2E (web) | `playwright` | Per sprint, not per PR |
| Load | `k6` | Per sprint, run by DevOps |

`make test` runs all unit + integration suites locally.

---

## 6. Backward compatibility (GAP-27 / OI-01)

Phase 1 commitment: **no breaking API changes for clients in the wild**, OR a 2-sprint deprecation notice + ADR.

- Every PR's checklist has a backward-compat box. Tick it honestly.
- New required field on a request → breaking. Add as optional with a default.
- Removed field on a response → breaking. Mark deprecated, keep emitting for 2 sprints.
- Renamed field → breaking. Emit both old and new for 2 sprints; drop the old in a tracked PR.
- Mobile `min_version` bump is a coordination item, not just a code change. See [runbook tracked-missing list](runbook/README.md) — `mobile_expedited_review.md` is the playbook (owned by Mobile Leads, due T-7).
- Gateway middleware logs `X-Client-Version` on every request — use it to verify breakage hypotheses against real client distribution.

Contract test enforcement (a CI job that asserts response shapes against `openapi/phase1.yaml`) is tracked under [OI-01](docs/06_gaps_resolution/Appendix_OpenItems_GapRegister_v1.2.md), Sprint 2.

---

## 7. ADRs (Architecture Decision Records)

Write an ADR whenever a decision is **architectural in scope, not easily reversible, OR important to understand for future engineers**.

- Location: [docs/adr/](docs/adr/). Use [docs/adr/0000-template.md](docs/adr/0000-template.md).
- ID is zero-padded 4 digits: `0001`, `0002`, …
- Status lifecycle: `Proposed → Accepted → Superseded` (or `Deprecated`).
- A new ADR supersedes an old one — never edit an Accepted ADR's decision in place.
- Once Accepted: implement it. Disagree-and-commit. Re-open at architecture sync, not in PR review.

Index of decisions in memory; the source of truth is the files themselves. Cross-service or shared-schema PRs that don't reference an ADR will be asked to file one.

---

## 8. Security checklist (every PR)

Every author runs this before requesting review. Reviewer verifies.

- [ ] No secrets in code or commits (gitleaks pre-commit hook catches most; verify by eye for env vars).
- [ ] User input validated at the boundary — no raw input to SQL, no raw input to log strings used in template parsing.
- [ ] Authorisation check on every endpoint that touches user data (ownership: does the requesting user have a right to this resource?).
- [ ] Audit log call for every security-relevant action (login, password change, role grant, flag toggle, refund).
- [ ] No PII in logs (emails are PII; user IDs are fine; full names are PII).
- [ ] Trivy scan on new dependencies — High/Critical CVE blocks merge.

Full security review is a separate skill (see `/security-review`).

---

## 9. Where to put what

| If you're … | Look in |
|---|---|
| Adding a service | [services/](services/) — copy the closest existing service's structure |
| Adding shared library code | [libs/python/](libs/python/) or [libs/go/](libs/go/) (Sprint 1+) |
| Adding infra | [infrastructure/](infrastructure/) — Terraform module under `modules/`, env wiring under `live/` |
| Adding a Helm chart change | [infrastructure/k8s/charts/](infrastructure/k8s/charts/) — alp-service library for shared, per-service charts for overrides |
| Writing a runbook | [runbook/](runbook/) — see [runbook/README.md](runbook/README.md) format rules |
| Writing an ADR | [docs/adr/](docs/adr/) |
| Updating sprint plan / backlog | [docs/02_planning/](docs/02_planning/) |
| Updating gap register | Add an entry to [docs/06_gaps_resolution/ResolutionsLog_GapRegister_v1.2.md](docs/06_gaps_resolution/ResolutionsLog_GapRegister_v1.2.md); the .docx is updated at the next register revision |

---

## 10. Getting unblocked

The blocker rule (see [team_agreements.md §4.2](team_agreements.md)): you are never allowed to be blocked for more than **2 hours** without raising it.

| Blocked for | Action |
|---|---|
| < 30 min | Try to resolve yourself. Read the docs and the actual error. |
| 30–120 min | Ask in the relevant Slack channel. Tag someone specific if you know who. |
| 2+ hours | Post in `#sprint-N` with: what I'm trying to do, what I've tried, what I need. @mention Tech Lead or domain expert. Don't wait for standup. |
| Blocking another engineer | Drop your work. Their unblock is your priority. |

---

## 11. When in doubt

- About code style / convention → read existing code in the same service. Match it. If it disagrees with the linter, fix the code.
- About a design decision → ask in `#engineering-general`. Take it to architecture sync if it gets to 5+ messages.
- About scope → ask the PO via the relevant sprint channel.
- About this document → propose a change at the next retrospective. The team owns it; no one person can change it unilaterally.
