"""Exam lifecycle — retire / restore / delete (DB-backed)."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Iterator
from uuid import uuid4

import asyncpg
import jwt
import pytest
from fastapi.testclient import TestClient

from learning.content.config import settings
from learning.main import app

PREFIX = "/admin/exam-builder"


def _auth(role: str = "PLATFORM_ADMIN") -> dict[str, str]:
    tok = jwt.encode(
        {"sub": str(uuid4()), "role": role, "iat": int(time.time()),
         "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256",
    )
    return {"authorization": f"Bearer {tok}"}


async def _connect() -> asyncpg.Connection:
    return await asyncpg.connect(host="localhost", port=35432, user="postgres",
                                 password="postgres", database="learning_test")


async def _seed_exam(*, published: bool = True, with_topics: bool = True,
                     with_blueprint: bool = False, with_question: bool = False,
                     with_cross_refs: bool = False) -> dict:
    """Insert an exam (+subjects/topics, optionally a blueprint, a content
    question, and cross-ref rows). Returns ids + code for assertions."""
    conn = await _connect()
    try:
        exam_id = uuid4()
        code = f"LIFE_{uuid4().hex[:8].upper()}"
        await conn.execute(
            "INSERT INTO catalog_schema.exams (id, code, name, is_published) "
            "VALUES ($1, $2, $3, $4)", exam_id, code, "Lifecycle Exam", published)
        subject_id = uuid4()
        await conn.execute(
            "INSERT INTO catalog_schema.subjects (id, exam_id, code, name, is_published) "
            "VALUES ($1, $2, $3, $4, $5)",
            subject_id, exam_id, "SUB_A", "Subject A", published)
        topic_id = uuid4()
        if with_topics:
            await conn.execute(
                "INSERT INTO catalog_schema.topics (id, subject_id, code, title, is_published) "
                "VALUES ($1, $2, $3, $4, $5)",
                topic_id, subject_id, "T1", "Topic One", published)
        if with_blueprint:
            await conn.execute(
                "INSERT INTO catalog_schema.exam_blueprints "
                "(id, exam_id, name, total_questions, total_minutes, marks_correct, sections) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)",
                uuid4(), exam_id, "BP", 10, 30, 4, "[]")
        if with_question:
            await conn.execute(
                "INSERT INTO content_schema.questions "
                "(id, topic_id, stem, choices, correct_idx, created_by, status) "
                "VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)",
                uuid4(), topic_id, "Stem?", '["a","b"]', 0, uuid4(), "DRAFT")
        if with_cross_refs:
            await conn.execute(
                "INSERT INTO catalog_schema.educator_assignments (id, educator_id, exam_id) "
                "VALUES ($1, $2, $3)", uuid4(), uuid4(), exam_id)
            await conn.execute(
                "INSERT INTO catalog_schema.topic_importance_overrides "
                "(exam_id, topic_id, weight) VALUES ($1, $2, $3)",
                exam_id, topic_id, 0.5)
        return {"exam_id": str(exam_id), "code": code,
                "subject_id": str(subject_id), "topic_id": str(topic_id)}
    finally:
        await conn.close()


async def _cleanup(exam_id: str) -> None:
    conn = await _connect()
    try:
        eid = exam_id
        await conn.execute("DELETE FROM catalog_schema.topic_importance_overrides WHERE exam_id=$1::uuid", eid)
        await conn.execute("DELETE FROM catalog_schema.educator_assignments WHERE exam_id=$1::uuid", eid)
        await conn.execute(
            "DELETE FROM content_schema.questions WHERE topic_id IN "
            "(SELECT t.id FROM catalog_schema.topics t JOIN catalog_schema.subjects s "
            " ON s.id=t.subject_id WHERE s.exam_id=$1::uuid)", eid)
        await conn.execute(
            "DELETE FROM catalog_schema.topics WHERE subject_id IN "
            "(SELECT id FROM catalog_schema.subjects WHERE exam_id=$1::uuid)", eid)
        await conn.execute("DELETE FROM catalog_schema.subjects WHERE exam_id=$1::uuid", eid)
        await conn.execute("DELETE FROM catalog_schema.subject_pools WHERE exam_id=$1::uuid", eid)
        await conn.execute("DELETE FROM catalog_schema.exam_blueprints WHERE exam_id=$1::uuid", eid)
        await conn.execute("DELETE FROM catalog_schema.exams WHERE id=$1::uuid", eid)
    finally:
        await conn.close()


async def _published_flags(exam_id: str) -> dict:
    conn = await _connect()
    try:
        e = await conn.fetchval("SELECT is_published FROM catalog_schema.exams WHERE id=$1::uuid", exam_id)
        s = await conn.fetchval("SELECT bool_and(is_published) FROM catalog_schema.subjects WHERE exam_id=$1::uuid", exam_id)
        t = await conn.fetchval(
            "SELECT bool_and(is_published) FROM catalog_schema.topics WHERE subject_id IN "
            "(SELECT id FROM catalog_schema.subjects WHERE exam_id=$1::uuid)", exam_id)
        return {"exam": e, "subjects": s, "topics": t}
    finally:
        await conn.close()


@pytest.fixture(autouse=True)
def _reset_catalog_engine() -> Iterator[None]:
    """Reset the catalog DB engine singleton before + after each test.

    The catalog ``db`` module caches an AsyncEngine as a module-level
    singleton.  Any ``asyncio.run()`` call (used for direct-asyncpg seeding
    inside test bodies) creates a brand-new event loop and closes the old one,
    leaving the cached engine bound to a dead loop.  Resetting to ``None``
    forces FastAPI's dependency injection to build a fresh engine on whichever
    loop TestClient is currently running, avoiding the
    "Future attached to a different loop" RuntimeError from asyncpg.
    """
    from learning.catalog import db as catalog_db

    catalog_db._engine = None
    catalog_db._sessionmaker = None
    yield
    catalog_db._engine = None
    catalog_db._sessionmaker = None


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_retire_requires_admin(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam())
    try:
        r = client.post(f"{PREFIX}/exams/{seed['exam_id']}/retire", headers=_auth("STUDENT"))
        assert r.status_code == 403
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))


def test_retire_unknown_exam_404(client: TestClient) -> None:
    r = client.post(f"{PREFIX}/exams/{uuid4()}/retire", headers=_auth())
    assert r.status_code == 404


def test_retire_flips_published_false(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam(published=True))
    try:
        r = client.post(f"{PREFIX}/exams/{seed['exam_id']}/retire", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["code"] == seed["code"]
        assert body["subjects_retired"] == 1
        assert body["topics_retired"] == 1
        flags = asyncio.run(_published_flags(seed["exam_id"]))
        assert flags == {"exam": False, "subjects": False, "topics": False}
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))


def test_restore_unknown_exam_404(client: TestClient) -> None:
    r = client.post(f"{PREFIX}/exams/{uuid4()}/restore", headers=_auth())
    assert r.status_code == 404


def test_restore_reverses_retire(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam(published=False))
    try:
        r = client.post(f"{PREFIX}/exams/{seed['exam_id']}/restore", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["subjects_restored"] == 1
        assert body["topics_restored"] == 1
        flags = asyncio.run(_published_flags(seed["exam_id"]))
        assert flags == {"exam": True, "subjects": True, "topics": True}
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))


async def _exam_exists(exam_id: str) -> bool:
    conn = await _connect()
    try:
        v = await conn.fetchval("SELECT 1 FROM catalog_schema.exams WHERE id=$1::uuid", exam_id)
        return v is not None
    finally:
        await conn.close()


async def _row_counts(exam_id: str) -> dict:
    conn = await _connect()
    try:
        subj = await conn.fetchval("SELECT COUNT(*) FROM catalog_schema.subjects WHERE exam_id=$1::uuid", exam_id)
        top = await conn.fetchval(
            "SELECT COUNT(*) FROM catalog_schema.topics WHERE subject_id IN "
            "(SELECT id FROM catalog_schema.subjects WHERE exam_id=$1::uuid)", exam_id)
        ea = await conn.fetchval("SELECT COUNT(*) FROM catalog_schema.educator_assignments WHERE exam_id=$1::uuid", exam_id)
        tio = await conn.fetchval("SELECT COUNT(*) FROM catalog_schema.topic_importance_overrides WHERE exam_id=$1::uuid", exam_id)
        return {"subjects": subj, "topics": top, "educator_assignments": ea, "importance": tio}
    finally:
        await conn.close()


def test_delete_requires_admin(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam())
    try:
        r = client.delete(f"{PREFIX}/exams/{seed['exam_id']}", headers=_auth("STUDENT"))
        assert r.status_code == 403
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))


def test_delete_unknown_exam_404(client: TestClient) -> None:
    r = client.delete(f"{PREFIX}/exams/{uuid4()}", headers=_auth())
    assert r.status_code == 404


def test_delete_blocked_by_blueprint_409(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam(with_blueprint=True))
    try:
        r = client.delete(f"{PREFIX}/exams/{seed['exam_id']}", headers=_auth())
        assert r.status_code == 409
        body = r.json()["detail"]
        assert body["code"] == "exam_in_use"
        assert body["blueprintCount"] == 1
        assert body["questionCount"] == 0
        assert asyncio.run(_exam_exists(seed["exam_id"])) is True  # nothing deleted
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))


def test_delete_blocked_by_question_409(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam(with_question=True))
    try:
        r = client.delete(f"{PREFIX}/exams/{seed['exam_id']}", headers=_auth())
        assert r.status_code == 409
        body = r.json()["detail"]
        assert body["questionCount"] == 1
        assert asyncio.run(_exam_exists(seed["exam_id"])) is True
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))


def test_delete_clean_exam_removes_all_rows(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam(with_cross_refs=True))
    try:
        r = client.delete(f"{PREFIX}/exams/{seed['exam_id']}", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["code"] == seed["code"]
        assert body["subjects_deleted"] == 1
        assert body["topics_deleted"] == 1
        assert asyncio.run(_exam_exists(seed["exam_id"])) is False
        counts = asyncio.run(_row_counts(seed["exam_id"]))
        assert counts == {"subjects": 0, "topics": 0,
                          "educator_assignments": 0, "importance": 0}
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))
