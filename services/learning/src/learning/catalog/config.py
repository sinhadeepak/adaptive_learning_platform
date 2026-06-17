from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CATALOG_", env_file=".env", extra="ignore")

    service_name: str = "catalog"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38004)

    # Post-ADR-0005 consolidation: catalog is a schema in the `learning`
    # database. Containers override via CATALOG_DATABASE_URL.
    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:35432/learning")
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")

    # Catalog is mostly public-read in Sprint 1; JWT verifier used for the admin CRUD endpoints in Sprint 2+.
    jwt_secret: str = Field(default="dev-only-change-me-in-staging-at-least-32-bytes-long")

    # Feature-flag SDK (alp-flags). Catalog consumes:
    #   - premium_tier_enforcement (default false) — Sprint 1 closed beta: paywall OFF.
    institution_base_url: str = Field(default="http://localhost:38008")


settings = Settings()
