from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ANALYTICS_", env_file=".env", extra="ignore")

    service_name: str = "analytics"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38006)

    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:35432/analytics"
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


settings = Settings()
