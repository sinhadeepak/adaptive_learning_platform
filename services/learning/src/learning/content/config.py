from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CONTENT_", env_file=".env", extra="ignore")

    service_name: str = "content"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38003)

    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:35432/content"
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


settings = Settings()
