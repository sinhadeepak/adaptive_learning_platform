# AdaptiveLearn — Teacher / Institution Portal UI Kit
**Version 1.0 · April 2026 · CONFIDENTIAL**

## Who uses this portal
Teachers, subject-matter experts, and institution admins at schools and coaching centres enrolled on the platform. Institution admins additionally manage billing, seats, and student enrolment.

## Accent colour
**Green `#10C47A`** — distinct from student portal (blue) and admin portal (red).

## File index

### Foundation (4 files)
| File | Purpose |
|------|---------|
| `00_design-system.css` | Global tokens (shared across all portals) |
| `00_teacher-tokens.css` | Teacher-specific tokens: green accent, sidebar, risk cards, heatmap, doubt bubbles |
| `00_components.js` | Shared ALP.* component library |
| `00_README.md` | This file |

### Auth & Account screens (7 files — `00_` prefix)
| File | Screen |
|------|--------|
| `00_login.html` | Login — email/password, OTP, Google, Apple SSO |
| `00_register.html` | Register — invite link or email sign-up |
| `00_otp-verify.html` | OTP verification — 6-digit code entry |
| `00_reset-password.html` | Reset password — email request |
| `00_new-password.html` | New password — set and confirm |
| `00_profile-settings.html` | Profile & Settings — personal info, role, notifications, security, privacy |
| `00_role-permissions.html` | Role & Permissions — Institution Admin vs Teacher vs Expert capabilities |

### Main app screens (20 files — `01_`–`20_` prefix)
| File | Screen |
|------|--------|
| `01_dashboard.html` | Dashboard — KPIs, at-risk strip, mock alert, topic heatmap, distribution histogram |
| `02_students-all.html` | All Students — search, filter chips, sortable table |
| `03_student-detail.html` | Student Detail — full AI profile (θ, score, mastery matrix), session history, actions |
| `04_students-at-risk.html` | At-Risk Students — intervention cards with AI insight |
| `05_leaderboard.html` | Leaderboard — podium, ranked table, period selector |
| `06_assignments.html` | Assignments — active list with completion bars + create form with AI recommendation |
| `07_assignment-results.html` | Assignment Results — per-student breakdown, topic accuracy |
| `08_mock-tests.html` | Mock Tests — upcoming with countdown, schedule new, past results table |
| `09_mock-results-detail.html` | Mock Results Detail — score distribution, topic-level analysis, outlier students |
| `10_doubts.html` | Student Doubts — split list + thread + AI draft answer + send |
| `11_my-questions.html` | My Questions — approved bank with per-question analytics |
| `12_question-editor.html` | Question Editor — write, tag, preview, difficulty calibration |
| `13_upload-questions.html` | Upload Questions — single editor + bulk CSV with validation |
| `14_peer-review.html` | Peer Review Queue — review, approve, return, flag |
| `15_batch-analytics.html` | Batch Analytics — 4-week trend, subject bars, AI forecast |
| `16_session-reports.html` | Session Reports — weekly and monthly, export PDF |
| `17_announcements.html` | Announcements — compose, target segment, schedule, preview |
| `18_institution-settings.html` | Institution Settings — details, plan tier, seat count, billing |
| `19_notifications-inbox.html` | Notifications Inbox — all alerts, mark read, filter by type |
| `20_help-support.html` | Help & Support — FAQs, contact support, API/docs links |

## Role capabilities
| Capability | Teacher | Institution Admin |
|------------|---------|-------------------|
| View assigned student roster | ✅ | ✅ all students |
| View student readiness scores | ✅ own students | ✅ all students |
| Create and assign content | ✅ | ✅ |
| Schedule mock tests | ✅ | ✅ |
| Answer student doubts | ✅ | ✅ |
| Upload and submit questions | ✅ | ✅ |
| Peer review content | ✅ | ✅ |
| View batch analytics | ✅ own batch | ✅ institution-wide |
| Send batch announcements | ❌ | ✅ |
| Manage institution billing | ❌ | ✅ |
| Enrol / remove students | ❌ | ✅ |
| Grant institution admin access | ❌ | ❌ (platform admin only) |

---
*AdaptiveLearn Teacher Portal · v1.0 · April 2026 · CONFIDENTIAL*
