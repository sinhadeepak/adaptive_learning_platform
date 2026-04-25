# Post-Incident Review (PIR) — Template

**Purpose**: capture what happened, why, what we did, and what we'll change, in a fixed shape that supports pattern detection across incidents. Per GAP-30.

**When**: required for every P1 incident in production. Required for every rollback in production regardless of severity. Optional but encouraged for P2.

**Timing**: draft within 48 hours of incident close. Finalised within 7 days. Presented at next sprint review if severity P1.

**Authors**: incident commander drafts. Tech Lead reviews. Any named team in §5 actions reviews their portion.

**Audience**: Engineering, QA, Product, CTO. Non-confidential sections readable by stakeholders on request.

---

## How to use this template

1. Copy this file to `pirs/YYYY-MM-DD-<short-slug>.md` (e.g. `pirs/2026-05-14-quiz-500s-deploy.md`).
2. Fill in every section. If a section doesn't apply, say "N/A" — do not delete the heading.
3. Keep narrative tight. Headings carry the structure; prose is for clarifying, not performing.
4. Use absolute timestamps (IST) with seconds where possible. "Around 3pm" is not acceptable.
5. Blameless language — describe what happened, not who caused it. Names appear in §4 actions (as owners), not in §1–3 as subjects.

---

# PIR: <short descriptive title>

**Incident date**: YYYY-MM-DD
**Severity**: P0 / P1 / P2
**Detection lag**: <time from cause to first alert>
**Time to mitigate**: <time from first alert to customer-visible recovery>
**Time to resolve**: <time from first alert to root cause fixed, if different>
**Customer impact**: <affected services, % users, geographic scope, data loss? 1 sentence>
**Incident commander**: <name>
**Author of this PIR**: <name>

---

## 1. Summary

One paragraph. What broke, who noticed, how long it was broken, what we did, current state.

## 2. Timeline

Absolute IST, seconds-precision where possible. No speculation — only what was observed or logged.

| Time (IST) | Event |
|---|---|
| HH:MM:SS | Deploy of `<service>` revision `<sha>` began |
| HH:MM:SS | First 5xx alert fired on `<service>` |
| HH:MM:SS | On-call paged |
| HH:MM:SS | On-call acknowledged |
| HH:MM:SS | Rollback initiated |
| HH:MM:SS | Rollback complete |
| HH:MM:SS | Customer impact ended |
| HH:MM:SS | Root cause identified |
| HH:MM:SS | Permanent fix merged |

## 3. What happened

### 3.1 The trigger

What deploy, config change, traffic pattern, or external event set this off? Link the PR / commit / ticket / external incident.

### 3.2 The failure mode

What behaved unexpectedly? Include the technical detail — stack trace excerpt, query plan diff, config delta — that makes the mechanism clear. Screenshots of dashboards are welcome here; link them, do not embed.

### 3.3 Why it wasn't caught earlier

Testing gap? Staging-prod environment divergence? Monitoring blind spot? Be specific. "We don't test for X" is more useful than "we should have better tests".

### 3.4 How it was detected

Alert, user report, dashboard skim? Alert timing vs actual failure onset — detection lag is §0 metadata but §3.4 is the *story* of detection.

### 3.5 What made it worse, or what made it better

Compounding factors — an ongoing deploy freeze lift, a reassignment of on-call, a weekend, a concurrent vendor outage. Or helpful factors — circuit breaker tripped as designed, flag killswitch worked on first try. Both matter; include both.

## 4. Response

### 4.1 What went well

Name specific decisions and tools that helped. Use this to reinforce — these are the behaviours the team should keep doing.

### 4.2 What went poorly

Delays, miscommunications, broken tooling. Factual, not accusatory. "The rollback dashboard took 3 min to load because it queries an unindexed table" — not "the dashboard was useless".

### 4.3 Communications

Was #incident-response used correctly? Were stakeholders (HoP, CTO, support) notified at the right times? Was the status page updated? Response-time metrics by channel.

## 5. Actions

The most load-bearing section. Every action has a named owner and a due date. Vague actions ("improve monitoring") are rejected — write "add alert on `<metric>` crossing `<threshold>` by `<date>`".

| # | Action | Owner | Due | Severity | Status |
|---|---|---|---|---|---|
| 1 | | | | P0 / P1 / P2 | open / in-progress / done |
| 2 | | | | | |

**Severity of actions**:
- **P0** — must be done before the next related deploy. Blocks the affected codepath's progression.
- **P1** — must be done within 2 weeks.
- **P2** — tracked on the engineering backlog; no hard deadline.

## 6. What we are NOT changing (and why)

Equally important. List things that *could* be changed but aren't — with the reasoning. Prevents the PIR from becoming a grab-bag of "would be nice" items that never ship.

## 7. Metrics follow-up

For P0 / P1 incidents, per GAP-08: correlate the incident window with business metrics (signups, revenue, active quiz sessions, etc.). Record the observed business impact, not just the technical impact. If business metrics were unaffected, say so — that itself is a finding.

## 8. Appendix

- Logs: link(s) to log query or saved view.
- Dashboards: link(s) to the Grafana snapshot(s).
- Related PIRs: link prior incidents with similar cause or symptom.
- External references: vendor incident IDs (Stripe, AWS, SendGrid etc.) if applicable.

---

## Review checklist (for the Tech Lead)

Before a PIR is considered finalised:

- ☐ Timeline has seconds precision where data allowed
- ☐ Every action in §5 has named owner + due date + severity
- ☐ §6 exists and is non-empty
- ☐ §7 references the specific business metrics checked
- ☐ No blame-directed language in §1–3
- ☐ Linked from the incident ticket and the sprint retro agenda
