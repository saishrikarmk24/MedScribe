from app.core.config import DiarizationProviderName, settings
from app.core.logging import get_logger
from app.services.diarization.base import DiarizationService
from app.services.diarization.mock_provider import MockDiarizationProvider

logger = get_logger(__name__)


def build_diarization_provider() -> DiarizationService:
    """Instantiate the configured diarizer, degrading to the mock provider."""
    if settings.diarization_provider is DiarizationProviderName.PYANNOTE:
        from app.services.diarization.pyannote_provider import (
            PyannoteDiarizationProvider,
            PyannoteUnavailable,
        )

        try:
            provider = PyannoteDiarizationProvider()
            provider._load()
            return provider
        except PyannoteUnavailable as exc:  # pragma: no cover - optional dependency
            logger.warning("diarization_provider_unavailable", extra={"error": str(exc)})
    return MockDiarizationProvider()


__all__ = ["DiarizationService", "MockDiarizationProvider", "build_diarization_provider"]
