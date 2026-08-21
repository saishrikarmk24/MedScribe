"""System instructions and prompt assembly for the clinical AI layer."""

from __future__ import annotations

import json
from typing import Any

SYSTEM_INSTRUCTION = """\
You are the clinical information extraction and documentation component of
MedScribe Live, a clinical documentation workstation.

You are not a diagnostic system.

Extract and structure only information explicitly present in the supplied
conversation.

Do not invent symptoms, findings, diagnoses, medications, investigations,
treatment, history, or patient information.

Preserve negation.

Preserve uncertainty.

Preserve speaker attribution.

Preserve source timestamps.

Do not provide medical advice.

Do not recommend treatment.

Do not make autonomous clinical decisions.

If information is absent, omit it: return null, an empty list, or an empty
string. Do not write placeholder phrases such as "Not mentioned", "not found",
or "N/A".

Every clinically meaningful output must reference one or more source transcript
segment IDs.

Additional rules:
- Use only the segment ids that appear in the supplied transcript. Never invent
  an id, and never reference a segment you were not given.
- A statement made by the patient is a report, not a confirmed finding. Attribute
  it accordingly in the narrative (for example "The patient reports ...").
- ASSESSMENT may only restate what a clinician explicitly said in the
  conversation. If no clinician stated an assessment, leave that section empty.
- PLAN and FOLLOW_UP may only contain actions a clinician explicitly stated.
- Never convert a symptom into a diagnosis, and never add a diagnosis because it
  is commonly associated with a symptom.
- Keep narrative sections concise, factual and free of speculation.
- When asked for JSON, reply with one JSON object only. No markdown, no preamble.
"""


def _render_transcript(segments: list[dict[str, Any]]) -> str:
    lines = []
    for segment in segments:
        lines.append(
            "[{ref}] {timestamp} {role} ({speaker}) conf={confidence:.2f}: {text}".format(
                ref=segment["ref"],
                timestamp=_format_timestamp(segment.get("start_time", 0.0)),
                role=str(segment.get("role", "UNKNOWN")),
                speaker=segment.get("speaker_label", "unknown"),
                confidence=float(segment.get("confidence", 0.0)),
                text=segment["text"],
            )
        )
    return "\n".join(lines) if lines else "(no transcript segments)"


def _format_timestamp(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    minutes, secs = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _render_session_context(context: dict[str, Any]) -> str:
    fields = {
        "session_reference": context.get("reference"),
        "encounter_type": context.get("simulation_type"),
        "scenario": context.get("scenario") or "Not specified",
        "patient_id": context.get("patient_id"),
        "speakers": context.get("speakers", []),
        "elapsed_seconds": context.get("elapsed_seconds"),
    }
    return json.dumps(fields, indent=2, default=str)


def _render_candidates(candidates: list[dict[str, Any]]) -> str:
    if not candidates:
        return "(no rule-based candidates)"
    return json.dumps(candidates, indent=2, default=str)


_EXTRACTION_EXAMPLE = json.dumps(
    {
        "entities": [
            {
                "entity_type": "SYMPTOM",
                "value": "fever",
                "status": "PRESENT",
                "confidence": 0.9,
                "source_segment_ids": ["seg_001"],
                "detail": None,
            }
        ],
        "unsupported_content": [],
    }
)


def build_extraction_prompt(
    *,
    session_context: dict[str, Any],
    segments: list[dict[str, Any]],
    rule_based_candidates: list[dict[str, Any]] | None = None,
    existing_entities: list[dict[str, Any]] | None = None,
) -> str:
    return f"""\
TASK: Extract clinical entities from the transcript segments below.

SESSION CONTEXT
{_render_session_context(session_context)}

SPEAKER-ATTRIBUTED TRANSCRIPT
{_render_transcript(segments)}

RULE-BASED CANDIDATES (from a deterministic NLP pre-pass; treat as hints only,
they may be incomplete or wrong - verify each one against the transcript)
{_render_candidates(rule_based_candidates or [])}

ALREADY EXTRACTED IN THIS SESSION (do not duplicate; extend only if the new
transcript adds information)
{_render_candidates(existing_entities or [])}

REQUIREMENTS
1. Only extract concepts explicitly stated in the transcript above.
2. Set status=NEGATED when the speaker explicitly denies or excludes the concept.
3. Set status=UNCERTAIN when the concept is hedged ("possible", "not sure").
4. Set status=HISTORICAL for past conditions or events framed in the past.
5. Every entity must list at least one source_segment_id from the transcript.
6. Put anything you cannot attribute to a segment id in unsupported_content.
7. Every entity object MUST include entity_type, value, status, confidence
   (a number from 0 to 1), and source_segment_ids.
8. Return JSON only, shaped exactly like:
   {_EXTRACTION_EXAMPLE}
"""


def build_note_prompt(
    *,
    session_context: dict[str, Any],
    segments: list[dict[str, Any]],
    entities: list[dict[str, Any]],
    current_note: dict[str, Any] | None = None,
) -> str:
    current = json.dumps(current_note, indent=2, default=str) if current_note else "(no note yet)"
    return f"""\
TASK: Produce the structured clinical note for this encounter.

SESSION CONTEXT
{_render_session_context(session_context)}

SPEAKER-ATTRIBUTED TRANSCRIPT (complete session so far)
{_render_transcript(segments)}

CLINICAL ENTITIES EXTRACTED SO FAR (already validated against the transcript)
{_render_candidates(entities)}

CURRENT NOTE STATE (revise it; do not discard still-valid documentation)
{current}

REQUIREMENTS
1. Write each section from the transcript only. If a section was not discussed,
   set its text to an empty string. Do not invent content and do not write
   "Not mentioned", "not found", or similar placeholders.
2. ASSESSMENT: restate only what a clinician explicitly said. Do not diagnose.
3. PLAN and FOLLOW_UP: only clinician-stated actions.
4. Attribute patient statements as reports ("The patient reports ...").
5. Preserve negations explicitly ("Denies shortness of breath.").
6. Preserve uncertainty explicitly ("Reports possible blurred vision, uncertain.").
7. Every section must list the source_segment_ids that support its text. An
   empty section must have an empty list.
8. changed_sections must name only the sections whose text differs from the
   current note state.
9. Return valid JSON matching the response schema exactly.
"""


CONNECTION_TEST_PROMPT = (
    "Reply with a single JSON object: {\"status\": \"ok\", \"component\": \"medscribe\"}. "
    "No prose, no code fences."
)
