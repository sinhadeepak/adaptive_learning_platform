# AdaptiveLearn — Admin Portal UI Kit
**Version 1.0 · Internal Operations · PLATFORM ADMIN ONLY · April 2026 · CONFIDENTIAL**

> ⚠️ This portal is for internal use only. Do not share externally.
> All actions are logged immutably in the audit trail.

## File Index

### Shared design system (4 files)
| File | Description |
|------|-------------|
| `00_design-system.css` | Global tokens, reset, shared components (shared across all portals) |
| `00_admin-tokens.css` | Admin-specific tokens — red accent, sidebar, audit log, escalation cards, queue items, health tiles |
| `00_components.js` | Shared ALP.* component library |
| `00_README.md` | This file |

### Admin screens (17 files)
| File | Screen | Access |
|------|--------|--------|
| `01_dashboard.html` | Platform Dashboard — KPIs, revenue, moderation alerts, SLO health | PLATFORM |
| `02_users.html` | User Management — Search, filter, view, suspend, ban, impersonate | PLATFORM |
| `03_escalations.html` | Escalations — Behavioural & content disputes requiring admin action | PLATFORM |
| `04_moderation-queue.html` | Moderation Queue — Content, discussion, behaviour queues | PLATFORM |
| `05_creator-applications.html` | Creator Applications — Review, approve, reject, onboard | PLATFORM |
| `06_exam-syllabus.html` | Exam & Syllabus Configuration — Topics, weightages, difficulty bands | PLATFORM |
| `07_screening-test.html` | Screening Test — Curated question set management per exam | PLATFORM |
| `08_institutions.html` | Institutions — All 142, billing, students, performance | PLATFORM |
| `09_create-institution.html` | Create Institution — Plan, seats, billing contact, admin assignment | PLATFORM |
| `10_revenue.html` | Revenue Dashboard — MRR, charts, subscription breakdown | PLATFORM |
| `11_subscriptions.html` | Subscription Management — Individual & institution lifecycle | PLATFORM |
| `12_refunds.html` | Refunds — Process, audit, Stripe reconciliation | PLATFORM |
| `13_announcements.html` | Announcements — Compose, segment, schedule, preview | PLATFORM |
| `14_moderators.html` | Moderator Management — Team, performance targets, access | PLATFORM |
| `15_configuration.html` | Platform Configuration — Plans, pricing, feature flags | PLATFORM |
| `16_audit-log.html` | Audit Log — Immutable action history, search, export | PLATFORM |
| `17_impersonate.html` | Impersonate User — Read-only 15-min session, auto-logged | PLATFORM |

## Admin Portal Design System

### Colour language
The Admin Portal uses **red** as its primary accent instead of the student portal's blue. This is a deliberate design decision — it visually distinguishes the admin surface from the student-facing product and signals elevated permission level.

```css
--admin-accent:        #F43F5E;   /* active nav, CTAs, badges */
--admin-accent-light:  rgba(244,63,94,0.12);
--admin-accent-border: rgba(244,63,94,0.22);
```

### Severity colour system (audit log, escalations)
```css
--severity-high:   #F43F5E;   /* suspensions, bans, access grants, impersonation */
--severity-medium: #F5A623;   /* refunds, announcements, syllabus changes */
--severity-low:    #10C47A;   /* creator approvals, institution creation */
--severity-info:   #4F87F6;   /* informational entries */
```

### Layout spec
```
Sidebar:    220px fixed (wider than student portal — more nav items)
Topbar:     48px fixed (taller than student portal — admin context indicator)
Tab bar:    40px fixed (present on most screens)
Content:    remainder, scrollable
Detail pane:320px fixed (user detail, queue item detail)
```

### Key admin-specific CSS classes (from 00_admin-tokens.css)
```css
.admin-sidebar           /* 220px left nav */
.admin-logo-bar          /* Logo + portal name + PLATFORM badge */
.admin-nav-item          /* Sidebar nav item with active state */
.admin-nav-badge         /* Count badge (red/amber/green) */
.admin-topbar            /* 48px top bar with live indicator */
.admin-tabbar            /* Tab bar for sub-sections */
.admin-tab               /* Individual tab with badge support */
.btn-admin-primary       /* Red primary CTA */
.btn-admin-ghost         /* Ghost button */
.admin-alert-banner      /* Red alert strip (escalations) */
.escalation-card         /* Escalation action card (red/amber variants) */
.queue-item              /* Moderation queue card (.urgent, .selected) */
.admin-user-row          /* User table row (.suspended, .banned, .selected) */
.audit-log-row           /* Audit log entry with severity badge */
.audit-severity          /* .severity-high/medium/low */
.admin-stat-strip        /* Horizontal stats bar */
.institution-table       /* Institution data table */
.health-tile             /* SLO health tile (.met, .breach, .warning) */
.creator-app-card        /* Creator application review card */
```

## Security Implementation Notes

### Every sensitive action follows this pattern:
```
1. Admin initiates action (suspend, ban, refund, role change, impersonate)
2. Confirmation modal with written reason requirement (where applicable)
3. audit_log INSERT (atomic with the action — if log write fails, action rolls back)
4. Action executed
5. Notification dispatched (to affected user where appropriate)
```

### Specific restrictions enforced at service layer:
- **Impersonation**: Read-only · 15-minute JWT · cannot perform writes · every session logged with reason · user not notified (by design, per BRD ADM-REQ-05)
- **Suspensions**: Written reason mandatory · stored immutably · reversible
- **Bans**: Written reason mandatory · stored immutably · data retained per policy · irreversible without admin override
- **Admin access grants**: Actor + target + old/new level all logged · PLATFORM admin cannot be modified by another PLATFORM admin (per BRD)
- **Refunds**: Full or partial · reason required · processed to original payment method · all logged
- **Announcements**: Preview required before send · cannot be unsent · logged with recipient count
- **Syllabus changes**: Preview before publish · changes effective immediately for new sessions only

### Audit log
- Append-only PostgreSQL table · no UPDATE or DELETE permissions on audit_schema
- Partitioned by month · retained minimum 3 years
- Searchable by event type, actor, target, date range
- Exportable: max 90-day window per CSV export
- Severity tagging: HIGH (user management, access), MEDIUM (financial, content), LOW (approvals, notifications)

---
*AdaptiveLearn Admin Portal · v1.0 · April 2026 · PLATFORM ADMIN ONLY · CONFIDENTIAL*
