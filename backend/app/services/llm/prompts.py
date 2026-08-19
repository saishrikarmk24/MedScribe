"""System instructions and prompt assembly for the clinical AI layer."""

from __future__ import annotations

import json
from typing import Any

SYSTEM_INSTRUCTION = """\
You are the clinical information extraction and documentation component of
MedScribe Live, a hospital simulation and clinical education platform.

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

If information is absent, return null, an empty list, or "Not mentioned"
according to the schema.

Every clinically meaningful output must reference one or more source transcript
segment IDs.

Additional rules:
- Use only the segment ids that appear in the supplied transcript. Never invent
  an id, and never reference a segment you were not given.
- A statement made by the patient is a report, not a confirmed finding. Attribute
  it accordingly in the narrative (for example "The patient reports ...").
- ASSESSMENT may only restate what a clinician explicitly said in the
  conversation. If no clinician stated an assessment, return "Not mentioned".
- PLAN and FOLLOW_UP may only contain actions a clinician explicitly stated.
- Never convert a symptom into a diagnosis, and never add a diagnosis because it
  is commonly associated with a symptom.
- Keep narrative sections concise, factual and free of speculation.
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
        "simulation_type": context.get("simulation_type"),
        "scenario": context.get("scenario") or "Not specified",
        "simulated_patient_id": context.get("patient_id"),
        "speakers": context.get("speakers", []),
        "elapsed_seconds": context.get("elapsed_seconds"),
    }
    return json.dumps(fields, indent=2, default=str)


def _render_candidates(candidates: list[dict[str, Any]]) -> str:
    if not candidates:
        return "(no rule-based candidates)"
    return json.dumps(candidates, indent=2, default=str)


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
7. Return valid JSON matching the response schema exactly.
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
TASK: Produce the structured clinical note for this simulated encounter.

SESSION CONTEXT
{_render_session_context(session_context)}

SPEAKER-ATTRIBUTED TRANSCRIPT (complete session so far)
{_render_transcript(segments)}

CLINICAL ENTITIES EXTRACTED SO FAR (already validated against the transcript)
{_render_candidates(entities)}

CURRENT NOTE STATE (revise it; do not discard still-valid documentation)
{current}

REQUIREMENTS
1. Write each section from the transcript only. Use "Not mentioned" when the
   conversation does not cover a section.
2. ASSESSMENT: restate only what a clinician explicitly said. Do not diagnose.
3. PLAN and FOLLOW_UP: only clinician-stated actions.
4. Attribute patient statements as reports ("The patient reports ...").
5. Preserve negations explicitly ("Denies shortness of breath.").
6. Preserve uncertainty explicitly ("Reports possible blurred vision, uncertain.").
7. Every section must list the source_segment_ids that support its text. A
   section whose text is "Not mentioned" must have an empty list.
8. changed_sections must name only the sections whose text differs from the
   current note state.
9. Return valid JSON matching the response schema exactly.
"""


CONNECTION_TEST_PROMPT = (
    "Reply with a single JSON object: {\"status\": \"ok\", \"component\": \"medscribe\"}. "
    "No prose, no code fences."
)
