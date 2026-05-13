from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ANALYTICS_", env_file=".env", extra="ignore")

    service_name: str = "analytics"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38006)

    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:35432/engagement"
    )
    # Read-only handle into Quiz's DB for the nightly backfill (Sprint 4).
    # Analytics already trusts quiz_schema.quiz_sessions as the source of
    # truth for "what happened" — backfill just re-applies any session the
    # JetStream consumer never landed in processed_sessions.
    quiz_database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:35432/quiz"
    )
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")
    # Notification service base URL — used to POST inbox notifications when a
    # milestone is crossed (streak threshold, daily goal reached). Empty
    # string disables the integration so unit tests don't need a stub.
    notification_base_url: str = Field(default="http://notification:8000")
    # Profile service base URL — used to look up the daily goal so we can
    # detect goal-reached crossings on a session-by-session basis.
    user_profile_base_url: str = Field(default="http://user-profile:8000")
    # Sprint 9 L-1 — Institution service for cohort membership lookups
    # (cohort leaderboard endpoint joins membership → readiness via HTTP
    # rather than a cross-schema SQL JOIN, per AP-01).
    institution_base_url: str = Field(default="http://institution:8000")
    # Sprint 28 (P4-S28) — alp-learning base URL for the syllabus-tree
    # fetch in the coverage aggregator.
    learning_base_url: str = Field(default="http://learning:8000")
    # Phase 1D-5 — Quiz service HTTP base for the mock-history fetch in
    # rank_trajectory.
    quiz_base_url: str = Field(default="http://quiz:8000")


settings = Settings()
