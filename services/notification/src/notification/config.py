from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NOTIFICATION_", env_file=".env", extra="ignore")

    service_name: str = "notification"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38009)

    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:35432/notification")
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")

    # GAP-16 — Notification gates 3 channels: push/sms/email.
    institution_base_url: str = Field(default="http://localhost:38008")


settings = Settings()
