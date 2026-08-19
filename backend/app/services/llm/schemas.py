"""Structured-output schemas handed to the LLM.

These are intentionally *flat and small*: response schemas constrain generation,
and every extra nested optional field costs tokens and increases the chance of a
malformed response. Provenance is expressed as lists of short segment refs
(``seg_004``), which the evidence layer expands into full references after
validating that each ref actually exists.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.enums import EntityStatus, EntityType


class ExtractedEntity(BaseModel):
    entity_type: EntityType = Field(description="Clinical category of the extracted item")
    value: str = Field(description="Exact clinical concept as stated in the conversation")
    status: EntityStatus = Field(
        description="PRESENT, NEGATED (explicitly denied), UNCERTAIN (hedged), HISTORICAL or UNKNOWN"
    )
    confidence: float = Field(ge=0.0, le=1.0, description="Extraction confidence between 0 and 1")
    source_segment_ids: list[str] = Field(
        default_factory=list, description="Transcript segment ids that state this item, e.g. ['seg_002']"
    )
    detail: str | None = Field(
        default=None, description="Short qualifier such as dose, laterality or context. Null if absent."
    )


class ExtractionResult(BaseModel):
    entities: list[ExtractedEntity] = Field(default_factory=list)
    unsupported_content: list[str] = Field(
        default_factory=list,
        description="Anything you could not attribute to a transcript segment id",
    )


class GeneratedSection(BaseModel):
    text: str = Field(description="Documentation text, or 'Not mentioned' when absent from the conversation")
    confidence: float = Field(ge=0.0, le=1.0)
    source_segment_ids: list[str] = Field(default_factory=list)


class GeneratedNote(BaseModel):
    chief_complaint: GeneratedSection
    history_of_present_illness: GeneratedSection
    relevant_medical_history: GeneratedSection
    assessment: GeneratedSection
    plan: GeneratedSection
    follow_up: GeneratedSection


class NoteUpdate(BaseModel):
    """Incremental result: the generated note plus which sections changed."""

    note: GeneratedNote
    changed_sections: list[str] = Field(default_factory=list)
    change_summary: str = ""
