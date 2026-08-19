"""Gemini provider built on the Google GenAI SDK (``google-genai``).

Design notes:

* one ``genai.Client`` per process (constructed lazily, reused across calls);
* schema-constrained JSON output via ``response_schema`` + Pydantic parsing;
* bounded retries with exponential backoff, and *no* retry on auth failures;
* every failure mode is mapped onto the ``LLMError`` taxonomy so a session can
  degrade instead of crashing.
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger, metrics
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
from app.services.llm.prompts import (
    CONNECTION_TEST_PROMPT,
    SYSTEM_INSTRUCTION,
    build_extraction_prompt,
    build_note_prompt,
)
from app.services.llm.schemas import ExtractionResult, NoteUpdate

logger = get_logger(__name__)

_AUTH_MARKERS = ("api key not valid", "api_key_invalid", "unauthenticated", "permission_denied", "401", "403")
_RATE_MARKERS = ("resource_exhausted", "rate limit", "quota", "429")
_UNAVAILABLE_MARKERS = ("unavailable", "internal error", "500", "503", "deadline")
_NOT_FOUND_MARKERS = ("not found", "404", "is not supported")


class GeminiProvider(LLMProvider):
    name = "gemini"
    is_mock = False

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
        max_retries: int | None = None,
        temperature: float | None = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else settings.gemini_api_key
        self.model = model or settings.gemini_model
        self.timeout_seconds = timeout_seconds or settings.gemini_timeout_seconds
        self.max_retries = max_retries or settings.gemini_max_retries
        self.temperature = settings.gemini_temperature if temperature is None else temperature
        self._client: Any | None = None

    # ------------------------------------------------------------------ client
    def _ensure_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self.api_key:
            raise LLMNotConfigured("GEMINI_API_KEY is not set.")
        try:
            from google import genai  # noqa: PLC0415  (lazy import keeps startup fast)
        except ImportError as exc:  # pragma: no cover - dependency is in requirements.txt
            raise LLMUnavailable("google-genai is not installed. Run: pip install -U google-genai") from exc
        self._client = genai.Client(api_key=self.api_key)
        logger.info("gemini_client_initialised", extra={"model": self.model})
        return self._client

    @staticmethod
    def _config(response_schema: Any) -> Any:
        from google.genai import types  # noqa: PLC0415

        return types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=settings.gemini_temperature,
            response_mime_type="application/json",
            response_schema=response_schema,
            candidate_count=1,
        )

    # ------------------------------------------------------------------- calls
    async def _generate(self, prompt: str, response_schema: Any, *, purpose: str) -> tuple[Any, LLMCallStats]:
        client = self._ensure_client()
        config = self._config(response_schema)
        attempts = 0
        started = time.perf_counter()
        last_error: LLMError | None = None

        while attempts < max(1, self.max_retries):
            attempts += 1
            try:
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(model=self.model, contents=prompt, config=config),
                    timeout=self.timeout_seconds,
                )
            except asyncio.TimeoutError as exc:
                last_error = LLMTimeout(f"Gemini call timed out after {self.timeout_seconds:.0f}s")
                logger.warning("gemini_timeout", extra={"purpose": purpose, "attempt": attempts})
                _ = exc
            except Exception as exc:  # SDK raises its own error hierarchy
                mapped = self._map_exception(exc)
                logger.warning(
                    "gemini_call_failed",
                    extra={"purpose": purpose, "attempt": attempts, "code": mapped.code, "error": str(exc)[:400]},
                )
                if not mapped.retryable:
                    metrics.increment("gemini_errors_total", code=mapped.code)
                    raise mapped from exc
                last_error = mapped
            else:
                try:
                    parsed = self._parse(response, response_schema)
                except LLMError as exc:
                    logger.warning(
                        "gemini_output_rejected",
                        extra={"purpose": purpose, "attempt": attempts, "code": exc.code, "error": str(exc)[:400]},
                    )
                    if not exc.retryable:
                        metrics.increment("gemini_errors_total", code=exc.code)
                        raise
                    last_error = exc
                else:
                    duration_ms = (time.perf_counter() - started) * 1000
                    metrics.observe("gemini_request_duration_seconds", duration_ms / 1000, purpose=purpose)
                    metrics.increment("gemini_requests_total", purpose=purpose)
                    usage = getattr(response, "usage_metadata", None)
                    stats = LLMCallStats(
                        provider=self.name,
                        model=self.model,
                        duration_ms=round(duration_ms, 2),
                        attempts=attempts,
                        prompt_tokens=getattr(usage, "prompt_token_count", None),
                        output_tokens=getattr(usage, "candidates_token_count", None),
                    )
                    return parsed, stats

            if attempts < self.max_retries:
                backoff = min(8.0, 0.75 * (2 ** (attempts - 1))) + random.uniform(0, 0.35)
                await asyncio.sleep(backoff)

        metrics.increment("gemini_errors_total", code=last_error.code if last_error else "LLM_ERROR")
        raise last_error or LLMUnavailable("Gemini call failed")

    def _parse(self, response: Any, response_schema: Any) -> Any:
        feedback = getattr(response, "prompt_feedback", None)
        if feedback is not None and getattr(feedback, "block_reason", None):
            raise LLMSafetyBlocked(f"Gemini blocked the request: {feedback.block_reason}")

        candidates = getattr(response, "candidates", None) or []
        if candidates:
            finish_reason = str(getattr(candidates[0], "finish_reason", "") or "")
            if "SAFETY" in finish_reason.upper():
                raise LLMSafetyBlocked("Gemini stopped generation for safety reasons.")

        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, response_schema):
            return parsed

        text = (getattr(response, "text", None) or "").strip()
        if not text:
            raise LLMInvalidOutput("Gemini returned an empty response.")
        payload = self._loads(text)
        try:
            return response_schema.model_validate(payload)
        except Exception as exc:
            raise LLMInvalidOutput(f"Gemini output failed schema validation: {exc}") from exc

    @staticmethod
    def _loads(text: str) -> Any:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.lstrip().lower().startswith("json"):
                cleaned = cleaned.lstrip()[4:]
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            start, end = cleaned.find("{"), cleaned.rfind("}")
            if 0 <= start < end:
                try:
                    return json.loads(cleaned[start : end + 1])
                except json.JSONDecodeError:
                    pass
            raise LLMInvalidOutput(f"Gemini returned malformed JSON: {exc}") from exc

    @staticmethod
    def _map_exception(exc: Exception) -> LLMError:
        message = str(exc).lower()
        status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if status in (401, 403) or any(marker in message for marker in _AUTH_MARKERS):
            return LLMAuthError(f"Gemini authentication failed: {exc}")
        if status == 429 or any(marker in message for marker in _RATE_MARKERS):
            return LLMRateLimited(f"Gemini rate limit reached: {exc}")
        if status == 404 or any(marker in message for marker in _NOT_FOUND_MARKERS):
            error = LLMUnavailable(f"Gemini model unavailable: {exc}")
            error.retryable = False
            return error
        if any(marker in message for marker in _UNAVAILABLE_MARKERS):
            return LLMUnavailable(f"Gemini service error: {exc}")
        if "timeout" in message or "timed out" in message:
            return LLMTimeout(f"Gemini timeout: {exc}")
        return LLMUnavailable(f"Gemini call failed: {exc}")

    # ------------------------------------------------------------------ public
    async def extract_entities(
        self,
        *,
        session_context: dict[str, Any],
        segments: list[dict[str, Any]],
        rule_based_candidates: list[dict[str, Any]] | None = None,
        existing_entities: list[dict[str, Any]] | None = None,
    ) -> ExtractionResponse:
        prompt = build_extraction_prompt(
            session_context=session_context,
            segments=segments,
            rule_based_candidates=rule_based_candidates,
            existing_entities=existing_entities,
        )
        result, stats = await self._generate(prompt, ExtractionResult, purpose="extraction")
        return ExtractionResponse(result=result, stats=stats)

    async def generate_note(
        self,
        *,
        session_context: dict[str, Any],
        segments: list[dict[str, Any]],
        entities: list[dict[str, Any]],
        current_note: dict[str, Any] | None = None,
    ) -> NoteResponse:
        prompt = build_note_prompt(
            session_context=session_context,
            segments=segments,
            entities=entities,
            current_note=current_note,
        )
        result, stats = await self._generate(prompt, NoteUpdate, purpose="note")
        return NoteResponse(result=result, stats=stats)

    async def check_connection(self) -> dict[str, Any]:
        started = time.perf_counter()
        if not self.api_key:
            return {"connected": False, "model": self.model, "error": "GEMINI_API_KEY is not set"}
        try:
            client = self._ensure_client()
            response = await asyncio.wait_for(
                client.aio.models.generate_content(model=self.model, contents=CONNECTION_TEST_PROMPT),
                timeout=min(self.timeout_seconds, 20.0),
            )
            text = (getattr(response, "text", None) or "").strip()
            return {
                "connected": bool(text),
                "model": self.model,
                "latency_ms": round((time.perf_counter() - started) * 1000, 2),
                "sample": text[:120],
            }
        except Exception as exc:
            mapped = self._map_exception(exc) if not isinstance(exc, LLMError) else exc
            return {
                "connected": False,
                "model": self.model,
                "error": str(mapped),
                "code": getattr(mapped, "code", "LLM_ERROR"),
                "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            }
