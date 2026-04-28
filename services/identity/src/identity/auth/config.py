from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AUTH_", env_file=".env", extra="ignore")

    service_name: str = "auth"
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    port: int = Field(default=38001)

    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:35432/auth")
    redis_url: str = Field(default="redis://localhost:36379/0")
    nats_url: str = Field(default="nats://localhost:34222")

    # JWT — HS256 for Sprint 1 shared-secret, RS256 swap-in planned Sprint 2.
    jwt_secret: str = Field(default="dev-only-change-me-in-staging-at-least-32-bytes-long")
    jwt_access_ttl_seconds: int = Field(default=15 * 60)
    jwt_refresh_ttl_seconds: int = Field(default=30 * 24 * 60 * 60)
    jwt_refresh_ttl_seconds_remember: int = Field(default=90 * 24 * 60 * 60)

    # OTP
    otp_ttl_seconds: int = Field(default=10 * 60)
    otp_length: int = Field(default=6)

    # SMTP (local Mailpit by default)
    smtp_host: str = Field(default="localhost")
    smtp_port: int = Field(default=31025)
    smtp_from: str = Field(default="no-reply@adaptivelearn.in")

    # Feature flag SDK (alp-flags) — see ADR-0001 / FS-04. Auth consumes:
    #   - email_channel_enabled (default TRUE) — gates outbound OTP + password-reset emails.
    institution_base_url: str = Field(default="http://localhost:38008")

    # Sprint 9 A-1 — Payment service base URL for the staleness fallback at JWT
    # issuance. Catches the dropped-NATS-payment-success edge: user paid but
    # `payment.subscription.changed` never landed, so users.premium_until still
    # NULL. The fallback is only invoked when premium_until IS NULL (premium
    # users stay on the fast path).
    payment_base_url: str = Field(default="http://localhost:38007")
    payment_fallback_timeout_seconds: float = Field(default=1.0)

    # Password reset
    password_reset_ttl_seconds: int = Field(default=60 * 60)  # 1 hour
    password_reset_url_template: str = Field(
        default="http://localhost:35173/reset-password?token={token}"
    )

    # Account lockout (STU-REQ-10) — N failures within window triggers a lockout duration.
    lockout_threshold: int = Field(default=5)
    lockout_window_seconds: int = Field(default=15 * 60)
    lockout_duration_seconds: int = Field(default=30 * 60)


settings = Settings()
