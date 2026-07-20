from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ADAPTIVE_ENGINE_", env_file=".env", extra="ignore", populate_by_name=True)

    service_name: str = "adaptive_engine"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38010)
    grpc_port: int = Field(default=50051)

    # Post-ADR-0005 consolidation: adaptive is a schema in the `learning`
    # database. Containers override via ADAPTIVE_ENGINE_DATABASE_URL.
    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:35432/learning")
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")

    # GAP-16 — Adaptive Engine consumes irt_model_enabled (default false → binary-search cold-start).
    institution_base_url: str = Field(default="http://localhost:38008")
    catalog_base_url: str = Field(default="http://localhost:38003")
    analytics_base_url: str = Field(default="http://localhost:38007")
    quiz_base_url: str = Field(default="http://localhost:38011")
    # Shared secret for service-to-service calls into engagement's personal
    # analytics endpoints (mastery/readiness/topic-decay) that carry no user
    # bearer. Must match engagement's ANALYTICS_INTERNAL_SERVICE_TOKEN.
    internal_service_token: str = Field(
        default="dev-internal-svc-token-change-me-32-bytes-minimum"
    )
    # User-profile is the durable scoreboard for mock attempts — adaptive-engine
    # POSTs to /internal/profile/mock-attempts after /adaptive/mock/score completes.
    user_profile_base_url: str = Field(default="http://user-profile:8000")
    # Notification service for mock.completed inbox pings.
    notification_base_url: str = Field(default="http://notification:8000")

    # AI layer (Phase 1 deepening — Guided Next Steps + Personalised Study Plan + Question Explanations).
    # When OPENAI_API_KEY is unset, the LLM client returns None and callers fall back to a
    # deterministic heuristic derived from the EWA mastery vector — keeps local dev unblocked.
    # Accept either the namespaced ADAPTIVE_ENGINE_OPENAI_API_KEY (compose env) or the
    # plain OPENAI_API_KEY (developer shells) — the latter is the standard the SDK uses.
    openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("ADAPTIVE_ENGINE_OPENAI_API_KEY", "OPENAI_API_KEY"),
    )
    openai_model: str = Field(default="gpt-4o-mini")
    openai_max_tokens: int = Field(default=4096)

    # Sprint 8 R-4 — shared HS256 secret for the photo-doubt tier-gate JWT decode.
    jwt_secret: str = Field(default="dev-only-change-me-in-staging-at-least-32-bytes-long")


settings = Settings()
