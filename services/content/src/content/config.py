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


settings = Settings()
