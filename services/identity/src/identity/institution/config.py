from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="INSTITUTION_", env_file=".env", extra="ignore")

    service_name: str = "institution"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38008)

    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:35432/institution")
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")

    # Shared JWT secret with Auth for flag-mgmt admin endpoints (HS256 Sprint 1 / JWKS Sprint 2).
    jwt_secret: str = Field(default="dev-only-change-me-in-staging-at-least-32-bytes-long")


settings = Settings()
