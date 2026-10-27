"""Gemini audio transcription.

Real speech-to-text over the actual captured audio. Gemini's audio
understanding returns a verbatim transcript *and* speaker attribution in one
call, so this provider also publishes the speaker turns onto the frame's hints
where :class:`~app.services.diarization.gemini_provider.GeminiDiarizationProvider`
picks them up. That avoids sending the same audio to the API twice.

This provider never invents content: if the audio contains no intelligible
speech it returns an empty list, and if the API cannot be reached it raises so
the pipeline surfaces a real error instead of substituting scripted text.
"""

from __future__ import annotations

import asyncio
import inspect
import io
import json
import re
import wave
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger, track_duration
from app.services.asr.base import ASRProvider, ASRUnavailable
from app.services.types import ASRSegment, AudioFrame, DiarizationTurn

logger = get_logger(__name__)

DIARIZATION_HINT_KEY = "diarization_turns"

# Gemini's documented audio containers. WebM is absent, which is why browser
# capture is encoded as WAV client-side rather than handed to MediaRecorder.
_SUPPORTED_MIME_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/aiff",
    "audio/aac",
    "audio/ogg",
    "audio/flac",
}

_MIME_ALIASES = {
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/mp3": "audio/mpeg",
    "audio/opus": "audio/ogg",
    "audio/ogg; codecs=opus": "audio/ogg",
    "audio/x-m4a": "audio/aac",
    "audio/mp4": "audio/aac",
}

_PROMPT = """You are an expert clinical medical speech recognition engine for Indian hospital consultations (SIMS Hospital).

Transcribe the clinical encounter audio VERBATIM with extreme precision:
- Multi-lingual capability: Accurately recognize Tamil, Tanglish (Tamil written in English/Tamil script), Hindi, Hinglish, and Indian English.
- Script and vocabulary preservation:
  * For Tamil or Tanglish speech: Accurately transcribe what was spoken verbatim. Preserve spoken Tamil words (e.g. எனக்கு தலைவலி, காய்ச்சல், சோர்வு / fatigue, பலவீனம், இருமல், சளி, வாந்தி, மயக்கம், தலைச்சுற்றல், உடம்பு வலி, நெஞ்சு வலி, மூச்சு திணறல்) in Tamil script or standard Tanglish phonetic text.
  * Do NOT force-translate vernacular Tamil speech into English. Write what was actually spoken verbatim.
  * For English words or clinical brand names spoken inside Tamil or English speech, write standard English (e.g. fever, headache, weakness, fatigue, cough, cold, chest pain, body pain).
- Indian pharmaceutical and clinical terms: Accurately capture medicines, dosages, and vitals (e.g. Dolo 650, Calpol, Paracetamol, Combiflam, Pan-D, Pantocid, Omez, Rantac, Augmentin, Azithral, Montair-LC, Allegra, Cetirizine, Sinarest, Cheston Cold, Ascoril, Benadryl, Electral, Telma 40, Amlong, Cilacar, Metformin 500, Glycomet, Shelcal, Becosules, Neurobion, Volini, Moov, BP, Sugar, CBC, ECG, X-Ray).
- Speaker turn segmentation:
  * Separate the audio into distinct turns per speaker.
  * Label speakers consistently as speaker_0, speaker_1 (typically speaker_0 for doctor, speaker_1 for patient).
  * start and end are seconds relative to the start of THIS audio clip.
  * confidence is between 0.0 and 1.0.
- If the audio contains no intelligible speech, return {"turns": []}.

Return valid JSON only matching this shape:
{"turns":[{"speaker":"speaker_0","text":"...","start":0.0,"end":1.0,"confidence":0.94}]}
"""


class GeminiASRUnavailable(ASRUnavailable):
    """Raised when Gemini transcription cannot be performed at all."""


