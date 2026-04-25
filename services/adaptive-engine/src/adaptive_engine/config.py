from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ADAPTIVE_ENGINE_", env_file=".env", extra="ignore")

    service_name: str = "adaptive_engine"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38010)
    grpc_port: int = Field(default=50051)

    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:35432/adaptive_engine")
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")

    # GAP-16 — Adaptive Engine consumes irt_model_enabled (default false → binary-search cold-start).
    institution_base_url: str = Field(default="http://localhost:38008")


settings = Settings()
