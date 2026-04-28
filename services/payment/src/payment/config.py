from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PAYMENT_", env_file=".env", extra="ignore")

    service_name: str = "payment"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38007)

    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:35432/payment")
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")

    # GAP-16 — Payment gates checkout via checkout_enabled (default false until Sprint 3 launch).
    institution_base_url: str = Field(default="http://localhost:38008")

    # Shared JWT secret with Auth (HS256 today; RS256 + JWKS at staging).
    jwt_secret: str = Field(default="dev-only-change-me-in-staging-at-least-32-bytes-long")

    # Stripe — empty key disables real Stripe calls; the FSM + repos still
    # work for tests + local dev. Mirrors the OPENAI_API_KEY heuristic-
    # fallback pattern used by Adaptive Engine since Sprint 5.
    stripe_api_key: str = Field(default="")
    stripe_webhook_secret: str = Field(default="")
    stripe_price_id_premium_monthly: str = Field(default="price_test_premium_monthly")
    stripe_price_id_premium_yearly: str = Field(default="price_test_premium_yearly")
    checkout_success_url: str = Field(
        default="http://localhost:35173/billing?status=success&session_id={CHECKOUT_SESSION_ID}"
    )
    checkout_cancel_url: str = Field(default="http://localhost:35173/billing?status=cancel")


settings = Settings()
