"""Deterministic clinical structuring provider (no external API calls).

Used in three situations:

* ``AI_MODE=mock`` (offline demos, CI, unit tests);
* ``GEMINI_API_KEY`` missing;
* Gemini failed after its bounded retries - the session degrades to this
  provider and the note is flagged REVIEW_REQUIRED rather than lost.

It shares the rule engine with :mod:`app.services.nlp`, so its behaviour on
negation and uncertainty is identical to the pre-pass that grounds Gemini.
"""

from __future__ import annotations

from typing import Any

from app.core.logging import get_logger
from app.models.enums import EntityStatus, EntityType, SpeakerRole
from app.services.llm.base import ExtractionResponse, LLMCallStats, LLMProvider, NoteResponse
from app.services.llm.schemas import (
    ExtractedEntity,
    ExtractionResult,
    GeneratedNote,
    GeneratedSection,
    NoteUpdate,
)
from app.services.nlp.clinical_nlp import ClinicalNLPService
from app.services.types import AssembledSegment

logger = get_logger(__name__)

NOT_MENTIONED = "Not mentioned"


def _to_assembled(segment: dict[str, Any]) -> AssembledSegment:
    role = segment.get("role", SpeakerRole.UNKNOWN)
    if isinstance(role, str):
        try:
            role = SpeakerRole(role.upper())
        except ValueError:
            role = SpeakerRole.UNKNOWN
    return AssembledSegment(
        ref=str(segment.get("ref", "seg_000")),
        speaker_label=str(segment.get("speaker_label", "unknown")),
        role=role,
        text=str(segment.get("text", "")),
        start_time=float(segment.get("start_time", 0.0)),
        end_time=float(segment.get("end_time", 0.0)),
        confidence=float(segment.get("confidence", 0.0)),
        asr_confidence=float(segment.get("asr_confidence", 0.0)),
        diarization_confidence=float(segment.get("diarization_confidence", 0.0)),
    )


