import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_supported_languages_seeded(content_session):
    rows = (await content_session.execute(
        text("SELECT code, enabled, is_source FROM content_schema.supported_languages ORDER BY code")
    )).mappings().all()
    by_code = {r["code"]: r for r in rows}
    assert by_code["en"]["is_source"] is True
    assert {"hi", "ta", "te", "bn", "mr"}.issubset(by_code.keys())
    assert by_code["hi"]["enabled"] is True


@pytest.mark.asyncio
async def test_batch_tables_exist(content_session):
    # Insert a batch + task to prove the tables + FK exist.
    await content_session.execute(text("""
        INSERT INTO content_schema.translation_batches
          (id, created_by, status, total_tasks, target_langs)
        VALUES ('00000000-0000-0000-0000-0000000000b1', NULL, 'QUEUED', 1, ARRAY['hi'])
    """))
    await content_session.execute(text("""
        INSERT INTO content_schema.translation_batch_tasks
          (id, batch_id, question_id, language, status)
        VALUES ('00000000-0000-0000-0000-0000000000c1',
                '00000000-0000-0000-0000-0000000000b1',
                '00000000-0000-0000-0000-0000000000d1', 'hi', 'PENDING')
    """))
    n = (await content_session.execute(
        text("SELECT count(*) FROM content_schema.translation_batch_tasks WHERE batch_id = :b"),
        {"b": "00000000-0000-0000-0000-0000000000b1"},
    )).scalar()
    assert n == 1
