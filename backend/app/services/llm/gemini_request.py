"""Request settings that current Gemini models actually accept.

``gemini-3.8-flash`` is the stable model. ``gemini-3.7-flash`` and
``gemini-3.5-flash`` still answer, but Google routes those names onward and
they are the wrong pin for a live demonstration.

``candidate_count`` and ``thinking_budget=0`` are rejected by several Gemini 3
models with ``400 INVALID_ARGUMENT``. The default thinking level is ``medium``,
which holds a consultation on the reasoning pass. ``thinking_level="low"`` is
accepted by 3.5 Flash-Lite, 3.6 Flash and 3.8 Flash, and it is fast enough for
transcription and note writing in the room.
"""

from __future__ import annotations

from typing import Any

CURRENT_MODEL = "gemini-3.8-flash"
FALLBACK_MODELS = ("gemini-3.6-flash", "gemini-3.5-flash-lite")

_RETIRED = {
    "gemini-3.7-flash": CURRENT_MODEL,
    "gemini-3.5-flash": CURRENT_MODEL,
    "gemini-3-flash-preview": CURRENT_MODEL,
    "gemini-2.0-flash": CURRENT_MODEL,
    "gemini-2.0-flash-lite": CURRENT_MODEL,
    "gemini-1.5-flash": CURRENT_MODEL,
    "gemini-1.5-pro": CURRENT_MODEL,
}


def canonical_gemini_model(name: str | None, *, default: str = CURRENT_MODEL) -> str:
    if not name or not str(name).strip():
        return default
    cleaned = str(name).strip()
    lowered = cleaned.lower()
    if lowered in _RETIRED or lowered.startswith("gemini-1.") or lowered.startswith("gemini-2.0"):
        return CURRENT_MODEL
    return cleaned


def gemini_model_chain(primary: str | None) -> list[str]:
    chain = [canonical_gemini_model(primary)]
    for fallback in FALLBACK_MODELS:
        if fallback not in chain:
            chain.append(fallback)
    return chain


def gemini_generation_kwargs(
    model: str,
    *,
    system_instruction: str | None = None,
    response_schema: Any = None,
    max_output_tokens: int = 8192,
    json_mode: bool = False,
) -> dict[str, Any]:
    """Keyword arguments for ``GenerateContentConfig``.

    Sampling parameters and ``candidate_count`` are left unset. Gemini 3
    rejects them.
    """
    kwargs: dict[str, Any] = {"max_output_tokens": max_output_tokens}
    if system_instruction:
        kwargs["system_instruction"] = system_instruction
    if json_mode or response_schema is not None:
        kwargs["response_mime_type"] = "application/json"
    if response_schema is not None:
        kwargs["response_schema"] = response_schema
    try:
        from google.genai import types

        # ``model`` is part of the call so a future model can branch here.
        _ = model
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_level="low")
    except Exception:
        pass
    return kwargs
