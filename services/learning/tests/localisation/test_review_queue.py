import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from learning.localisation import review_queue
from learning.main import app
from learning.types.bootstrap import register_all_v1_handlers
from learning.types.registry import is_supported

# Bootstrap the type handler registry so is_supported / get_handler work.
if not is_supported("MCQ_SINGLE"):
    register_all_v1_handlers()


async def _seed(session, qid):
    await session.execute(text("""
        INSERT INTO content_schema.questions
          (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type)
        VALUES (:id, :id, 'Stem', '["a","b"]'::jsonb, 0, 'en', 'PUBLISHED', :id, 'MCQ_SINGLE')
        ON CONFLICT (id) DO NOTHING
    """), {"id": qid})
    await session.execute(text("""
        INSERT INTO content_schema.content_artifact_translations
          (artifact_id, language, payload_translation, status, ai_confidence, version)
        VALUES (:id, 'hi', '{"stem":"अनुवाद"}'::jsonb, 'DRAFT', 0.8, 1)
        ON CONFLICT (artifact_id, language) DO UPDATE
          SET status='DRAFT', payload_translation=EXCLUDED.payload_translation
    """), {"id": qid})


@pytest.mark.asyncio
async def test_list_queue_returns_draft_with_source(content_session):
    q = "00000000-0000-0000-0000-0000000d0001"
    await _seed(content_session, q)
    await content_session.commit()
    out = await review_queue.list_queue(content_session, lang="hi", status="DRAFT")
    item = next(i for i in out["items"] if i["questionId"] == q)
    assert item["payloadTranslation"]["stem"] == "अनुवाद"
    assert "stem" in item["translatablePaths"]
    assert item["stem"] == "Stem"


@pytest.mark.asyncio
async def test_bulk_route_requires_admin():
    """POST /localisation/review-queue/bulk must reject unauthenticated callers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/localisation/review-queue/bulk",
            json={"decisions": [], "reviewerId": "11111111-1111-1111-1111-111111111111"},
        )
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_bulk_decide_publishes(content_session):
    q = "00000000-0000-0000-0000-0000000d0002"
    await _seed(content_session, q)
    await content_session.commit()
    out = await review_queue.bulk_decide(
        content_session,
        decisions=[{"questionId": q, "lang": "hi", "action": "approve"}],
        reviewer_id="11111111-1111-1111-1111-111111111111")
    await content_session.commit()
    assert out["results"][0]["ok"] is True
    status = (await content_session.execute(text("""
        SELECT status FROM content_schema.content_artifact_translations
         WHERE artifact_id = :q AND language = 'hi'
    """), {"q": q})).scalar()
    assert status == "PUBLISHED"
