"""Sprint 28 (P4-S28) — pure-function tests for the coverage aggregator."""

from __future__ import annotations

from engagement.analytics.syllabus_coverage import compute_coverage


def _topic(topic_id: str) -> dict:
    return {"topicId": topic_id, "title": topic_id, "questionCount": 20}


def _make_tree() -> dict:
    return {
        "examId": "e-jee",
        "subjects": [
            {
                "subjectId": "s-phy",
                "name": "Physics",
                "chapters": [
                    {"chapterId": "c-mech", "name": "Mechanics", "topics": [_topic("t-mech")]},
                    {"chapterId": "c-thermo", "name": "Thermodynamics", "topics": [_topic("t-thermo")]},
                    {"chapterId": "c-modern", "name": "Modern Physics", "topics": []},
                ],
            },
            {
                "subjectId": "s-math",
                "name": "Mathematics",
                "chapters": [
                    {"chapterId": "c-calc", "name": "Calculus", "topics": [_topic("t-calc")]},
                ],
            },
        ],
    }


def test_empty_tree_yields_zero_coverage() -> None:
    out = compute_coverage({"examId": "e", "subjects": []}, {})
    assert out["overallPct"] == 0
    assert out["totalTopics"] == 0
    assert out["subjects"] == []


def test_no_mastery_marks_chapters_not_started() -> None:
    out = compute_coverage(_make_tree(), {})
    physics = next(s for s in out["subjects"] if s["subjectId"] == "s-phy")
    statuses = {ch["chapterId"]: ch["status"] for ch in physics["chapters"]}
    assert statuses == {
        "c-mech": "not_started",
        "c-thermo": "not_started",
        "c-modern": "missing",  # zero topics
    }
    assert out["overallPct"] == 0


def test_high_mastery_marks_chapter_mastered() -> None:
    mastery = {"t-mech": 0.85, "t-thermo": 0.9}
    out = compute_coverage(_make_tree(), mastery)
    physics = next(s for s in out["subjects"] if s["subjectId"] == "s-phy")
    mech = next(ch for ch in physics["chapters"] if ch["chapterId"] == "c-mech")
    thermo = next(ch for ch in physics["chapters"] if ch["chapterId"] == "c-thermo")
    assert mech["status"] == "mastered"
    assert thermo["status"] == "mastered"


def test_partial_mastery_marks_chapter_developing() -> None:
    # Only attempted, not mastered
    mastery = {"t-mech": 0.5}
    out = compute_coverage(_make_tree(), mastery)
    physics = next(s for s in out["subjects"] if s["subjectId"] == "s-phy")
    mech = next(ch for ch in physics["chapters"] if ch["chapterId"] == "c-mech")
    assert mech["status"] == "developing"
    assert mech["attemptedTopics"] == 1
    assert mech["masteredTopics"] == 0


def test_chapter_with_zero_topics_is_missing() -> None:
    out = compute_coverage(_make_tree(), {})
    physics = next(s for s in out["subjects"] if s["subjectId"] == "s-phy")
    modern = next(ch for ch in physics["chapters"] if ch["chapterId"] == "c-modern")
    assert modern["status"] == "missing"
    assert modern["totalTopics"] == 0


def test_overall_pct_is_mastered_topics_over_total_topics() -> None:
    # 2 of 3 mapped topics mastered → 67%
    mastery = {"t-mech": 0.85, "t-calc": 0.8, "t-thermo": 0.3}
    out = compute_coverage(_make_tree(), mastery)
    assert out["totalTopics"] == 3
    assert out["masteredTopics"] == 2
    assert out["overallPct"] == 67


def test_subject_aggregates_match_chapter_sums() -> None:
    mastery = {"t-mech": 0.85, "t-thermo": 0.5}
    out = compute_coverage(_make_tree(), mastery)
    physics = next(s for s in out["subjects"] if s["subjectId"] == "s-phy")
    assert physics["totalTopics"] == 2
    assert physics["attemptedTopics"] == 2
    assert physics["masteredTopics"] == 1
    assert physics["totalChapters"] == 3
    assert physics["coveredChapters"] == 1


def test_avg_ewa_per_chapter_rounded() -> None:
    mastery = {"t-mech": 0.85}
    out = compute_coverage(_make_tree(), mastery)
    physics = next(s for s in out["subjects"] if s["subjectId"] == "s-phy")
    mech = next(ch for ch in physics["chapters"] if ch["chapterId"] == "c-mech")
    assert mech["avgEwa"] == 0.85


def test_missing_topic_id_treats_ewa_as_zero() -> None:
    """Defensive: tree topic with empty topicId should not blow up; treated
    as un-attempted."""
    tree = {
        "examId": "e",
        "subjects": [
            {
                "subjectId": "s",
                "name": "S",
                "chapters": [
                    {"chapterId": "c", "name": "C", "topics": [{"topicId": "", "title": "x", "questionCount": 0}]},
                ],
            }
        ],
    }
    out = compute_coverage(tree, {"some-other-topic": 0.9})
    chapter = out["subjects"][0]["chapters"][0]
    assert chapter["status"] == "not_started"
    assert chapter["masteredTopics"] == 0


def test_mastered_threshold_is_seventy_percent() -> None:
    """A chapter with 3 topics needs 3 mastered (100%) to mark mastered;
    2 of 3 (66.7%) doesn't cross the 70% bar."""
    tree = {
        "examId": "e",
        "subjects": [
            {
                "subjectId": "s",
                "name": "S",
                "chapters": [
                    {"chapterId": "c", "name": "C", "topics": [
                        _topic("t1"), _topic("t2"), _topic("t3"),
                    ]},
                ],
            }
        ],
    }
    # 2 of 3 mastered = 66.7% < 70%
    out = compute_coverage(tree, {"t1": 0.9, "t2": 0.9, "t3": 0.3})
    assert out["subjects"][0]["chapters"][0]["status"] == "developing"
    # 3 of 3 = 100% >= 70%
    out = compute_coverage(tree, {"t1": 0.9, "t2": 0.9, "t3": 0.9})
    assert out["subjects"][0]["chapters"][0]["status"] == "mastered"
