"""GET /admin/exam-builder/exams — question_count + blueprint_count fields."""
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
        settings.jwt_secret, algorithm="HS256")
    return {"authorization": f"Bearer {tok}"}


async def _connect() -> asyncpg.Connection:
    return await asyncpg.connect(host="localhost", port=35432, user="postgres",
                                 password="postgres", database="learning_test")


async def _seed() -> dict:
    conn = await _connect()
    try:
        exam_id, subject_id, topic_id = uuid4(), uuid4(), uuid4()
        code = f"CNT_{uuid4().hex[:8].upper()}"
        await conn.execute("INSERT INTO catalog_schema.exams (id, code, name) VALUES ($1,$2,$3)",
                           exam_id, code, "Counts Exam")
        await conn.execute("INSERT INTO catalog_schema.subjects (id, exam_id, code, name) VALUES ($1,$2,$3,$4)",
                           subject_id, exam_id, "SUB_A", "Subject A")
        await conn.execute("INSERT INTO catalog_schema.topics (id, subject_id, code, title) VALUES ($1,$2,$3,$4)",
                           topic_id, subject_id, "T1", "Topic One")
        await conn.execute(
            "INSERT INTO content_schema.questions (id, topic_id, stem, choices, correct_idx, created_by, status) "
            "VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)",
            uuid4(), topic_id, "Q?", '["a","b"]', 0, uuid4(), "DRAFT")
        await conn.execute(
            "INSERT INTO catalog_schema.exam_blueprints "
            "(id, exam_id, name, total_questions, total_minutes, marks_correct, sections) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)", uuid4(), exam_id, "BP", 10, 30, 4, "[]")
        return {"exam_id": str(exam_id), "code": code}
    finally:
        await conn.close()


async def _cleanup(exam_id: str) -> None:
    conn = await _connect()
    try:
        await conn.execute(
            "DELETE FROM content_schema.questions WHERE topic_id IN "
            "(SELECT t.id FROM catalog_schema.topics t JOIN catalog_schema.subjects s "
            " ON s.id=t.subject_id WHERE s.exam_id=$1::uuid)", exam_id)
        await conn.execute("DELETE FROM catalog_schema.exam_blueprints WHERE exam_id=$1::uuid", exam_id)
        await conn.execute(
            "DELETE FROM catalog_schema.topics WHERE subject_id IN "
            "(SELECT id FROM catalog_schema.subjects WHERE exam_id=$1::uuid)", exam_id)
        await conn.execute("DELETE FROM catalog_schema.subjects WHERE exam_id=$1::uuid", exam_id)
        await conn.execute("DELETE FROM catalog_schema.exams WHERE id=$1::uuid", exam_id)
    finally:
        await conn.close()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_list_includes_question_and_blueprint_counts(client: TestClient) -> None:
    seed = asyncio.run(_seed())
    try:
        r = client.get(f"{PREFIX}/exams", headers=_auth())
        assert r.status_code == 200
        entry = next(e for e in r.json() if e["id"] == seed["exam_id"])
        assert entry["question_count"] == 1
        assert entry["blueprint_count"] == 1
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))
