"""Central configuration for MedScribe Live.

Every tunable value lives here so that business logic never hard-codes a model
name, provider or connection string.
"""

from __future__ import annotations

from enum import Enum
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent


class AIMode(str, Enum):
    GEMINI = "gemini"
    MOCK = "mock"


class ASRProviderName(str, Enum):
    MOCK = "mock"
    FASTER_WHISPER = "faster_whisper"


class DiarizationProviderName(str, Enum):
    MOCK = "mock"
    PYANNOTE = "pyannote"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- application -------------------------------------------------------
    app_name: str = "MedScribe Live"
    app_version: str = "0.1.0"
    environment: str = "development"
    log_level: str = "INFO"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"

    # --- AI ----------------------------------------------------------------
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    ai_mode: AIMode = AIMode.GEMINI
    gemini_update_interval_seconds: float = 10.0
    gemini_min_segments_per_update: int = 3
    gemini_timeout_seconds: float = 45.0
    gemini_max_retries: int = 3
    gemini_temperature: float = 0.1

    # --- database ----------------------------------------------------------
    database_url: str = "postgresql+asyncpg://medscribe:medscribe@localhost:5432/medscribe"
    allow_sqlite_fallback: bool = True
    sqlite_fallback_url: str = "sqlite+aiosqlite:///./medscribe_dev.db"
    db_echo: bool = False
    auto_create_schema: bool = True

    # --- simulation --------------------------------------------------------
    enable_demo_mode: bool = True
    demo_segment_interval_seconds: float = 2.5

    # --- pipeline providers ------------------------------------------------
    asr_provider: ASRProviderName = ASRProviderName.MOCK
    diarization_provider: DiarizationProviderName = DiarizationProviderName.MOCK
    faster_whisper_model: str = "small.en"
    pyannote_model: str = "pyannote/speaker-diarization-3.1"
    huggingface_token: str | None = None

    # --- audio -------------------------------------------------------------
    audio_sample_rate: int = 16000
    audio_channels: int = 1
    audio_storage_dir: str = "./storage/audio"

    # --- security ----------------------------------------------------------
    dev_auth_enabled: bool = True
    dev_user_email: str = "dev.clinician@medscribe.local"
    dev_user_role: str = "DOCTOR"
    secret_key: str = "change-me-in-production"
    data_retention_days: int = 30

    # --- monitoring --------------------------------------------------------
    enable_metrics: bool = True

    @field_validator("gemini_api_key", "huggingface_token", mode="before")
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def effective_ai_mode(self) -> AIMode:
        """Gemini is only used when a key is actually present."""
        if self.ai_mode is AIMode.GEMINI and not self.gemini_configured:
            return AIMode.MOCK
        return self.ai_mode

    @property
    def audio_storage_path(self) -> Path:
        path = Path(self.audio_storage_dir)
        if not path.is_absolute():
            path = BACKEND_ROOT / path
        return path

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
