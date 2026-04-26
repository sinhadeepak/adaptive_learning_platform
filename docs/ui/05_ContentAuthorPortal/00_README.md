# AdaptiveLearn — Content Author Portal UI Kit
**Version 1.0 · April 2026 · CONFIDENTIAL**

## Accent colour
**Purple `#A78BFA`** — distinct from Student (blue), Teacher (green), Admin (red).

## Who uses this portal
- **Experts** — subject-matter experts who create questions and answer student doubts
- **Teachers** — same as Experts, plus institution-level features (when assigned)

## Screen inventory — 28 screens + 4 foundation files

### Auth & Account (9 files — `00_` prefix — includes ALL minor screens)
| File | Screen |
|------|--------|
| `00_login.html` | Login — email/pw, Google, Apple SSO, OTP strip |
| `00_register-apply.html` | Register / Apply — sample question, qualifications, specialisation |
| `00_otp-verify.html` | OTP verification — 6-box entry, countdown, resend |
| `00_reset-password.html` | Reset password — email entry, OTP alternative |
| `00_new-password.html` | New password — strength bar, match indicator, bcrypt note |
| `00_profile.html` | Profile — avatar, bio, subjects, exams, stats card, completion bar |
| `00_settings.html` | Settings — Security, Notifications (push+email), Preferences, Privacy, Payouts |
| `00_roles-permissions.html` | Roles — Expert vs Teacher vs Institution Admin capability matrix |
| `00_notifications.html` | Notifications inbox — content approved/returned, doubts, earnings, peer review |

### Main App (19 files — `01_`–`19_` prefix)
| File | Screen |
|------|--------|
| `01_dashboard.html` | Dashboard — KPIs, content status 4-tile, week's performance, AI insight |
| `02_my-content.html` | My Content — questions & courses, filter chips, status tags, per-item actions |
| `03_question-editor.html` | Question Editor — stem, 4 options (click to mark correct), explanation, tags, IRT AI estimate, moderator feedback panel |
| `04_question-preview.html` | Question Preview — exact student view with correct answer highlighted and explanation |
| `05_upload-bulk.html` | Bulk Upload — drag-drop CSV/Excel, validation report (per-row errors), fix prompt |
| `06_upload-jobs.html` | Upload Jobs — async job tracker for batches >500 (PROCESSING/COMPLETE/FAILED) |
| `07_course-builder.html` | Course Builder — chapter list, drag-to-reorder, add topic, add question |
| `08_course-preview.html` | Course Preview — full student view of course structure and content |
| `09_peer-review-queue.html` | Peer Review Queue — batches awaiting review, reviewer stats |
| `10_peer-review-item.html` | Peer Review Item — question display, review comment box, Approve/Return/Flag |
| `11_doubts-queue.html` | Student Doubts Queue — all unanswered, filter by subject, priority for at-risk |
| `12_doubt-thread.html` | Doubt Thread — conversation view, AI student context, AI draft, send |
| `13_content-analytics.html` | Content Analytics — total attempts, accuracy distribution, top questions table |
| `14_question-analytics.html` | Single Question Deep Dive — attempt timeline, accuracy by student segment, flag rate |
| `15_earnings-dashboard.html` | Earnings — monthly chart, payout history, per-attempt rate, upcoming payout |
| `16_payout-settings.html` | Payout Settings — bank account, PAN verification, tax documents |
| `17_help-support.html` | Help — FAQs, contact form, resource links |
| `18_application-status.html` | Application Status — pending review / approved / rejected with reason |
| `19_appeal-rejection.html` | Appeal Rejection — submit appeal for a rejected question with supporting argument |

## Key design decisions

### Question editor — IRT integration
The editor shows an AI-estimated b-parameter (difficulty) and discrimination value based on the question stem and topic. These are estimates only — actual values are calibrated by real student responses after approval. The `irt_model_enabled` feature flag controls whether this panel is shown (GAP-16 from the gap register).

### Moderator feedback panel
When a question is returned, the editor shows the moderator's written comment inline — creators don't need to navigate elsewhere. The returned question is pre-loaded with the original content ready to fix.

### Peer review — self-review prevention
The peer review queue excludes any content submitted by the reviewing creator. This is enforced at the API layer (Content Service returns `CANNOT_REVIEW_OWN_CONTENT` 403) and reflected in the UI by simply not showing own submissions in the queue.

### Earnings model
Creators earn per question attempt at a blended rate (~₹0.0113/attempt). Premium student attempts earn more than Free tier. Payouts on 26th of each month. PAN verification required before first payout. Tax statements available in-app.

---
*AdaptiveLearn Content Author Portal · v1.0 · April 2026 · CONFIDENTIAL*
