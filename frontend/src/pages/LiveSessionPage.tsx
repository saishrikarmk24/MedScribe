import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClipboardCheck, Mic, Square, Upload } from 'lucide-react'

import { ClinicalNotePanel } from '@/components/session/ClinicalNotePanel'
import { EvidenceViewer } from '@/components/session/EvidenceViewer'
import { IntelligencePanel } from '@/components/session/IntelligencePanel'
import { SessionBar } from '@/components/session/SessionBar'
import { SpeakerRoster } from '@/components/session/SpeakerRoster'
import { TranscriptPanel } from '@/components/session/TranscriptPanel'
import { InlineAlert, Spinner } from '@/components/ui/primitives'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { api } from '@/services/api'
import { useSessionStore } from '@/store/sessionStore'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/utils/cn'
import { formatDuration } from '@/utils/format'

export function LiveSessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const pushToast = useUiStore((state) => state.pushToast)

  const {
    session,
    segments,
    speakers,
    entities,
    note,
    evidence,
    ai,
    stage,
    stageDetail,
    connection,
    audioActive,
    lastNoteChange,
    errors,
    selectedSegmentRef,
    evidenceFocus,
    completed,
    loading,
    attach,
    detach,
    refresh,
    selectSegment,
    focusEvidence,
    setSession,
    dismissError,
  } = useSessionStore()

  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const recorder = useAudioRecorder(id ?? null)

  useEffect(() => {
    if (!id) return
    attach(id).catch((error: Error) => setLoadError(error.message))
    return () => detach()
  }, [attach, detach, id])

  // Local clock so the timer stays smooth between backend status events.
  useEffect(() => {
    if (!session) return
    const base = session.duration_seconds ?? 0
    setElapsed(base)
    if (session.status !== 'LIVE') return
    const startedAt = Date.now()
    const timer = window.setInterval(() => setElapsed(base + (Date.now() - startedAt) / 1000), 500)
    return () => window.clearInterval(timer)
  }, [session?.status, session?.duration_seconds, session])

  useEffect(() => {
    if (completed && session) {
      pushToast({
        kind: 'success',
        title: 'Session complete',
        detail: 'Open the review screen to verify evidence and approve the note.',
      })
    }
  }, [completed, pushToast, session])

  const action = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(true)
      try {
        const result = await fn()
        if (result && typeof result === 'object' && 'reference' in (result as Record<string, unknown>)) {
          setSession(result as never)
        }
        await refresh()
      } catch (error) {
        pushToast({ kind: 'error', title: label, detail: (error as Error).message })
      } finally {
        setBusy(false)
      }
    },
    [pushToast, refresh, setSession],
  )

  const highlightedRefs = useMemo(() => {
    if (!evidenceFocus) return []
    return evidence
      .filter((link) => link.target_key === evidenceFocus.targetKey && link.segment_ref)
      .map((link) => link.segment_ref as string)
  }, [evidence, evidenceFocus])

  const relatedTargets = useMemo(() => {
    if (!selectedSegmentRef) return []
    const seen = new Set<string>()
    return evidence
      .filter((link) => link.segment_ref === selectedSegmentRef)
      .filter((link) => (seen.has(link.target_key) ? false : (seen.add(link.target_key), true)))
  }, [evidence, selectedSegmentRef])

  if (loadError) {
    return (
      <div className="p-6">
        <InlineAlert kind="error" title="Could not load session">
          {loadError}
        </InlineAlert>
      </div>
    )
  }

  if (!session || loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-navy-500">
        <Spinner /> Connecting to session…
      </div>
    )
  }

  const audioLabel =
    session.mode === 'DEMO'
      ? 'Demo feed'
      : session.mode === 'UPLOAD'
        ? 'Uploaded recording'
        : recorder.recording
          ? `Recording ${formatDuration(recorder.seconds)}`
          : recorder.state === 'uploading'
            ? 'Transcribing recording'
            : 'Microphone idle'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SessionBar
        session={session}
        elapsed={elapsed}
        connection={connection}
        ai={ai}
        audioActive={audioActive || recorder.recording}
        audioLabel={audioLabel}
        busy={busy}
        onPause={() => void action('Pause failed', () => api.pauseSession(session.id))}
        onResume={() => void action('Resume failed', () => api.resumeSession(session.id))}
        onStop={() =>
          void action('End session failed', async () => {
            recorder.cancel()
            const stopped = await api.stopSession(session.id)
            navigate(`/sessions/${session.id}/review`)
            return stopped
          })
        }
        onRetryAi={() =>
          void action('AI update failed', async () => {
            const result = await api.retryProcessing(session.id)
            pushToast({
              kind: result.ok ? 'success' : 'warning',
              title: result.ok ? 'Clinical structuring pass complete' : 'No update produced',
              detail: result.message ?? undefined,
            })
            return null
          })
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-navy-200 bg-white px-4 py-1.5">
        {session.status === 'CREATED' ? (
          <button
            type="button"
            className="btn-teal"
            disabled={busy}
            onClick={() => void action('Start failed', () => api.startSession(session.id))}
          >
            Start Session
          </button>
        ) : null}

        {session.mode === 'MICROPHONE' ? (
          <>
            <button
              type="button"
              className={cn(recorder.recording ? 'btn-danger' : 'btn-teal')}
              onClick={() => (recorder.recording ? void recorder.stop() : void recorder.start())}
              disabled={session.status !== 'LIVE' || recorder.busy}
              aria-label={recorder.recording ? 'Stop recording and transcribe' : 'Record microphone'}
            >
              {recorder.state === 'uploading' ? (
                <Spinner />
              ) : recorder.recording ? (
                <Square className="h-4 w-4" aria-hidden />
              ) : (
                <Mic className="h-4 w-4" aria-hidden />
              )}
              {recorder.state === 'requesting'
                ? 'Requesting microphone…'
                : recorder.state === 'uploading'
                  ? 'Transcribing…'
                  : recorder.recording
                    ? `Stop & transcribe · ${formatDuration(recorder.seconds)}`
                    : 'Record'}
            </button>

            {recorder.recording ? (
              <>
                <span className="flex items-center gap-1.5 text-2xs text-navy-500">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
                  Input level
                  <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-navy-100">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-teal-500 transition-[width] duration-100"
                      style={{ width: `${Math.min(100, Math.round(recorder.level * 160))}%` }}
                    />
                  </span>
                </span>
                <button type="button" className="btn-secondary" onClick={recorder.cancel}>
                  Discard
                </button>
              </>
            ) : (
              <span className="text-2xs text-navy-500">
                {session.status === 'LIVE'
                  ? 'Your speech is transcribed after you press Stop.'
                  : 'Start the session to record.'}
              </span>
            )}
          </>
        ) : null}

        {session.mode === 'UPLOAD' ? (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="audio/wav,audio/x-wav,audio/webm,audio/mpeg,audio/ogg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void action('Upload failed', async () => {
                  const result = await api.uploadRecording(session.id, file)
                  pushToast({
                    kind: result.ok ? 'success' : 'warning',
                    title: result.ok ? 'Recording processed' : 'Recording accepted with warnings',
                    detail: result.message ?? undefined,
                  })
                  return null
                })
                event.target.value = ''
              }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInput.current?.click()}
              disabled={busy || !['LIVE', 'PAUSED', 'CREATED'].includes(session.status)}
            >
              <Upload className="h-4 w-4" aria-hidden />
              Upload recording
            </button>
          </>
        ) : null}

        <Link to={`/sessions/${session.id}/review`} className="btn-secondary ml-auto">
          <ClipboardCheck className="h-4 w-4" aria-hidden />
          Review & Approve
        </Link>
      </div>

      {recorder.error || errors.length > 0 ? (
        <div className="space-y-1.5 border-b border-navy-200 bg-navy-50/70 px-4 py-2">
          {recorder.error ? (
            <InlineAlert kind="error" title="Recording could not be processed" onDismiss={recorder.clearError}>
              {recorder.error}
            </InlineAlert>
          ) : null}
          {errors.map((error) => (
            <InlineAlert
              key={error.code}
              kind={error.recoverable ? 'warning' : 'error'}
              title={`${error.stage}: ${error.code}`}
              onDismiss={() => dismissError(error.code)}
            >
              {error.message}
              {error.recoverable
                ? ' The transcript keeps running and the note is flagged for review; use “Run AI update” to retry.'
                : null}
            </InlineAlert>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.85fr)]">
          <div className="flex min-h-0 flex-col gap-2">
            <TranscriptPanel
              segments={segments}
              speakers={speakers}
              evidence={evidence}
              selectedRef={selectedSegmentRef}
              highlightedRefs={highlightedRefs}
              live={session.status === 'LIVE'}
              onSelect={selectSegment}
            />
            {relatedTargets.length > 0 ? (
              <div className="shrink-0 rounded border border-teal-200 bg-teal-50/60 p-2">
                <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-teal-800">
                  Clinical statements citing {selectedSegmentRef}
                </p>
                <ul className="mt-1 space-y-1">
                  {relatedTargets.map((link) => (
                    <li key={link.id}>
                      <button
                        type="button"
                        onClick={() =>
                          focusEvidence({
                            targetKey: link.target_key,
                            statement: link.clinical_statement,
                            kind: link.target_kind,
                          })
                        }
                        className="text-left text-2xs text-navy-700 hover:text-teal-700 hover:underline"
                      >
                        {link.clinical_statement}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <SpeakerRoster speakers={speakers} onChanged={() => void refresh()} />
          </div>

          <ClinicalNotePanel
            note={note}
            changedSections={lastNoteChange?.sections ?? []}
            onShowSource={(targetKey, statement) => focusEvidence({ targetKey, statement, kind: 'SECTION' })}
          />

          <IntelligencePanel
            entities={entities}
            evidence={evidence}
            stage={stage}
            stageDetail={stageDetail}
            onShowSource={(targetKey, statement) => focusEvidence({ targetKey, statement, kind: 'ENTITY' })}
            onHighlight={selectSegment}
          />
        </div>

        {evidenceFocus ? (
          <EvidenceViewer
            sessionId={session.id}
            targetKey={evidenceFocus.targetKey}
            statement={evidenceFocus.statement}
            onClose={() => focusEvidence(null)}
            onHighlight={selectSegment}
          />
        ) : null}
      </div>
    </div>
  )
}
