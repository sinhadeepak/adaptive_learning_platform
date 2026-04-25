# Contacts

**Purpose**: offline-readable mirror of who to reach during an incident. **PagerDuty is the source of truth** — use PagerDuty in the first instance; fall back to this file only if PagerDuty itself is unreachable.

**Do not hand-edit this file during an incident.** Stale contacts in a crisis are worse than no contacts — they burn minutes on dead ends. Keep this file current between incidents.

**Update cadence**: within 24h of any role/rostered-engineer change; verified at every Drill 2 (T-14).

---

## Escalation chain — quick reference

Per [delegation order](../docs/05_launch/03_DelegationOrder.md) §1. Walk in order; next level only if previous does not ack within the window.

| # | Role | Ack window | How to reach |
|---|---|---|---|
| 1 | DevOps on-call (rotating) | 5 min | PagerDuty page → Slack `#incident-response` mention |
| 2 | BE Tech Lead (Python) | 10 min | PagerDuty → phone (secondary) |
| 3 | Tech Lead | 15 min | PagerDuty → phone (secondary) |
| 4 | DevOps Lead | 20 min | PagerDuty → phone (secondary) |
| 5 | Staff Engineer / VP Engineering (blackout window only) | 30 min | PagerDuty → phone (secondary) → CTO approves engagement |

## Who holds each role

Fill in the names + contact methods. **Do not commit personal phone numbers to the repo** — store them in the team password manager (1Password vault "ALP on-call") and record only the PagerDuty ID + Slack handle here.

| Level | PagerDuty ID | Slack | Vault entry (1Password) | Last verified |
|---|---|---|---|---|
| 1 — DevOps on-call (rotation) | (rotation) | `@devops-oncall` | vault://alp-oncall/roster | _____ |
| 2 — BE Tech Lead (Python) | ______ | @______ | vault://alp-oncall/be-lead-python | _____ |
| 3 — Tech Lead | ______ | @______ | vault://alp-oncall/tech-lead | _____ |
| 4 — DevOps Lead | ______ | @______ | vault://alp-oncall/devops-lead | _____ |
| 5 — Staff Engineer / VP Eng | ______ | @______ | vault://alp-oncall/blackout-delegate | _____ |

---

## Related roles (not in the chain, but often needed)

| Role | Slack | Engage when |
|---|---|---|
| CTO | @______ | Any P0. Pre-authorised destructive action (see delegation order §2 "explicitly NOT pre-authorised"). Blackout level-5 engagement approval. |
| Head of Product | @______ | Customer-visible incident > 5 min. Payment-related incident. Status-page text decisions. |
| Security Lead | @______ | Any auth-bypass, data-exposure, or suspected breach. |
| QA Lead | @______ | Post-incident, for PIR review. |
| Legal | @______ | Any PII/data breach, regulatory-notification situations. |
| Customer Support Lead | @______ | User-facing-impact incidents — support needs talking points. |

---

## Vendor contacts

Third-party vendors with potential incident impact. Phone numbers and account IDs in the vault — this table is pointers only.

| Vendor | Reason to page | Vault entry |
|---|---|---|
| AWS support (Business plan) | EKS, Aurora, Secrets Manager, any region-level issue | vault://alp-vendor/aws-support |
| Stripe | Payment-processing incidents, webhook anomalies | vault://alp-vendor/stripe |
| Twilio | SMS OTP delivery issues | vault://alp-vendor/twilio |
| SendGrid | Email delivery issues (high bounce, reputation) | vault://alp-vendor/sendgrid |
| Cloudflare / CloudFront support | CDN cache-poisoning or routing issues | vault://alp-vendor/cloudfront |

Vendor outages that are already known are tracked in the dedicated runbook files (`stripe_regional_outage.md` etc.) — see [README.md](README.md).

---

## Status page + comms

- Status page: `status.adaptivelearn.in` (to be provisioned Sprint 3). Update within 15 min of customer-visible P1.
- Incident Slack: `#incident-response`. Every channel post mentions the incident ticket ID.
- Customer support bulletin: `#support-incident-bulletin` — HoP-owned.

---

## Blackout windows

When the primary on-call engineer cannot respond (planned leave, illness):

1. Engineer notifies DevOps Lead ≥ 24h in advance (exceptions: genuine emergencies).
2. DevOps Lead re-rosters PagerDuty directly — no informal "cover for me" handoffs via Slack.
3. If level 5 is ALSO unavailable (rare — vacation overlap), the engagement of an **external on-call contractor** is pre-arranged. Contractor contact lives in the vault: `vault://alp-vendor/external-oncall`. Activation requires CTO approval.

---

## How this file is kept current

- **Ownership**: DevOps Lead keeps this file in sync with PagerDuty.
- **Verification**: at every Drill 2 + Drill 2b, each row's "Last verified" date is updated.
- **PR rule**: role-change PRs touching this file get Tech Lead + DevOps Lead review within 1 business day.
