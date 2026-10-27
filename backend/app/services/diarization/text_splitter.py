"""Text-based Doctor / Patient splitting for single-speaker diarization output.

``ClinicalTextSplitter`` runs offline with no model at all: it labels turns
from question/answer alternation, clinical-inquiry and directive language, and
first-person complaint language in English, Hindi, Tamil and Telugu.

``GeminiTextSplitter`` sends the text to a cheap Gemini model instead and is
only used when a Gemini key is configured.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.models.enums import SpeakerRole

logger = get_logger(__name__)

_DOCTOR_CUES = (
    # English inquiry / examination / directive language
    r"\bhow long\b", r"\bsince when\b", r"\bwhen did\b", r"\bwhere (?:is|does)\b", r"\bdo you\b",
    r"\bare you\b", r"\bhave you\b", r"\bdid you\b", r"\bany (?:fever|vomiting|pain|history|allergy|allergies)\b",
    r"\btell me\b", r"\blet me (?:check|examine|see)\b", r"\bopen your\b", r"\bbreathe\b", r"\blie down\b",
    r"\bi(?:'ll| will) (?:prescribe|give|write|start)\b", r"\btake (?:this|the|one|two|tab|dolo)\b",
    r"\b(?:continue|start) (?:dolo|this|the|tab|tablet)\b",
    r"\b(?:get|do) (?:a|an|the)? ?(?:blood test|cbc|x-ray|scan|ecg|mri|ct)\b", r"\bcome back\b",
    r"\breview (?:after|in)\b", r"\bfollow[- ]up\b", r"\bdrink (?:plenty|more)\b",
    # Hindi / Hinglish
    r"\bkab se\b", r"\bkitne din\b", r"\bkya (?:hua|takleef|problem)\b", r"\bkahan dard\b", r"\bdawai (?:lo|lena)\b",
    # Tamil / Tanglish
    r"\bevvalavu naal\b", r"\beppo(?:the| irundhu)\b", r"\benna (?:problem|pannudhu|aachu)\b", r"\bsollunga\b",
    # Telugu
    r"\benni rojul", r"\bemaindi\b", r"\bekkada noppi\b", r"\bcheppandi\b",
)
_PATIENT_CUES = (
    r"\bi (?:have|had|feel|felt|took|am taking|have taken|have been|get|got|can't|cannot|don't|do not)\b",
    r"\bi've been\b", r"\bi'm having\b",
    r"\b(?:hello|hi|hey)\s+doctor\b",
    r"\bmy (?:head|stomach|chest|back|leg|body|throat)\b", r"\bsince (?:\d+|two|three|four|five|last|yesterday)\b",
    r"\bfor (?:the )?past\b",
    r"\bit (?:hurts|started|pains|comes)\b", r"\b(?:yes|no),? doctor\b",
    r"\bdoctor(?: sahab| garu| sir| madam)?,", r"\bdoctor (?:sahab|garu)\b",
    # Hindi
    r"\bmujhe\b", r"\bmera\b", r"\bmeri\b", r"\bho raha\b", r"\baa raha\b",
    # Tamil
    r"\benakku\b", r"\ben(?:noda)? \w+ vali\b", r"\birukku\b", r"\bpoten\b", r"\bsapten\b",
    # Telugu
    r"\bnaaku\b", r"\bnaku\b", r"\bundi\b", r"\bvesukunna",
)
_DOCTOR_RE = re.compile("|".join(_DOCTOR_CUES), re.IGNORECASE)
_PATIENT_RE = re.compile("|".join(_PATIENT_CUES), re.IGNORECASE)
# Short acknowledgements a doctor uses before the next question.
_ACK_RE = re.compile(
    r"^\s*(?:ok(?:ay)?|hmm+|alright|all right|right|i see|fine|good|achha|accha|theek hai|"
    r"haan|sari|seri|sare|avunu|mm+)\W*$",
    re.IGNORECASE,
)
# A medicine name is not a doctor cue. Patients say "I have taken Dolo 650 twice daily".


class ClinicalTextSplitter:
    """Offline Doctor / Patient turn labelling (no model, ~0 ms)."""

    def score(self, text: str) -> float:
        """Positive leans Doctor, negative leans Patient."""
        clean = (text or "").strip()
        if not clean:
            return 0.0
        doctor = len(_DOCTOR_RE.findall(clean)) * 1.0 + clean.count("?") * 1.5
        patient = len(_PATIENT_RE.findall(clean)) * 1.0
        # "Hello doctor" and "I have taken ..." are the patient even if a drug name follows.
        if patient and re.search(r"\b(?:hello|hi|hey)\s+doctor\b|\bi (?:have taken|took|have been|am taking)\b", clean, re.IGNORECASE):
            patient += 1.0
        return doctor - patient

    def split(self, segments: list[dict], previous_role: str | None = None) -> dict[str, str]:
        """Map each ``ref`` to ``"doctor"`` or ``"patient"``.

        Clear cues decide a turn on their own. Ambiguous turns follow the
        dialogue: an answer follows a question, a bare acknowledgement after
        the patient is the doctor, other ambiguous text after the patient
        continues the patient's answer (ASR often splits one answer into
        several segments), and the first ambiguous turn is the doctor opening.
        """
        result: dict[str, str] = {}
        last = previous_role
        for seg in segments:
            text = str(seg.get("text", ""))
            score = self.score(text)
            if score >= 1.0:
                role = "doctor"
            elif score <= -1.0:
                role = "patient"
            elif last == "doctor":
                role = "patient"
            elif last == "patient":
                role = "doctor" if score > 0 or _ACK_RE.match(text) else "patient"
            else:
                role = "doctor"
            result[str(seg["ref"])] = role
            last = role
        return result


def _sentence_is_open(text: str) -> bool:
    """True when the next fragment is still this speaker finishing the thought."""
    stripped = (text or "").strip()
    if not stripped:
        return False
    if stripped.endswith(("?", "!")):
        return False
    if stripped.endswith("."):
        return False
    return True


def _same_thought(previous: str, current: str) -> bool:
    """An unfinished line and its continuation are one person, even if ASR switched speaker."""
    if not previous or not current:
        return False
    if not _sentence_is_open(previous):
        return False
    # A real question is a new turn, not the tail of the previous sentence.
    if current.rstrip().endswith("?") and _DOCTOR_RE.search(current) and not _PATIENT_RE.search(current):
        return False
    return True


def repair_turn_speakers(segments: list, *, previous_role: str | None = None, previous_text: str | None = None) -> tuple[list, str | None, str | None]:
    """Give each turn to the doctor or the patient from what was said.

    Audio diarization on short clips swaps speaker ids and splits one sentence
    across both people. A medicine name must not do that: "I have taken Dolo
    650 twice daily" is the patient. Unfinished sentences stay with the person
    who started them. ``speaker_0`` is the doctor and ``speaker_1`` is the patient.
    """
    splitter = ClinicalTextSplitter()
    repaired: list = []
    last = previous_role
    prev_text = previous_text or ""

    for seg in segments:
        text = str(getattr(seg, "text", "") or "").strip()
        if not text:
            continue
        score = splitter.score(text)
        if last and _same_thought(prev_text, text):
            role = last
        elif score >= 1.0:
            role = "doctor"
        elif score <= -1.0:
            role = "patient"
        elif last == "doctor":
            role = "doctor" if score > 0 or _ACK_RE.match(text) else "patient"
        elif last == "patient":
            role = "doctor" if score > 0 or _ACK_RE.match(text) else "patient"
        else:
            role = "doctor" if score > 0 or _ACK_RE.match(text) else "patient"

        if repaired and role == last and _same_thought(repaired[-1].text, text):
            previous = repaired[-1]
            previous.text = f"{previous.text} {text}".strip()
            if getattr(seg, "end_time", None) is not None:
                previous.end_time = seg.end_time
            prev_text = previous.text
            last = role
            continue

        seg.speaker_label = "speaker_0" if role == "doctor" else "speaker_1"
        seg.role = SpeakerRole.DOCTOR if role == "doctor" else SpeakerRole.PATIENT
        repaired.append(seg)
        last = role
        prev_text = text

    return repaired, last, prev_text


# Fast, reliable model for turn splitting text classification.
_DEFAULT_MODEL = "gemini-3.8-flash"


class GeminiTextSplitter:
    """Splits transcript segments into Doctor/Patient turns using Gemini text analysis.

    Much cheaper than audio-based Gemini ASR (~200 text tokens per chunk vs
    ~25,000 audio tokens).  Used as a fallback when audio-based diarization
    detects only one speaker.
    """

    PROMPT = (
        "Given these medical consultation transcript segments, determine which "
        "were spoken by the DOCTOR and which by the PATIENT.\n\n"
        "Rules:\n"
        "- The DOCTOR asks questions, examines, prescribes, uses clinical "
        "language, directs the conversation\n"
        "- The PATIENT reports symptoms, answers questions, describes their "
        "condition, provides history\n"
        "- Return ONLY valid JSON\n\n"
        "Segments:\n{segments}\n\n"
        'Return: {{"splits": {{"seg_001": "doctor", "seg_002": "patient", ...}}}}'
    )

    def __init__(self, *, model: str | None = None) -> None:
        from app.services.llm.gemini_request import canonical_gemini_model

        self._model = canonical_gemini_model(model or settings.gemini_model or _DEFAULT_MODEL)
        self._client: Any | None = None

    # ------------------------------------------------------------------ client

    def _ensure_client(self) -> Any:
        """Lazily initialise the ``google.genai.Client``.

        Mirrors the SSL / proxy setup in
        :pymod:`app.services.llm.gemini_provider`.
        """
        if self._client is not None:
            return self._client

        try:
            from google import genai  # noqa: PLC0415
            from google.genai import types  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover
            logger.error("google-genai not installed – text splitter unavailable")
            raise RuntimeError(
                "google-genai is not installed. Run: pip install -U google-genai"
            ) from exc

        http_options = None
        client_args: dict[str, Any] = {}
        async_client_args: dict[str, Any] = {}
        if not settings.gemini_verify_ssl:
            client_args["verify"] = False
            async_client_args["verify"] = False
        proxy = (
            settings.gemini_http_proxy
            or os.environ.get("HTTPS_PROXY")
            or os.environ.get("HTTP_PROXY")
        )
        if proxy:
            client_args["proxy"] = proxy
            async_client_args["proxy"] = proxy
        if client_args or async_client_args:
            http_options = types.HttpOptions(
                client_args=client_args or None,
                async_client_args=async_client_args or None,
            )

        self._client = genai.Client(
            api_key=settings.gemini_api_key, http_options=http_options
        )
        logger.info(
            "text_splitter_client_initialised",
            extra={"model": self._model, "verify_ssl": settings.gemini_verify_ssl},
        )
        return self._client

    # ------------------------------------------------------------------ public

    async def split(self, segments: list[dict]) -> dict[str, str]:
        """Classify each segment as ``'doctor'`` or ``'patient'``.

        Parameters
        ----------
        segments:
            List of ``{"ref": str, "text": str}`` dicts.

        Returns
        -------
        dict[str, str]
            Mapping of *ref* → ``"doctor"`` | ``"patient"``.
            Returns an **empty dict** on any error so the caller can fall back
            to the default behaviour.
        """
        if not segments:
            return {}
        if not settings.gemini_configured:
            logger.warning("text_splitter_skipped: GEMINI_API_KEY not configured")
            return {}

        numbered = "\n".join(
            f"{seg['ref']}: {seg['text']}" for seg in segments
        )
        prompt = self.PROMPT.format(segments=numbered)

        try:
            client = self._ensure_client()
            from app.services.llm.gemini_request import gemini_model_chain

            models_to_try = gemini_model_chain(self._model)

            raw = ""
            for m in models_to_try:
                try:
                    response = await client.aio.models.generate_content(
                        model=m,
                        contents=prompt,
                    )
                    raw = (response.text or "").strip()
                    if raw:
                        break
                except Exception as exc:
                    logger.warning("text_splitter_model_failed", extra={"model": m, "error": str(exc)[:200]})
                    continue

            if not raw:
                return {}

            # Strip markdown fences if the model wraps its reply.
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()

            data = json.loads(raw)
            splits: dict[str, str] = data.get("splits", {})

            # Normalise values to lowercase and validate.
            result: dict[str, str] = {}
            for ref, role in splits.items():
                role_lower = str(role).lower()
                if role_lower in ("doctor", "patient"):
                    result[ref] = role_lower

            logger.info(
                "text_splitter_done",
                extra={
                    "total_segments": len(segments),
                    "attributed": len(result),
                },
            )
            return result

        except Exception:
            logger.exception("text_splitter_failed")
            return {}
