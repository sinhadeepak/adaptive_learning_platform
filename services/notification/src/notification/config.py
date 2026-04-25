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

    # SMTP outbound — Mailpit in local dev (no auth, port 1025), SendGrid in
    # staging+prod (auth_token via secret + port 587 TLS).
    smtp_host: str = Field(default="localhost")
    smtp_port: int = Field(default=31025)
    smtp_username: str | None = Field(default=None)
    smtp_password: str | None = Field(default=None)
    smtp_use_tls: bool = Field(default=False)
    smtp_from: str = Field(default="ALP <noreply@adaptivelearn.in>")

    # Dispatcher worker — how often to poll for queued notifications.
    dispatch_interval_seconds: float = Field(default=2.0)
    # Stop retrying after this many failed sends; row stays unsent + visible
    # in the inbox for ops to investigate.
    dispatch_max_attempts: int = Field(default=5)
    # Disable the worker (e.g. in tests) by setting to false.
    dispatch_enabled: bool = Field(default=True)


settings = Settings()
