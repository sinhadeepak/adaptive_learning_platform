"""marketplace config — pydantic-settings, MARKETPLACE_ env prefix."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MARKETPLACE_", env_file=".env", extra="ignore"
    )

    service_name: str = "marketplace"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38110)

    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:35432/marketplace"
    )
    nats_url: str = Field(default="nats://localhost:34222")

    # Upstream URLs (set in compose). P3-S1+ needs these for tutor
    # premium check, profile lookup, etc.
    identity_base_url: str = Field(default="http://localhost:38001")
    payment_base_url: str = Field(default="http://localhost:38007")


settings = Settings()
