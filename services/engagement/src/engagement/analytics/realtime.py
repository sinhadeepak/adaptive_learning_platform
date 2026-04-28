"""Sprint 13 S13-A — process-local realtime fan-out for the cohort
leaderboard SSE.

Why process-local rather than a NATS topic per cohort: an SSE handler
runs inside the analytics process; it doesn't survive process
restart anyway. Subscribers are ephemeral — when the educator closes
the tab the queue can be GC'd. Routing through NATS would add latency
+ a separate broker hop without buying durability.

Wiring:
  Quiz publishes `quiz.session.completed` to NATS.
  → analytics/events.py durable consumer calls process_session().
  → After commit, that handler ALSO calls publish_user_recomputed() here.
  → fanout: every queue subscribed to a cohort the user belongs to gets
    a tick.
  → SSE handler wakes, rebuilds the snapshot, emits a `delta` if the
    digest changed.

Cohort membership is fetched once when the SSE connects (from the
existing `fetch_cohort_members` HTTP path) and cached on the subscription.
That avoids hitting Institution on every event — re-fetch is rate-limited
to once per 60s.

Pure helpers (`_register`, `_unregister`, `publish_user_recomputed`) are
extracted so unit tests can pin the contract without standing up an SSE
client or NATS.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

log = logging.getLogger(__name__)

# In-process registry: cohort_id → set of subscriber objects. Each
# subscriber is the queue + the cached member set + the cohort_id it
# subscribed to.
_subscribers: dict[str, set["Subscription"]] = defaultdict(set)


class Subscription:
    """One SSE connection's wake-up channel.

    The queue is bounded (maxsize=8) so a slow consumer can't stall the
    publisher. When full, we drop the oldest event — the SSE handler
    rebuilds the full snapshot every time it wakes, so missing one tick
    just means the next tick covers it.
    """

    __slots__ = ("cohort_id", "members", "queue")

    def __init__(self, cohort_id: str, members: set[str]) -> None:
        self.cohort_id = cohort_id
        self.members: set[str] = members
        self.queue: asyncio.Queue[None] = asyncio.Queue(maxsize=8)

    def has_member(self, user_id: str) -> bool:
        return user_id in self.members

    def update_members(self, members: set[str]) -> None:
        """Refresh the cached member set — called on the periodic re-fetch."""
        self.members = members


def register(subscription: Subscription) -> None:
    """Add a subscription to the cohort's fan-out set."""
    _subscribers[subscription.cohort_id].add(subscription)


def unregister(subscription: Subscription) -> None:
    """Remove on disconnect. Idempotent — calling twice is fine."""
    bucket = _subscribers.get(subscription.cohort_id)
    if bucket is None:
        return
    bucket.discard(subscription)
    if not bucket:
        # Trim empty buckets so the dict doesn't grow unboundedly when
        # a long-running process serves many short-lived cohorts.
        _subscribers.pop(subscription.cohort_id, None)


def publish_user_recomputed(user_id: str) -> int:
    """Wake every subscription whose member set contains `user_id`.

    Returns the number of queues we woke. Pure-ish: side-effect is
    putting a tick on each queue. Drops the tick when the queue is
    full (slow consumer protection — see Subscription docstring).
    """
    woken = 0
    # Snapshot the values list because handlers may unregister mid-iteration.
    for subscriptions in list(_subscribers.values()):
        for sub in list(subscriptions):
            if not sub.has_member(user_id):
                continue
            try:
                sub.queue.put_nowait(None)
                woken += 1
            except asyncio.QueueFull:
                # Slow consumer; the next tick (or the heartbeat) will
                # cover it. Don't block the publisher.
                log.debug(
                    "realtime queue full for cohort=%s; dropped tick",
                    sub.cohort_id,
                )
    return woken


def subscribers_for_cohort(cohort_id: str) -> int:
    """Visible-for-test count of registered subscriptions."""
    return len(_subscribers.get(cohort_id, set()))


def reset() -> None:
    """Test-only: drop all subscriptions. Production shouldn't call this."""
    _subscribers.clear()
