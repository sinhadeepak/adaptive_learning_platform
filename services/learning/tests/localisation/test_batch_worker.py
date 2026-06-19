import pytest
from sqlalchemy import text

from learning.content.db import sessionmaker as content_sessionmaker
from learning.localisation import batch_repo, batch_worker
from learning.types.bootstrap import register_all_v1_handlers
from learning.types.registry import is_supported

# Bootstrap the type handler registry so is_supported / get_handler work.
if not is_supported("MCQ_SINGLE"):
    register_all_v1_handlers()


class FakeGateway:
    """Returns a deterministic 'translated' string per field call."""
    async def call(self, *, touchpoint, prompt_template_id, prompt_inputs, schema, **kw):
        src = prompt_inputs.get("source_text", "x")
        return schema(translated=f"[hi]{src}", flagged_cultural=False,
                      flag_reason="", confidence=0.9)


async def _seed_question(session, qid):
    await session.execute(text("""
        INSERT INTO content_schema.questions
          (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type)
        VALUES (:id, :id, 'What is 2+2?', '["3","4"]'::jsonb, 1, 'en', 'PUBLISHED', :id, 'MCQ_SINGLE')
        ON CONFLICT (id) DO NOTHING
    """), {"id": qid})


@pytest.mark.asyncio
async def test_worker_translates_and_finalizes(content_session):
    q = "00000000-0000-0000-0000-0000000b0001"
    await _seed_question(content_session, q)
    out = await batch_repo.create_batch(
        content_session, created_by=None, question_ids=[q], target_langs=["hi"])
    await content_session.commit()

    await batch_worker.run_batch(content_sessionmaker(), FakeGateway(), out["batchId"])

    got = await batch_repo.get_batch(content_session, out["batchId"])
    assert got["batch"]["status"] == "DONE"
    assert got["tasks"][0]["status"] == "SUCCEEDED"
    # A DRAFT translation row now exists.
    n = (await content_session.execute(text("""
        SELECT count(*) FROM content_schema.content_artifact_translations
         WHERE artifact_id = :q AND language = 'hi' AND status = 'DRAFT'
    """), {"q": q})).scalar()
    assert n == 1
