from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DOUBTS_", env_file=".env", extra="ignore"
    )

    service_name: str = "doubts"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38012)

    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:35432/doubts"
    )
    jwt_secret: str = Field(default="dev-only-change-me-in-staging-at-least-32-bytes-long")

    # Notification service base URL — POST /notifications/inbox fires when an
    # answer is appended to a doubt the caller doesn't own, so the original
    # asker gets a bell ping. Empty string disables the integration.
    notification_base_url: str = Field(default="http://notification:8000")


settings = Settings()