class DeterministicLLMProvider(LLMProvider):
    name = "rule-based"
    model = "medscribe-rules-v1"
    is_mock = True

    def __init__(self, nlp: ClinicalNLPService | None = None) -> None:
        self.nlp = nlp or ClinicalNLPService()

    async def extract_entities(
        self,
        *,
        session_context: dict[str, Any],
        segments: list[dict[str, Any]],
        rule_based_candidates: list[dict[str, Any]] | None = None,
        existing_entities: list[dict[str, Any]] | None = None,
    ) -> ExtractionResponse:
        assembled = [_to_assembled(segment) for segment in segments]
        candidates = self.nlp.extract(assembled)
        entities = [
            ExtractedEntity(
                entity_type=candidate.entity_type,
                value=candidate.value,
                status=candidate.status,
                confidence=candidate.confidence,
                source_segment_ids=list(candidate.source_segment_refs),
                detail=candidate.detail,
            )
            for candidate in candidates
        ]
        return ExtractionResponse(
            result=ExtractionResult(entities=entities),
            stats=LLMCallStats(provider=self.name, model=self.model, fallback_used=True),
        )

    async def generate_note(
        self,
        *,
        session_context: dict[str, Any],
        segments: list[dict[str, Any]],
        entities: list[dict[str, Any]],
        current_note: dict[str, Any] | None = None,
    ) -> NoteResponse:
        assembled = [_to_assembled(segment) for segment in segments]
        grouped = self._group(entities)
        note = GeneratedNote(
            chief_complaint=self._chief_complaint(grouped, assembled),
            history_of_present_illness=self._hpi(grouped),
            relevant_medical_history=self._history(grouped),
            assessment=self._assessment(grouped),
            plan=self._joined(grouped.get(EntityType.PLAN.value, []), prefix="Documented plan: "),
            follow_up=self._joined(grouped.get(EntityType.FOLLOW_UP.value, []), prefix="Documented follow-up: "),
        )
        changed = self._changed_sections(note, current_note)
        return NoteResponse(
            result=NoteUpdate(
                note=note,
                changed_sections=changed,
                change_summary="Rule-based structuring (deterministic provider).",
            ),
            stats=LLMCallStats(provider=self.name, model=self.model, fallback_used=True),
        )

    async def check_connection(self) -> dict[str, Any]:
        return {"connected": True, "model": self.model, "provider": self.name, "mock": True}

    # --------------------------------------------------------------- composition
    @staticmethod
    def _group(entities: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        grouped: dict[str, list[dict[str, Any]]] = {}
        for entity in entities:
            entity_type = entity.get("entity_type")
            key = entity_type.value if hasattr(entity_type, "value") else str(entity_type)
            grouped.setdefault(key, []).append(entity)
        return grouped

    @staticmethod
    def _refs(entities: list[dict[str, Any]]) -> list[str]:
        refs: list[str] = []
        for entity in entities:
            for ref in entity.get("source_segment_refs") or entity.get("source_segment_ids") or []:
                if ref not in refs:
                    refs.append(ref)
        return refs

    @staticmethod
    def _status(entity: dict[str, Any]) -> str:
        status = entity.get("status", EntityStatus.UNKNOWN)
        return status.value if hasattr(status, "value") else str(status)

    @staticmethod
    def _value(entity: dict[str, Any]) -> str:
        return str(entity.get("normalized_value") or entity.get("value") or "").strip()

    def _present(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [entity for entity in entities if self._status(entity) in ("PRESENT", "UNKNOWN")]

    def _negated(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [entity for entity in entities if self._status(entity) == "NEGATED"]

    def _uncertain(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [entity for entity in entities if self._status(entity) == "UNCERTAIN"]

    def _chief_complaint(
        self, grouped: dict[str, list[dict[str, Any]]], segments: list[AssembledSegment]
    ) -> GeneratedSection:
        symptoms = self._present(grouped.get(EntityType.SYMPTOM.value, []))
        durations = self._present(grouped.get(EntityType.DURATION.value, []))
        if not symptoms:
            first_patient = next((s for s in segments if s.role is SpeakerRole.PATIENT), None)
            if first_patient is None:
                return GeneratedSection(text=NOT_MENTIONED, confidence=0.0, source_segment_ids=[])
            return GeneratedSection(
                text=f"Patient reports: {first_patient.text.rstrip('.')}.",
                confidence=round(first_patient.confidence * 0.8, 4),
                source_segment_ids=[first_patient.ref],
            )
        primary = symptoms[0]
        text = f"Patient reports {self._value(primary)}"
        refs = list(primary.get("source_segment_refs") or primary.get("source_segment_ids") or [])
        if durations:
            text += f" {self._value(durations[0])}"
            refs += [ref for ref in self._refs([durations[0]]) if ref not in refs]
        return GeneratedSection(text=text.strip() + ".", confidence=0.86, source_segment_ids=refs)

    def _hpi(self, grouped: dict[str, list[dict[str, Any]]]) -> GeneratedSection:
        symptoms = grouped.get(EntityType.SYMPTOM.value, [])
        sentences: list[str] = []
        refs: list[str] = []

        present = self._present(symptoms)
        if present:
            sentences.append("Reported symptoms: " + ", ".join(self._value(e) for e in present) + ".")
            refs += self._refs(present)

        qualifiers = [
            ("Character", grouped.get(EntityType.CHARACTER.value, [])),
            ("Severity", grouped.get(EntityType.SEVERITY.value, [])),
            ("Frequency", grouped.get(EntityType.FREQUENCY.value, [])),
            ("Duration", grouped.get(EntityType.DURATION.value, [])),
        ]
        for label, items in qualifiers:
            usable = self._present(items)
            if usable:
                sentences.append(f"{label}: " + ", ".join(self._value(e) for e in usable) + ".")
                refs += [ref for ref in self._refs(usable) if ref not in refs]

        negated = self._negated(symptoms)
        if negated:
            sentences.append("Denies " + ", ".join(self._value(e) for e in negated) + ".")
            refs += [ref for ref in self._refs(negated) if ref not in refs]

        uncertain = self._uncertain(symptoms)
        if uncertain:
            sentences.append(
                "Uncertain report of " + ", ".join(self._value(e) for e in uncertain) + " (not confirmed)."
            )
            refs += [ref for ref in self._refs(uncertain) if ref not in refs]

        if not sentences:
            return GeneratedSection(text=NOT_MENTIONED, confidence=0.0, source_segment_ids=[])
        return GeneratedSection(text=" ".join(sentences), confidence=0.82, source_segment_ids=refs)

    def _history(self, grouped: dict[str, list[dict[str, Any]]]) -> GeneratedSection:
        history = grouped.get(EntityType.MEDICAL_HISTORY.value, [])
        procedures = grouped.get(EntityType.PROCEDURE.value, [])
        items = self._present(history) + self._present(procedures)
        if not items:
            return GeneratedSection(text=NOT_MENTIONED, confidence=0.0, source_segment_ids=[])
        return GeneratedSection(
            text="Mentioned in conversation: " + ", ".join(self._value(e) for e in items) + ".",
            confidence=0.78,
            source_segment_ids=self._refs(items),
        )

    def _assessment(self, grouped: dict[str, list[dict[str, Any]]]) -> GeneratedSection:
        """Only clinician-stated diagnoses are documented. Nothing is inferred."""
        diagnoses = grouped.get(EntityType.DIAGNOSIS_MENTIONED.value, [])
        stated = self._present(diagnoses)
        if not stated:
            return GeneratedSection(text=NOT_MENTIONED, confidence=0.0, source_segment_ids=[])
        return GeneratedSection(
            text="Clinician explicitly stated: " + ", ".join(self._value(e) for e in stated) + ".",
            confidence=0.7,
            source_segment_ids=self._refs(stated),
        )

    def _joined(self, entities: list[dict[str, Any]], prefix: str) -> GeneratedSection:
        usable = self._present(entities)
        if not usable:
            return GeneratedSection(text=NOT_MENTIONED, confidence=0.0, source_segment_ids=[])
        joined = "; ".join(self._value(entity) for entity in usable)
        return GeneratedSection(text=f"{prefix}{joined}.", confidence=0.75, source_segment_ids=self._refs(usable))

    @staticmethod
    def _changed_sections(note: GeneratedNote, current_note: dict[str, Any] | None) -> list[str]:
        if not current_note:
            return [key for key, section in note.model_dump().items() if section["text"] != NOT_MENTIONED]
        changed: list[str] = []
        for key, section in note.model_dump().items():
            existing = current_note.get(key) or {}
            if section["text"] != (existing.get("text") if isinstance(existing, dict) else existing):
                changed.append(key)
        return changed
