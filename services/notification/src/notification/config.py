from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NOTIFICATION_", env_file=".env", extra="ignore")

    service_name: str = "notification"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=8009)

    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:5432/notification")
    redis_url: str = Field(default="redis://localhost:6379/0")
    nats_url: str = Field(default="nats://localhost:4222")


settings = Settings()
