from app.core.config import AIMode, settings
from app.core.logging import get_logger
from app.services.llm.base import (
    ExtractionResponse,
    LLMAuthError,
    LLMCallStats,
    LLMError,
    LLMInvalidOutput,
    LLMModelNotFound,
    LLMNotConfigured,
    LLMProvider,
    LLMRateLimited,
    LLMSafetyBlocked,
    LLMServiceUnavailable,
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


def build_llm_provider(model_name: str | None = None) -> LLMProvider:
    """Gemini when configured or in gemini mode; Local LLM when local/ollama requested; otherwise mock."""
    default_model = (
        settings.gemini_model
        if (settings.effective_ai_mode is AIMode.GEMINI or settings.gemini_configured)
        else settings.local_llm_model
    )
    target_model = model_name or default_model
    target_lower = target_model.lower()
    if "gemini" in target_lower and any(legacy in target_lower for legacy in ("gemini-2.", "gemini-1.", "gemini-3.7", "gemini-3.8", "latest")):
        target_model = "gemini-3-flash-preview"
        target_lower = target_model.lower()

    # Mock mode and sessions pinned to the rule engine must never reach a real model:
    # the local provider's fallback chain would otherwise load one on this machine.
    if settings.effective_ai_mode is AIMode.MOCK or target_model == DeterministicLLMProvider.model:
        return DeterministicLLMProvider()

    if ("gemini" in target_lower or settings.effective_ai_mode is AIMode.GEMINI) and settings.gemini_configured:
        from app.services.llm.gemini_provider import GeminiProvider

        return GeminiProvider(model=target_model if "gemini" in target_lower else settings.gemini_model)

    if (
        any(k in target_lower for k in ("gemma", "qwen", "llama", "mistral", "phi", "deepseek"))
        or settings.effective_ai_mode in (AIMode.LOCAL, AIMode.OLLAMA)
        or not settings.gemini_configured
    ):
        from app.services.llm.local_provider import LocalLLMProvider

        if "gemini" in target_lower:
            target_model = settings.local_llm_model
        return LocalLLMProvider(model=target_model)

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
    "LLMModelNotFound",
    "LLMNotConfigured",
    "LLMServiceUnavailable",
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
