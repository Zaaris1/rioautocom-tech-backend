from __future__ import annotations

import os
from functools import lru_cache


def env_bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "sim", "s"}


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default).strip()
    if not raw:
        return []
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


def normalize_database_url(value: str | None) -> str:
    if not value or not value.strip():
        raise RuntimeError("DATABASE_URL nao configurada. Defina a conexao PostgreSQL no Render/ambiente.")

    database_url = value.strip()
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


def require_secret_key(value: str | None) -> str:
    secret = (value or "").strip()
    if not secret or secret == "CHANGE_ME":
        raise RuntimeError("SECRET_KEY nao configurada. Defina uma chave forte antes de iniciar a API.")
    if len(secret) < 24:
        raise RuntimeError("SECRET_KEY deve ter pelo menos 24 caracteres.")
    return secret


class Settings:
    app_name = "RioAutocom Tech API"
    app_version = os.getenv("APP_VERSION", "1.0.4-structural-ui")
    database_url = normalize_database_url(os.getenv("DATABASE_URL"))
    secret_key = require_secret_key(os.getenv("SECRET_KEY"))
    algorithm = os.getenv("ALGORITHM", "HS256")
    access_token_expire_days = os.getenv("ACCESS_TOKEN_EXPIRE_DAYS")
    access_token_expire_minutes_raw = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "259200")
    cors_origins = env_list("CORS_ORIGINS", "*")
    cors_allow_vercel_previews = env_bool("CORS_ALLOW_VERCEL_PREVIEWS", "true")
    default_admin_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "040126")
    default_client_password = os.getenv("DEFAULT_CLIENT_PASSWORD", "402365")

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def allow_all_origins(self) -> bool:
        return self.cors_origins == ["*"]

    @property
    def cors_origin_regex(self) -> str | None:
        if self.cors_allow_vercel_previews:
            return r"https://.*\.vercel\.app"
        return None

    @property
    def access_token_expire_minutes(self) -> int:
        if self.access_token_expire_days:
            try:
                return max(1, int(float(self.access_token_expire_days) * 24 * 60))
            except Exception:
                pass

        try:
            return max(1, int(float(self.access_token_expire_minutes_raw)))
        except Exception:
            return 259200


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
