from app.core.config import ASRProviderName, settings
from app.core.logging import get_logger
from app.services.asr.base import ASRProvider
from app.services.asr.mock_provider import MockASRProvider

logger = get_logger(__name__)


def build_asr_provider(script=None) -> ASRProvider:
    """Instantiate the configured ASR provider, degrading to the mock provider."""
    if settings.asr_provider is ASRProviderName.FASTER_WHISPER:
        from app.services.asr.faster_whisper_provider import (
            FasterWhisperProvider,
            FasterWhisperUnavailable,
        )

        try:
            provider = FasterWhisperProvider()
            provider._load()  # fail fast if the dependency is missing
            return provider
        except FasterWhisperUnavailable as exc:  # pragma: no cover - optional dependency
            logger.warning("asr_provider_unavailable", extra={"error": str(exc)})
    return MockASRProvider(script=script)


__all__ = ["ASRProvider", "MockASRProvider", "build_asr_provider"]
