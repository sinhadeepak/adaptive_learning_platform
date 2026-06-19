import pytest
from sqlalchemy import text

from learning.content import events
from learning.localisation import translation_events


class _FakeJS:
    def __init__(self): self.calls = []
    async def publish(self, subject, data):
        import json
        self.calls.append((subject, json.loads(data.decode())))


async def _seed_published_translation(session, qid):
    await session.execute(text("""
        INSERT INTO content_schema.questions
          (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type,
           payload)
        VALUES (:id,:id,'EN stem','["a","b"]'::jsonb,0,'en','PUBLISHED',:id,'MCQ_SINGLE',
           '{"stem":"EN stem","options":[{"id":"A","text":"a"},{"id":"B","text":"b"}],"correct_id":"A"}'::jsonb)
        ON CONFLICT (id) DO NOTHING
    """), {"id": qid})
    await session.execute(text("""
        INSERT INTO content_schema.content_artifact_translations
          (artifact_id, language, payload_translation, status, ai_confidence, version)
        VALUES (:id,'hi',
          '{"stem":"HI stem","options":[{"id":"A","text":"क"},{"id":"B","text":"ख"}],"explanation":"व्याख्या"}'::jsonb,
          'PUBLISHED', 0.9, 3)
        ON CONFLICT (artifact_id, language) DO UPDATE
          SET status='PUBLISHED', payload_translation=EXCLUDED.payload_translation, version=3
    """), {"id": qid})


@pytest.mark.asyncio
async def test_build_event_extracts_translated_fields(content_session):
    qid = "00000000-0000-0000-0000-0000000e0001"
    await _seed_published_translation(content_session, qid)
    await content_session.commit()
    ev = await translation_events.build_translation_event(content_session, question_id=qid, language="hi")
    assert ev["question_id"] == qid
    assert ev["language"] == "hi"
    assert ev["stem"] == "HI stem"
    assert ev["choices"] == ["क", "ख"]          # derived from options[*].text
    assert ev["explanation"] == "व्याख्या"
    assert ev["version"] == 3
    assert ev["payload"]["stem"] == "HI stem"     # full translated payload passed through


@pytest.mark.asyncio
async def test_emit_publishes_best_effort(content_session, monkeypatch):
    qid = "00000000-0000-0000-0000-0000000e0002"
    await _seed_published_translation(content_session, qid)
    await content_session.commit()
    fake = _FakeJS()
    monkeypatch.setattr(events, "_js", fake)
    await translation_events.emit_translation_published(content_session, question_id=qid, language="hi")
    assert len(fake.calls) == 1
    subject, payload = fake.calls[0]
    assert subject == events.SUBJECT_TRANSLATION_PUBLISHED
    assert payload["stem"] == "HI stem"


@pytest.mark.asyncio
async def test_emit_swallows_publish_errors(content_session, monkeypatch):
    qid = "00000000-0000-0000-0000-0000000e0003"
    await _seed_published_translation(content_session, qid)
    await content_session.commit()
    class _Flaky:
        async def publish(self, *a, **k): raise RuntimeError("nats down")
    monkeypatch.setattr(events, "_js", _Flaky())
    # must not raise
    await translation_events.emit_translation_published(content_session, question_id=qid, language="hi")
