from app.core.config import AIMode, settings
from app.core.logging import get_logger
from app.services.llm.base import (
    ExtractionResponse,
    LLMAuthError,
    LLMCallStats,
    LLMError,
    LLMInvalidOutput,
    LLMNotConfigured,
    LLMProvider,
    LLMRateLimited,
    LLMSafetyBlocked,
    LLMTimeout,
    LLMUnavailable,
    NoteResponse,
)
from app.services.llm.mock_provider import DeterministicLLMProvider
from app.services.llm.validator import (
    EntityValidationResult,
    NoteValidationResult,
    OutputValidator,
    ValidationIssue,
)

logger = get_logger(__name__)

_primary: LLMProvider | None = None
_fallback: DeterministicLLMProvider | None = None


def build_llm_provider() -> LLMProvider:
    """Return the configured provider (Gemini unless it cannot be used)."""
    if settings.effective_ai_mode is AIMode.GEMINI:
        from app.services.llm.gemini_provider import GeminiProvider

        return GeminiProvider()
    if settings.ai_mode is AIMode.GEMINI and not settings.gemini_configured:
        logger.warning("gemini_not_configured_using_rule_based_provider")
    return DeterministicLLMProvider()


def get_llm_provider(refresh: bool = False) -> LLMProvider:
    global _primary
    if _primary is None or refresh:
        _primary = build_llm_provider()
    return _primary


def get_fallback_provider() -> DeterministicLLMProvider:
    """Deterministic provider used when the primary provider fails."""
    global _fallback
    if _fallback is None:
        _fallback = DeterministicLLMProvider()
    return _fallback


__all__ = [
    "DeterministicLLMProvider",
    "EntityValidationResult",
    "ExtractionResponse",
    "LLMAuthError",
    "LLMCallStats",
    "LLMError",
    "LLMInvalidOutput",
    "LLMNotConfigured",
    "LLMProvider",
    "LLMRateLimited",
    "LLMSafetyBlocked",
    "LLMTimeout",
    "LLMUnavailable",
    "NoteResponse",
    "NoteValidationResult",
    "OutputValidator",
    "ValidationIssue",
    "build_llm_provider",
    "get_fallback_provider",
    "get_llm_provider",
]
