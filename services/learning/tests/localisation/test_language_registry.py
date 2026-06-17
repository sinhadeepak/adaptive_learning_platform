import pytest

from learning.localisation import language_registry as reg


@pytest.mark.asyncio
async def test_list_excludes_disabled_by_default(content_session):
    await reg.upsert_language(content_session, code="kn", name="Kannada",
                              native_name="ಕನ್ನಡ", script="Kannada",
                              enabled=False, sort_order=60)
    await content_session.commit()
    codes_default = {r["code"] for r in await reg.list_languages(content_session)}
    codes_all = {r["code"] for r in await reg.list_languages(content_session, include_disabled=True)}
    assert "kn" not in codes_default
    assert "kn" in codes_all


@pytest.mark.asyncio
async def test_enabled_target_codes_excludes_source(content_session):
    codes = await reg.enabled_target_codes(content_session)
    assert "hi" in codes
    assert "en" not in codes  # en is_source


@pytest.mark.asyncio
async def test_set_enabled_toggles(content_session):
    ok = await reg.set_enabled(content_session, code="ta", enabled=False)
    await content_session.commit()
    assert ok is True
    assert "ta" not in await reg.enabled_target_codes(content_session)
    # Restore shared-DB state so other tests still see `ta` enabled.
    await reg.set_enabled(content_session, code="ta", enabled=True)
    await content_session.commit()