class GeminiASRProvider(ASRProvider):
    name = "gemini_asr"
    is_mock = False

    def __init__(self, model: str | None = None) -> None:
        chosen = model or settings.effective_gemini_asr_model
        if chosen and any(legacy in chosen.lower() for legacy in ("gemini-1.", "gemini-2.0")):
            chosen = "gemini-3.7-flash"
        self.model = chosen
        self._client: Any | None = None

    # ---------------------------------------------------------------- client
    def _ensure_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not settings.gemini_configured:
            raise GeminiASRUnavailable(
                "GEMINI_API_KEY is not set, so recorded audio cannot be transcribed. "
                "Add a key to .env and restart the backend."
            )
        try:
            from google import genai
            from google.genai import types
        except ImportError as exc:  # pragma: no cover - dependency is declared
            raise GeminiASRUnavailable(
                "The google-genai package is not importable by the running backend, so audio cannot be "
                "transcribed. Start the backend with the project virtualenv "
                "(backend/.venv) or run `pip install -r backend/requirements.txt`."
            ) from exc

        import os

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

        self._client = genai.Client(api_key=settings.gemini_api_key, http_options=http_options)
        return self._client

    @staticmethod
    def sdk_available() -> bool:
        try:
            import google.genai  # noqa: F401
        except ImportError:
            return False
        return True

    # ------------------------------------------------------------- transcribe
    async def transcribe(self, audio_chunk: AudioFrame) -> list[ASRSegment]:
        payload, mime_type = self._audio_payload(audio_chunk)
        if not payload:
            return []
        if len(payload) > settings.asr_max_audio_bytes:
            raise GeminiASRUnavailable(
                f"Recording is {len(payload) // (1024 * 1024)} MB, above the "
                f"{settings.asr_max_audio_bytes // (1024 * 1024)} MB transcription limit."
            )
        # A decoded frame with no detected voice activity is silence; skip the
        # API call rather than paying for it. Undecoded containers have no local
        # VAD, so they are always forwarded.
        if audio_chunk.decoded and audio_chunk.speech_ratio < 0.02:
            return []

        with track_duration("asr", logger, provider=self.name, session_id=audio_chunk.session_id):
            turns = await self._call_with_retries(payload, mime_type, audio_chunk.session_id)

        if not turns:
            return []

        segments: list[ASRSegment] = []
        diarization: list[DiarizationTurn] = []
        offset = audio_chunk.start_time
        clip_duration = audio_chunk.duration

        for index, turn in enumerate(turns):
            text = str(turn.get("text") or "").strip()
            if not text:
                continue
            start, end = self._turn_bounds(turn, index, len(turns), clip_duration)
            confidence = self._clamp(turn.get("confidence"), default=0.9)
            speaker = str(turn.get("speaker") or f"speaker_{index}").strip() or f"speaker_{index}"

            segments.append(
                ASRSegment(
                    id=f"asr_{audio_chunk.sequence:04d}_{index:02d}",
                    text=text,
                    start_time=round(offset + start, 3),
                    end_time=round(offset + end, 3),
                    confidence=confidence,
                    words=[],
                )
            )
            diarization.append(
                DiarizationTurn(
                    speaker_id=speaker,
                    start_time=round(offset + start, 3),
                    end_time=round(offset + end, 3),
                    confidence=confidence,
                )
            )

        # Handed to the diarization stage, which runs after ASR for this reason.
        audio_chunk.hints[DIARIZATION_HINT_KEY] = diarization
        logger.info(
            "gemini_asr_transcribed",
            extra={
                "session_id": audio_chunk.session_id,
                "turns": len(segments),
                "audio_bytes": len(payload),
                "model": self.model,
            },
        )
        return segments

    async def _call_with_retries(self, payload: bytes, mime_type: str, session_id: str) -> list[dict[str, Any]]:
        last_error: Exception | None = None
        candidate_models = [self.model]
        for fallback in ("gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"):
            if fallback not in candidate_models:
                candidate_models.append(fallback)

        max_attempts = max(settings.gemini_asr_max_retries, 1)
        for attempt in range(max_attempts):
            current_model = candidate_models[attempt % len(candidate_models)]
            try:
                self.model = current_model
                gen_fut = self._generate(payload, mime_type)
                if inspect.isawaitable(gen_fut):
                    raw = await asyncio.wait_for(
                        gen_fut,
                        timeout=settings.gemini_asr_timeout_seconds,
                    )
                else:
                    raw = gen_fut
                return self._parse(raw)
            except (TimeoutError, asyncio.TimeoutError) as exc:
                last_error = exc
                logger.warning(
                    "gemini_asr_timeout",
                    extra={"session_id": session_id, "attempt": attempt + 1, "model": current_model},
                )
            except Exception as exc:  # noqa: BLE001 - provider errors are re-raised below
                last_error = exc
                self._client = None  # Re-establish fresh connection pool on next attempt
                if not self._retryable(exc):
                    break
                logger.warning(
                    "gemini_asr_retrying",
                    extra={
                        "session_id": session_id,
                        "attempt": attempt + 1,
                        "model": current_model,
                        "next_model": candidate_models[(attempt + 1) % len(candidate_models)] if attempt < max_attempts - 1 else None,
                        "error": str(exc)[:200],
                    },
                )
            if attempt < max_attempts - 1:
                await asyncio.sleep(min(1.5 * (attempt + 1), 5.0) + (attempt * 0.2))

        raise GeminiASRUnavailable(f"Gemini transcription failed: {last_error}") from last_error

    @staticmethod
    def _retryable(exc: Exception) -> bool:
        """Transient transport/capacity failures are worth another attempt.

        Authentication, quota and bad-request errors are not: retrying only
        delays the error the user needs to see.
        """
        if isinstance(exc, GeminiASRUnavailable):
            return False
        status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if isinstance(status, int):
            return status in (404, 408, 429, 500, 502, 503, 504)
        message = str(exc).lower()
        if any(token in message for token in ("401", "403", "invalid api key", "permission")):
            return False
        if any(token in message for token in ("not found", "404")):
            return True
        return any(
            token in message
            for token in (
                "timeout",
                "temporarily",
                "unavailable",
                "overloaded",
                "high demand",
                "503",
                "500",
                "502",
                "504",
                "429",
                "10054",
                "connection was forcibly closed",
                "forcibly closed",
                "remotedisconnected",
                "connection reset",
                "connection error",
                "socket",
                "broken pipe",
                "network",
                "transport",
                "protocol",
            )
        )

    async def _generate(self, payload: bytes, mime_type: str) -> str:
        client = self._ensure_client()
        from google.genai import types

        gen_kwargs: dict[str, Any] = {
            "response_mime_type": "application/json",
            "temperature": 0.0,
        }
        if "3.7" in self.model or "2.5" in self.model or "3.8" in self.model:
            try:
                gen_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
            except Exception:
                pass

        response = await client.aio.models.generate_content(
            model=self.model,
            contents=[
                types.Part.from_bytes(data=payload, mime_type=mime_type),
                types.Part.from_text(text=_PROMPT),
            ],
            config=types.GenerateContentConfig(**gen_kwargs),
        )
        return response.text or ""

    # ------------------------------------------------------------------ audio
    def _audio_payload(self, frame: AudioFrame) -> tuple[bytes, str]:
        """Return API-ready bytes plus MIME type for this frame."""
        if not frame.pcm:
            return b"", "audio/wav"
        if frame.decoded:
            return self._to_wav(frame), "audio/wav"

        declared = str(frame.hints.get("container_mime_type") or "").lower().split(";")[0].strip()
        mime_type = _MIME_ALIASES.get(declared, declared)
        if mime_type not in _SUPPORTED_MIME_TYPES:
            raise GeminiASRUnavailable(
                f"Audio format '{declared or 'unknown'}' cannot be transcribed. "
                "Supported formats: WAV, MP3, OGG, FLAC, AAC, AIFF."
            )
        return frame.pcm, mime_type

    @staticmethod
    def _to_wav(frame: AudioFrame) -> bytes:
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(frame.sample_rate)
            handle.writeframes(frame.pcm)
        return buffer.getvalue()

    # ----------------------------------------------------------------- parsing
    @staticmethod
    def _parse(raw: str) -> list[dict[str, Any]]:
        text = (raw or "").strip()
        if not text:
            return []

        # Strip code block fences or thinking tags
        text = re.sub(r"<(?:think|thought)>.*?</(?:think|thought)>", "", text, flags=re.DOTALL).strip()
        if "```" in text:
            parts = text.split("```")
            for part in parts:
                trimmed = part.strip()
                if trimmed.lower().startswith("json"):
                    trimmed = trimmed[4:].strip()
                if trimmed.startswith("{") or trimmed.startswith("["):
                    text = trimmed
                    break

        # Find outer JSON boundaries
        start_brace = text.find("{")
        start_bracket = text.find("[")
        if start_brace != -1 and (start_bracket == -1 or start_brace < start_bracket):
            end = text.rfind("}")
            if end > start_brace:
                text = text[start_brace : end + 1]
        elif start_bracket != -1:
            end = text.rfind("]")
            if end > start_bracket:
                text = text[start_bracket : end + 1]

        data = None
        # Pass 1: standard json.loads with strict=False (allows unescaped control characters in text)
        try:
            data = json.loads(text, strict=False)
        except Exception:
            # Pass 2: clean control characters
            cleaned = re.sub(r"[\x00-\x1f\x7f-\x9f]", lambda m: "\n" if m.group(0) == "\n" else " ", text)
            try:
                data = json.loads(cleaned, strict=False)
            except Exception:
                pass

        # Pass 3: Regex turn extraction if JSON parse failed
        if data is None:
            turns_regex = []
            pattern = re.compile(r'\{\s*"speaker"\s*:\s*"([^"]+)"\s*,\s*"text"\s*:\s*"([^"]+)"', re.DOTALL)
            for match in pattern.finditer(raw):
                speaker, utt_text = match.groups()
                turns_regex.append({"speaker": speaker, "text": utt_text, "start": 0.0, "end": 1.0, "confidence": 0.9})
            if turns_regex:
                return turns_regex
            raise GeminiASRUnavailable(f"Gemini returned an invalid transcript: {text[:200]}")

        # Recursively unpack nested turns (e.g. {"turns": [[{"speaker": ...}]]})
        def _flatten(items: Any) -> list[dict[str, Any]]:
            out = []
            if isinstance(items, dict):
                if "speaker" in items or "text" in items:
                    out.append(items)
                elif "turns" in items:
                    out.extend(_flatten(items["turns"]))
            elif isinstance(items, list):
                for x in items:
                    out.extend(_flatten(x))
            return out

        if isinstance(data, dict):
            raw_turns = data.get("turns", data)
        elif isinstance(data, list):
            raw_turns = data
        else:
            return []

        return [t for t in _flatten(raw_turns) if isinstance(t, dict) and t.get("text")]

    @staticmethod
    def _turn_bounds(
        turn: dict[str, Any], index: int, total: int, clip_duration: float
    ) -> tuple[float, float]:
        """Timestamps, falling back to an even split when the model omits them."""
        span = clip_duration if clip_duration > 0 else float(total)
        share = span / max(total, 1)
        try:
            start = float(turn.get("start"))
        except (TypeError, ValueError):
            start = index * share
        try:
            end = float(turn.get("end"))
        except (TypeError, ValueError):
            end = start + share

        start = max(0.0, start)
        end = max(end, start + 0.2)
        if clip_duration > 0:
            start = min(start, clip_duration)
            end = min(end, clip_duration)
            if end <= start:
                end = min(clip_duration, start + 0.2)
        return start, end

    @staticmethod
    def _clamp(value: Any, *, default: float) -> float:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return default
        return round(min(max(number, 0.0), 1.0), 4)

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "mock": self.is_mock, "model": self.model}
