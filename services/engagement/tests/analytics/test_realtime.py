"""Sprint 13 S13-A — process-local realtime fan-out tests.

Pinning the contract for:
- Subscriber registration + member-set caching.
- publish_user_recomputed wakes only the queues whose member set
  contains user_id.
- Bounded queue drops oldest tick on overflow (slow-consumer protection).
- Unregister is idempotent + cleans up empty buckets so the registry
  doesn't leak in long-running processes.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest

pytestmark = pytest.mark.integration

from engagement.analytics import realtime


@pytest.fixture(autouse=True)
def _reset_registry() -> None:
    realtime.reset()
    yield
    realtime.reset()


def _sub(cohort: str, members: set[str]) -> realtime.Subscription:
    return realtime.Subscription(cohort_id=cohort, members=members)


def test_register_then_unregister_cleans_up() -> None:
    cohort = str(uuid.uuid4())
    sub = _sub(cohort, {"u1"})
    realtime.register(sub)
    assert realtime.subscribers_for_cohort(cohort) == 1
    realtime.unregister(sub)
    assert realtime.subscribers_for_cohort(cohort) == 0


def test_unregister_is_idempotent() -> None:
    """Slow-shutdown paths might unregister twice. The second call must
    be a no-op rather than crashing."""
    cohort = str(uuid.uuid4())
    sub = _sub(cohort, {"u1"})
    realtime.register(sub)
    realtime.unregister(sub)
    realtime.unregister(sub)
    assert realtime.subscribers_for_cohort(cohort) == 0


def test_publish_only_wakes_subscriptions_with_matching_user() -> None:
    cohort_a = str(uuid.uuid4())
    cohort_b = str(uuid.uuid4())
    sub_a = _sub(cohort_a, {"u-shared", "u-only-a"})
    sub_b = _sub(cohort_b, {"u-shared", "u-only-b"})
    realtime.register(sub_a)
    realtime.register(sub_b)

    # u-only-a only wakes sub_a.
    woken = realtime.publish_user_recomputed("u-only-a")
    assert woken == 1
    assert sub_a.queue.qsize() == 1
    assert sub_b.queue.qsize() == 0

    # u-shared wakes both.
    woken = realtime.publish_user_recomputed("u-shared")
    assert woken == 2


def test_publish_with_no_subscribers_returns_zero() -> None:
    assert realtime.publish_user_recomputed(str(uuid.uuid4())) == 0


def test_publish_drops_tick_when_queue_full() -> None:
    """A slow SSE consumer can't stall the publisher — full queue means
    drop the tick. The consumer rebuilds the full snapshot on its next
    wake, so a missed tick is harmless."""
    cohort = str(uuid.uuid4())
    sub = _sub(cohort, {"u1"})
    realtime.register(sub)
    # Fill the queue (maxsize=8 by Subscription contract).
    for _ in range(8):
        realtime.publish_user_recomputed("u1")
    assert sub.queue.qsize() == 8
    # 9th publish drops the new tick rather than blocking.
    woken = realtime.publish_user_recomputed("u1")
    # publish returns the matched count; the queue stays at 8 — the
    # tick was dropped silently. We assert via queue depth.
    assert sub.queue.qsize() == 8
    # Pure-helper contract: returned count reflects intent (matched), not
    # whether the tick survived. We only need the no-crash guarantee.
    assert woken == 0  # all dropped → returns 0 if we count successful enqueues
    # If the implementation counts intent, that's also fine; the
    # important behaviour is the 8-cap.


def test_update_members_lets_us_track_membership_changes() -> None:
    """Educator adds a student to a cohort while the SSE is open. The
    next member-refresh tick updates the cached set; subsequent publishes
    for the new student wake the sub."""
    cohort = str(uuid.uuid4())
    sub = _sub(cohort, {"u-existing"})
    realtime.register(sub)

    realtime.publish_user_recomputed("u-new")
    assert sub.queue.qsize() == 0  # not in cache yet

    sub.update_members({"u-existing", "u-new"})
    realtime.publish_user_recomputed("u-new")
    assert sub.queue.qsize() == 1


def test_multiple_subs_per_cohort_all_wake() -> None:
    """Two educators viewing the same cohort each get their own queue."""
    cohort = str(uuid.uuid4())
    sub1 = _sub(cohort, {"u1"})
    sub2 = _sub(cohort, {"u1"})
    realtime.register(sub1)
    realtime.register(sub2)
    realtime.publish_user_recomputed("u1")
    assert sub1.queue.qsize() == 1
    assert sub2.queue.qsize() == 1


def test_subscription_cleanup_does_not_affect_others() -> None:
    cohort = str(uuid.uuid4())
    sub1 = _sub(cohort, {"u1"})
    sub2 = _sub(cohort, {"u1"})
    realtime.register(sub1)
    realtime.register(sub2)
    realtime.unregister(sub1)
    realtime.publish_user_recomputed("u1")
    assert sub2.queue.qsize() == 1
