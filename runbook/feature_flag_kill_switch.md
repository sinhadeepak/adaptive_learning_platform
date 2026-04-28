# Feature flag kill switch

**Purpose**: disable (or enable) a runtime feature across all tenants within 2 minutes. Used when a feature misbehaves in production and rollback is heavier than the flag toggle. Per [ADR-0001](../docs/adr/0001-feature-flag-platform.md) and GAP-29 Drill 3.

**Authorisation** (from [delegation order](../docs/05_launch/03_DelegationOrder.md) §2):
- **Any level 2+** may toggle Payment, Auth, or Quiz kill-switch flags (pre-authorised).
- **Level 3+** required for other flags.
- **Tenant-scoped override** (disable for a single tenant) is authorised from **level 2+** regardless of flag.

**Expected end-to-end latency** (drill target): < 2 minutes from Super Admin panel click to all pods observing the new value.

---

## 1. Identify the right flag

The authoritative flag list is in [seed script spec §7](../docs/02_planning/11_SeedScript_Specification.md). Common kill switches:

| Flag | Effect when toggled off | Blast radius |
|---|---|---|
| `irt_model_enabled` | Adaptive Engine falls back to binary-search cold-start | Adaptive quiz quality degrades; no outage |
| `push_channel_enabled` | Notification service drops push sends (FCM + APNs) | Users lose push notifications; no outage |
| `sms_channel_enabled` | Twilio calls skipped; OTP falls back to email | OTP delivery slower; some users can't log in if email also down |
| `email_channel_enabled` | SendGrid calls skipped | No OTP, no receipts, no alerts via email. **Only toggle off in extremis.** |
| `checkout_enabled` | Payment service rejects new checkout attempts with maintenance page | New subscriptions blocked; existing users unaffected |
| `premium_tier_enforcement` | All premium content becomes accessible to free users | Revenue loss per hour; usually turned on, not off |
| `assignments_enabled` | Institution teachers cannot create new assignments | Institution UX degrades; existing assignments unaffected |

**If unsure which flag**: check the service's structlog `service.startup` event — it logs the flags it reads at boot.

---

## 2. Execute — Super Admin panel (preferred, from Sprint 3 onward)

Use this path once the Super Admin UI is live.

1. Log in to Super Admin panel → Flags.
2. Find the flag by name.
3. To toggle **globally**: click the "default value" toggle. Confirm the consequence screen that shows expected blast radius.
4. To toggle for a single tenant: click "Tenants" → find the tenant → set the per-tenant override.
5. Enter a **reason** in the mandatory reason field (e.g. "Incident INC-1234, IRT engine returning NaN readiness"). This writes to `feature_flag_audit`.
6. Confirm.
7. Watch the audit log row appear with the correct `new_value`, `admin_user_id`, and `ts`.
8. Validate in logs: within 30 seconds, services should emit `flag.changed.applied` events showing the new value. SDK emits OTEL span `flag.decision` with `flag.source=tenant_override` or `global_default` as applicable.
9. Announce in `#incident-response`: "Flag `<name>` set to `<value>` globally/for tenant `<id>`. Effective now. Reason: `<reason>`."

## 3. Execute — CLI / direct SQL (Sprint 1–2 only)

Until Sprint 3 Super Admin UI lands, the same effect is achieved via authenticated CLI against the Institution flag endpoints. Only the Tech Lead performs this in Sprint 1–2.

1. Authenticate with an admin-scoped JWT: `export TOKEN=$(alp-auth mint --role=admin --expires=5m)`.
2. Global toggle:
   ```
   curl -X PUT https://institution.staging.adaptivelearn.in/api/v1/flags/irt_model_enabled \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"value": false, "reason": "INC-1234 IRT returning NaN"}'
   ```
3. Expect a 200 with the audit row returned in body.
4. Validate propagation as in §2 step 8.

**Direct SQL is a last resort** — only if the Institution service itself is the thing that's broken. Even then, write the audit row manually in the same transaction as the flag write. Never skip the audit row.

---

## 4. Validate propagation

Three signals must all be true within 30 seconds of toggle:

- Every service's next `get_flag(<name>, ...)` evaluation returns the new value.
- OTEL span `flag.decision` in services shows the new value with `flag.source` in {`tenant_override`, `global_default`, `cache_hit_local`} (not `hardcoded` — that would indicate Redis miss + NATS miss).
- No error log lines of the form `flag_sdk.nats.republish_failed` — those mean the event did not fan out and you are relying on Redis TTL only (35s worst case).

If within 60 seconds the change is not visible everywhere:

1. Check NATS: `nats stream report` — is the `flag` stream ingesting?
2. Check Redis: `GET flag:<name>:default` — is the value updated?
3. Force-restart one pod of a suspect service: `kubectl rollout restart deployment/<service>`. Fresh pod reads Redis on boot; if still wrong, the problem is in the write path, not the read.
4. Escalate to Tech Lead.

---

## 5. Reverting the toggle

A flag flip is trivially reversible — flip it back. Audit row captures both directions. **But**:

- If the flip-back happens within 10 minutes and is for the same flag, treat it as a "flag flap" — notify Tech Lead, add a one-line note to the incident ticket explaining why the original flip was wrong. Repeated flapping (3+ flips in an hour) on the same flag → freeze further toggles on that flag pending Tech Lead review.

---

## 6. Drill validation

This procedure is exercised as **Drill 3** at T-7 (per GAP-29). Pass criterion: end-to-end toggle → observed new value in all pods → in < 2 minutes. Drill script covers:

- Toggle via Super Admin panel (from Sprint 3 onward) — single flag, global scope.
- Toggle via CLI (Sprints 1–2) — same test.
- Per-tenant override — set, verify one tenant sees new value and another tenant still sees old value.
- NATS failure injection — block the `flag.changed` subject; verify Redis TTL fallback brings services to new value within 35 seconds.

---

## 7. What this is NOT for

- Gradual rollouts by user percentage — not supported in Phase 1 (tenant-based targeting only; see ADR-0001).
- A/B experiments — those are analytics-driven, not flag-driven in Phase 1.
- Permanent feature configuration — if a flag has stayed at the same value for 3 consecutive sprints, retire the flag and bake the value into code.
