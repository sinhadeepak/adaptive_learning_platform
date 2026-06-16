from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CONTENT_", env_file=".env", extra="ignore")

    service_name: str = "content"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38003)

    database_url: str = Field(
        # Post-ADR-0005 consolidation: content is a schema in the `learning`
        # database, not a separate `content` DB. Containers override via
        # CONTENT_DATABASE_URL; this default is for host/dev runs.
        default="postgresql+asyncpg://postgres:postgres@localhost:35432/learning"
    )
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")
    jwt_secret: str = Field(default="dev-only-change-me-in-staging-at-least-32-bytes-long")

    # Catalog service — POST /content/questions calls catalog's
    # /catalog/educators/me/topics/{id}/authorize before persisting,
    # closing the gap where a hand-crafted request could write into
    # any topic regardless of educator scope. Forward the inbound
    # bearer token; catalog enforces PLATFORM_ADMIN bypass + 404 on
    # missing topic.
    catalog_base_url: str = Field(default="http://localhost:38004")
    catalog_authorize_timeout_seconds: float = Field(default=2.0)

    # ── AI Content Guardrail (feature-flagged; adjustable without redeploy) ──
    # Kill-switch: when off, AI authoring behaves exactly as before the
    # guardrail (no L1 preamble / L2 audit / L3 scan).
    guardrail_enabled: bool = Field(default=True)
    guardrail_similarity_threshold: float = Field(default=0.92)
    guardrail_confidence_fail_floor: int = Field(default=60)
    guardrail_confidence_review_floor: int = Field(default=80)
    guardrail_max_attempts: int = Field(default=3)
    guardrail_prompt_version: str = Field(default="1.0.0")


settings = Settings()


def guardrail_config():
    """Build a `GuardrailConfig` from env-overridable settings. Imported
    lazily by callers so `content.config` stays dependency-light."""
    from learning.ai_authoring.guardrail.schemas import GuardrailConfig

    return GuardrailConfig(
        enabled=settings.guardrail_enabled,
        similarity_threshold=settings.guardrail_similarity_threshold,
        confidence_fail_floor=settings.guardrail_confidence_fail_floor,
        confidence_review_floor=settings.guardrail_confidence_review_floor,
        max_attempts=settings.guardrail_max_attempts,
        prompt_version=settings.guardrail_prompt_version,
    )
