"""Route inventory per old service.

This is the source of truth for what the contract tests cover. When a
sprint moves a module into the consolidated service, the routes for
that old service are replayed against the new service. Any route NOT
listed here is not covered — keep this list complete.

Format: {<old_service>: [(method, path_template, sample_body_or_None), ...]}

Path templates use {param} placeholders. The `record.py` helper
substitutes them with values from `recordings/<svc>/__params__.json`.
"""

from __future__ import annotations

ROUTES: dict[str, list[tuple[str, str, dict | None]]] = {
    # Engagement bundle (Sprint B)
    "analytics": [
        ("GET", "/analytics/cohorts/{cohortId}/leaderboard", None),
        ("GET", "/analytics/cohorts/{cohortId}/summary", None),
        ("GET", "/analytics/cohorts/{cohortId}/students/{userId}", None),
        ("GET", "/analytics/users/me/readiness", None),
        ("GET", "/analytics/users/me/streak", None),
        ("GET", "/analytics/users/me/mastery", None),
    ],
    "notification": [
        # Notification has no public HTTP routes — it's purely event-driven.
        # Contract tests still gate it via the JetStream durable consumers
        # (see test_engagement.py::test_notification_consumers_alive).
    ],
    # Learning bundle (Sprint C)
    "catalog": [
        ("GET", "/catalog/exams", None),
        ("GET", "/catalog/exams/{examId}/subjects", None),
        ("GET", "/catalog/subjects/{subjectId}/topics", None),
        ("GET", "/catalog/topics/{topicId}", None),
        ("GET", "/catalog/educators/me/exams", None),
        ("POST", "/catalog/educators/me/topics/{topicId}/authorize", {"questionDraftId": "<uuid>"}),
    ],
    "content": [
        ("POST", "/content/questions", {"topicId": "<uuid>", "stem": "?", "choices": ["a", "b", "c", "d"], "correctIdx": 0}),
        ("GET", "/content/questions", None),
        ("GET", "/content/questions/{questionId}", None),
        ("POST", "/content/questions/{questionId}/submit", None),
        ("POST", "/content/questions/{questionId}/review", {"approve": True}),
        ("POST", "/content/assignments", {"cohortId": "<uuid>", "title": "Quiz 1"}),
        ("GET", "/content/assignments", None),
        ("GET", "/content/assignments/{assignmentId}", None),
        ("PUT", "/content/assignments/{assignmentId}/questions", {"questionIds": []}),
        ("POST", "/content/assignments/{assignmentId}/publish", None),
        ("GET", "/content/assignments/{assignmentId}/leaderboard", None),
    ],
    "doubts": [
        ("POST", "/doubts", {"topicId": "<uuid>", "title": "?", "body": "?"}),
        ("GET", "/doubts", None),
        ("GET", "/doubts/{doubtId}", None),
        ("POST", "/doubts/{doubtId}/answers", {"body": "?"}),
        ("POST", "/doubts/{doubtId}/answers/{answerId}/accept", None),
    ],
    "search": [
        ("GET", "/search?q=mechanics", None),
        ("GET", "/search/typeahead?q=mech", None),
        # /admin/reindex is privileged, not in the parity set
    ],
    "adaptive_engine": [
        ("POST", "/adaptive/strategy/select", {"userId": "<uuid>", "topicId": "<uuid>"}),
        ("POST", "/adaptive/authoring/generate-questions", {"topicId": "<uuid>", "count": 3, "language": "en", "difficulty": "medium"}),
    ],
    # Identity bundle (Sprint D)
    "auth": [
        ("POST", "/auth/register", {"email": "x@y.z", "password": "P@ssw0rd!"}),
        ("POST", "/auth/otp/verify", {"email": "x@y.z", "otp": "123456"}),
        ("POST", "/auth/otp/resend", {"email": "x@y.z"}),
        ("POST", "/auth/login", {"email": "x@y.z", "password": "P@ssw0rd!"}),
        ("POST", "/auth/logout", None),
        ("POST", "/auth/refresh", {"refreshToken": "<token>"}),
        ("POST", "/auth/password/forgot", {"email": "x@y.z"}),
        ("POST", "/auth/password/reset", {"token": "<token>", "newPassword": "P@ssw0rd2!"}),
        ("GET", "/auth/me", None),
    ],
    "user_profile": [
        ("GET", "/profile/me", None),
        ("PUT", "/profile/preferences", {"locale": "en"}),
        ("GET", "/profile/exams", None),
        ("PUT", "/profile/exams", {"examIds": []}),
        ("GET", "/profile/bookmarks", None),
        ("POST", "/profile/bookmarks", {"questionId": "<uuid>"}),
        ("DELETE", "/profile/bookmarks/{bookmarkId}", None),
        ("GET", "/profile/achievements", None),
        ("GET", "/profile/mock-attempts", None),
        ("POST", "/profile/mock-attempts", {"mockId": "demo-mock-1", "score": 50}),
        ("GET", "/profile/notification-prefs", None),
        ("PUT", "/profile/notification-prefs", {"emailEnabled": True}),
    ],
    "institution": [
        ("GET", "/flags", None),
        ("GET", "/flags/{flagName}", None),
        ("POST", "/flags", {"name": "demo_flag", "description": "demo", "defaultValue": False}),
        ("PUT", "/flags/{flagName}", {"defaultValue": True}),
        ("GET", "/institution/tenants/{tenantId}/cohorts", None),
        ("GET", "/institution/cohorts/{cohortId}", None),
        ("GET", "/institution/cohorts/{cohortId}/members", None),
        ("POST", "/institution/cohorts/{cohortId}/invites", {"role": "STUDENT"}),
    ],
}


def all_routes() -> list[tuple[str, str, str, dict | None]]:
    """Flat list of (old_service, method, path, body) for iteration."""
    out = []
    for svc, routes in ROUTES.items():
        for method, path, body in routes:
            out.append((svc, method, path, body))
    return out
