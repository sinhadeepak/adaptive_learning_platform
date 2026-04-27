from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="USER_PROFILE_", env_file=".env", extra="ignore")

    service_name: str = "user_profile"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38002)

    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:35432/user_profile")
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")

    # Shared JWT secret with Auth service (Sprint 1 HS256). Sprint 2: JWKS from Auth.
    jwt_secret: str = Field(default="dev-only-change-me-in-staging-at-least-32-bytes-long")

    # Notification service — used to fire `achievement.unlocked` inbox
    # notifications when a brand-new badge is awarded (post-grant). Empty
    # string disables the integration.
    notification_base_url: str = Field(default="http://notification:8000")


settings = Settings()
