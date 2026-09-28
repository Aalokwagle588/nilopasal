from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import os


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-secret"
    ALGORITHM: str = "HS256"
    SESSION_TTL_DAYS: int = 30
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    PORT: int = 4000
    NODE_ENV: str = "development"
    COOKIE_SECURE: bool = False
    SESSION_COOKIE_NAME: str = "nilopasal_session"

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.NODE_ENV == "production"


settings = Settings()
