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
import os
import random
import time
import inspect
import re
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger, metrics
from app.services.asr.medical_normalizer import normalize_segments
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
from app.services.llm.grounding import (
    cite_entities,
    expand_clinical_text,
    filter_ungrounded_entities,
    purge_note_hallucinations,
)
from app.services.llm.local_provider import (
    LOCAL_SYSTEM_INSTRUCTION,
    build_single_pass_prompt,
)
from app.services.llm.prompts import (
    CONNECTION_TEST_PROMPT,
    SYSTEM_INSTRUCTION,
    build_extraction_prompt,
    build_note_prompt,
)
from app.services.llm.json_parse import extract_json_object
from app.services.llm.schemas import ExtractionResult, NoteUpdate, coerce_llm_payload

logger = get_logger(__name__)

_AUTH_MARKERS = ("api key not valid", "api_key_invalid", "unauthenticated", "permission_denied", "401", "403")
_RATE_MARKERS = ("resource_exhausted", "rate limit", "quota", "429")
_UNAVAILABLE_MARKERS = ("unavailable", "internal error", "500", "502", "503", "504", "deadline", "10054", "forcibly closed", "connection reset", "remotedisconnected")
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
        raw_model = model or settings.gemini_model
        if raw_model and any(legacy in raw_model.lower() for legacy in ("gemini-2.", "gemini-1.", "gemini-3.7", "gemini-3.8", "latest", "gemini-3-flash-preview")):
            raw_model = "gemini-3.5-flash-lite"
        self.model = raw_model
        self.timeout_seconds = timeout_seconds or settings.gemini_timeout_seconds
        self.max_retries = max_retries or settings.gemini_max_retries
        self.temperature = settings.gemini_temperature if temperature is None else temperature
        self._client: Any | None = None
        self._cached_note: tuple[str, NoteUpdate, LLMCallStats] | None = None

    # ------------------------------------------------------------------ client
    def _ensure_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self.api_key:
            raise LLMNotConfigured("GEMINI_API_KEY is not set.")
        try:
            from google import genai  # noqa: PLC0415  (lazy import keeps startup fast)
            from google.genai import types  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - dependency is in requirements.txt
            raise LLMUnavailable("google-genai is not installed. Run: pip install -U google-genai") from exc

        http_options = None
        client_args: dict[str, Any] = {}
        async_client_args: dict[str, Any] = {}
        if not settings.gemini_verify_ssl:
            client_args["verify"] = False
            async_client_args["verify"] = False
        proxy = settings.gemini_http_proxy or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
        if proxy:
            client_args["proxy"] = proxy
            async_client_args["proxy"] = proxy
        if client_args or async_client_args:
            http_options = types.HttpOptions(
                client_args=client_args or None,
                async_client_args=async_client_args or None,
            )

        self._client = genai.Client(api_key=self.api_key, http_options=http_options)
        logger.info("gemini_client_initialised", extra={"model": self.model, "verify_ssl": settings.gemini_verify_ssl})
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

        candidate_models = [self.model]
        for fallback in ("gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"):
            if fallback not in candidate_models:
                candidate_models.append(fallback)
        max_attempts = self.max_retries

        while attempts < max_attempts:
            current_model = candidate_models[attempts % len(candidate_models)]
            attempts += 1
            try:
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(model=current_model, contents=prompt, config=config),
                    timeout=self.timeout_seconds,
                )
            except asyncio.TimeoutError as exc:
                last_error = LLMTimeout(f"Gemini call timed out after {self.timeout_seconds:.0f}s")
                logger.warning("gemini_timeout", extra={"purpose": purpose, "attempt": attempts, "model": current_model})
                _ = exc
            except Exception as exc:  # SDK raises its own error hierarchy
                mapped = self._map_exception(exc)
                logger.warning(
                    "gemini_call_failed",
                    extra={"purpose": purpose, "attempt": attempts, "model": current_model, "code": mapped.code, "error": str(exc)[:400]},
                )
                if not mapped.retryable:
                    if getattr(mapped, "code", "") == "LLM_NOT_FOUND" and attempts < max_attempts:
                        last_error = mapped
                    else:
                        metrics.increment("gemini_errors_total", code=mapped.code)
                        raise mapped from exc
                else:
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
                        model=current_model,
                        duration_ms=round(duration_ms, 2),
                        attempts=attempts,
                        prompt_tokens=getattr(usage, "prompt_token_count", None),
                        output_tokens=getattr(usage, "candidates_token_count", None),
                    )
                    return parsed, stats

            if attempts < max_attempts:
                backoff = min(3.0, 0.4 * (2 ** (attempts - 1))) + random.uniform(0, 0.2)
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
        try:
            payload = coerce_llm_payload(extract_json_object(text), response_schema)
            return response_schema.model_validate(payload)
        except Exception as exc:
            raise LLMInvalidOutput("Gemini returned JSON that was missing required clinical fields.") from exc

    @staticmethod
    def _loads(text: str) -> Any:
        return extract_json_object(text)

    @staticmethod
    def _map_exception(exc: Exception) -> LLMError:
        message = str(exc).lower()
        status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if any(marker in message for marker in ("fortiguard", "web page blocked", "access blocked", "web filter", "intrusion prevention", "internet usage policy")):
            error = LLMUnavailable("Gemini was blocked by your local network firewall (FortiGuard Web Filter: Artificial Intelligence Category). Connect to a mobile hotspot or VPN to reach Gemini.")
            error.retryable = False
            return error
        if "certificate verify failed" in message or "unable to get local issuer certificate" in message:
            return LLMUnavailable("Gemini SSL certificate verification failed. Set GEMINI_VERIFY_SSL=false in .env to allow connections through TLS-inspecting networks.")
        if status in (401, 403) or any(marker in message for marker in _AUTH_MARKERS):
            return LLMAuthError(f"Gemini authentication failed: {exc}")
        if status == 429 or any(marker in message for marker in _RATE_MARKERS):
            return LLMRateLimited(f"Gemini rate limit reached: {exc}")
        if status == 404 or any(marker in message for marker in _NOT_FOUND_MARKERS):
            error = LLMUnavailable(f"Gemini model unavailable: {exc}")
            error.retryable = False
            error.code = "LLM_NOT_FOUND"
            return error
        if any(marker in message for marker in _UNAVAILABLE_MARKERS):
            return LLMUnavailable(f"Gemini service error: {exc}")
        if "timeout" in message or "timed out" in message:
            return LLMTimeout(f"Gemini timeout: {exc}")
        return LLMUnavailable(f"Gemini call failed: {exc}")

    @staticmethod
    def _link_provenance(result: NoteUpdate, clean_segments: list[dict[str, Any]]) -> None:
        """Cite transcript segments for sections returned without ids."""
        seg_dict = {
            str(s.get("ref", "")): expand_clinical_text(str(s.get("text", "")))
            for s in clean_segments
            if s.get("ref") and s.get("text")
        }
        roles = {str(s.get("ref", "")): str(s.get("role", "")).upper() for s in clean_segments}
        stop = {
            "the", "and", "for", "with", "was", "has", "have", "had", "not", "patient", "reports",
            "doctor", "history", "clinical", "mentioned", "denies", "since", "days", "from",
        }
        for key in result.note.model_dump():
            section = getattr(result.note, key, None)
            if not section or not section.text or section.source_segment_ids:
                continue
            words = set(re.findall(r"\w{4,}", section.text.lower())) - stop
            refs = [ref for ref, text in seg_dict.items() if any(word in text for word in words)]
            if key in ("assessment", "plan", "follow_up"):
                doctor_refs = [ref for ref in refs if roles.get(ref) == "DOCTOR"]
                refs = doctor_refs or refs
            section.source_segment_ids = refs[:8]

    async def _generate_single_pass(self, prompt: str, *, purpose: str = "single_pass") -> tuple[str, LLMCallStats]:
        client = self._ensure_client()
        from google.genai import types  # noqa: PLC0415

        config = types.GenerateContentConfig(
            system_instruction=LOCAL_SYSTEM_INSTRUCTION,
            temperature=self.temperature,
            response_mime_type="application/json",
            candidate_count=1,
        )
        started = time.perf_counter()
        candidate_models = [self.model]
        for fallback in ("gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"):
            if fallback not in candidate_models:
                candidate_models.append(fallback)

        attempts = 0
        last_error: LLMError | None = None
        while attempts < self.max_retries:
            current_model = candidate_models[attempts % len(candidate_models)]
            attempts += 1
            try:
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(model=current_model, contents=prompt, config=config),
                    timeout=self.timeout_seconds,
                )
                text = (getattr(response, "text", None) or "").strip()
                if not text:
                    raise LLMInvalidOutput("Gemini returned empty text.")
                duration_ms = (time.perf_counter() - started) * 1000
                metrics.observe("gemini_request_duration_seconds", duration_ms / 1000, purpose=purpose)
                metrics.increment("gemini_requests_total", purpose=purpose)
                usage = getattr(response, "usage_metadata", None)
                stats = LLMCallStats(
                    provider=self.name,
                    model=current_model,
                    duration_ms=round(duration_ms, 2),
                    attempts=attempts,
                    prompt_tokens=getattr(usage, "prompt_token_count", None),
                    output_tokens=getattr(usage, "candidates_token_count", None),
                )
                return text, stats
            except Exception as exc:  # noqa: BLE001
                mapped = self._map_exception(exc)
                logger.warning(
                    "gemini_single_pass_attempt_failed",
                    extra={"attempt": attempts, "model": current_model, "error": str(exc)[:200]},
                )
                last_error = mapped
                if not mapped.retryable:
                    break
                await asyncio.sleep(0.3)

        raise last_error or LLMUnavailable("Gemini single-pass failed")

    # ------------------------------------------------------------------ public
    async def extract_entities(
        self,
        *,
        session_context: dict[str, Any],
        segments: list[dict[str, Any]],
        rule_based_candidates: list[dict[str, Any]] | None = None,
        existing_entities: list[dict[str, Any]] | None = None,
        on_partial_note: Any = None,
    ) -> ExtractionResponse:
        clean_segments = normalize_segments(segments)
        # Attempt ultra-fast single pass structuring (entities + SOAP note in 1 call)
        try:
            single_pass_prompt = build_single_pass_prompt(clean_segments, rule_based_candidates)
            raw_text, stats = await self._generate_single_pass(single_pass_prompt, purpose="single_pass")
            parsed_json = extract_json_object(raw_text)

            coerced_entities = coerce_llm_payload(parsed_json, ExtractionResult)
            extraction_result = ExtractionResult.model_validate(coerced_entities)
            segment_texts = {str(s.get("ref", "")): str(s.get("text", "")) for s in clean_segments}
            cite_entities(extraction_result.entities, segment_texts)
            kept, dropped = filter_ungrounded_entities(
                extraction_result.entities,
                segment_texts=segment_texts,
                full_transcript=" ".join(segment_texts.values()),
            )
            if dropped:
                logger.info("gemini_dropped_ungrounded_entities", extra={"dropped": dropped})
            extraction_result.entities = kept

            note_payload = parsed_json.get("note") if isinstance(parsed_json, dict) else None
            if isinstance(note_payload, dict):
                note_coerced = coerce_llm_payload({"note": note_payload}, NoteUpdate)
                note_result = NoteUpdate.model_validate(note_coerced)
                purge_note_hallucinations(note_result, clean_segments, [e.model_dump() for e in extraction_result.entities])
                self._link_provenance(note_result, clean_segments)
                if not note_result.changed_sections:
                    note_result.changed_sections = [
                        key for key, section in note_result.note.model_dump().items() if (section.get("text") or "").strip()
                    ]
                transcript_key = " ".join(str(s.get("text", "")) for s in clean_segments)
                self._cached_note = (transcript_key, note_result, stats)

                if on_partial_note:
                    sections = {k: sec.text for k, sec in note_result.note.model_dump().items() if getattr(sec, "text", None)}
                    if inspect.iscoroutinefunction(on_partial_note):
                        await on_partial_note(sections)
                    elif callable(on_partial_note):
                        on_partial_note(sections)

            return ExtractionResponse(result=extraction_result, stats=stats)
        except Exception as exc:  # noqa: BLE001
            logger.warning("gemini_single_pass_failed_falling_back_to_two_pass", extra={"error": str(exc)})

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
        clean_segments = normalize_segments(segments)
        transcript_key = " ".join(str(s.get("text", "")) for s in clean_segments)

        # Zero-latency cache hit from the single-pass extraction step
        cached, self._cached_note = self._cached_note, None
        if cached is not None and cached[0] == transcript_key:
            logger.info("gemini_reusing_single_pass_note", extra={"model": cached[2].model, "duration_ms": cached[2].duration_ms})
            return NoteResponse(result=cached[1], stats=cached[2])

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
