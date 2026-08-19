"""Audio ingestion endpoints (browser microphone and uploaded recordings)."""

from __future__ import annotations

import base64

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.api.deps import DbSession, SessionDep
from app.core.config import settings
from app.core.logging import get_logger
from app.models import SessionStatus
from app.schemas.common import Acknowledgement
from app.schemas.transcript import AudioChunkIngest
from app.services.audio import RawAudio, UploadedAudioProvider
from app.services.pipeline import pipeline

logger = get_logger(__name__)
router = APIRouter(prefix="/sessions", tags=["audio"])

MAX_CHUNK_BYTES = 8 * 1024 * 1024


@router.post("/{session_id}/audio/chunk", response_model=Acknowledgement)
async def ingest_chunk(session: SessionDep, payload: AudioChunkIngest, db: DbSession) -> Acknowledgement:
    """Accept a live microphone buffer captured by the browser."""
    if session.status not in (SessionStatus.LIVE, SessionStatus.PROCESSING):
        raise HTTPException(status_code=409, detail=f"Session is {session.status.value}; audio is not being captured.")

    try:
        data = base64.b64decode(payload.audio_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="audio_base64 is not valid base64.") from exc
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio payload.")
    if len(data) > MAX_CHUNK_BYTES:
        raise HTTPException(status_code=413, detail="Audio chunk exceeds the 8 MB limit.")

    runtime = await pipeline.ensure_runtime(session)
    raw = RawAudio(
        data=data,
        mime_type=payload.mime_type,
        sample_rate=payload.sample_rate or settings.audio_sample_rate,
        channels=payload.channels or settings.audio_channels,
        duration_seconds=payload.duration_seconds,
    )
    segments = await pipeline.ingest_audio(runtime, raw)
    return Acknowledgement(
        ok=True,
        message=f"Processed {len(data)} bytes.",
        detail={
            "segments": [segment.ref for segment in segments],
            "timeline_seconds": round(runtime.timeline, 2),
            "asr_provider": runtime.asr.name,
        },
    )


@router.post("/{session_id}/audio/upload", response_model=Acknowledgement)
async def upload_recording(
    session: SessionDep, db: DbSession, file: UploadFile = File(...)
) -> Acknowledgement:
    """Ingest a complete recording (WAV is decoded locally; other containers are forwarded)."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > 64 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Uploaded recording exceeds the 64 MB limit.")

    runtime = await pipeline.ensure_runtime(session)
    provider = UploadedAudioProvider(data=data, mime_type=file.content_type or "audio/wav")
    raw = await provider.next_chunk()
    if raw is None:  # pragma: no cover - provider always yields once
        raise HTTPException(status_code=400, detail="Could not read the uploaded recording.")

    segments = await pipeline.ingest_audio(runtime, raw)
    return Acknowledgement(
        ok=True,
        message=f"Ingested {file.filename or 'recording'} ({len(data)} bytes).",
        detail={"segments": [segment.ref for segment in segments], "asr_provider": runtime.asr.name},
    )
