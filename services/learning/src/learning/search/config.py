from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SEARCH_", env_file=".env", extra="ignore")

    service_name: str = "search"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38005)

    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:35432/search"
    )
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")

    # OpenSearch — search owns no relational state; the `topics_v1` index is the source of truth.
    opensearch_url: str = Field(default="http://localhost:39200")
    topics_index: str = Field(default="topics_v2")

    # Catalog endpoint for reindex (Sprint 1: HTTP pull. Sprint 2: NATS event-driven.)
    catalog_base_url: str = Field(default="http://localhost:38004/catalog")

    jwt_secret: str = Field(default="dev-only-change-me-in-staging-at-least-32-bytes-long")


settings = Settings()
