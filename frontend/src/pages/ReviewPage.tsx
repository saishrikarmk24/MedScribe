import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  FileJson,
  FileText,
  History,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react'

import { ClinicalNotePanel } from '@/components/session/ClinicalNotePanel'
import { EvidenceViewer } from '@/components/session/EvidenceViewer'
import { SpeakerRoster } from '@/components/session/SpeakerRoster'
import { TranscriptPanel } from '@/components/session/TranscriptPanel'
import { InlineAlert, Panel, Spinner, StatCard } from '@/components/ui/primitives'
import { NOTE_STATUS_LABELS } from '@/constants'
import { api, downloadBlob } from '@/services/api'
import { useSessionStore } from '@/store/sessionStore'
import { useUiStore } from '@/store/uiStore'
import type { ExportFormat, NoteSectionKey, NoteVersion } from '@/types'
import { formatConfidence, formatDateTime, formatDuration } from '@/utils/format'

export function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const pushToast = useUiStore((state) => state.pushToast)
  const identityName = useUiStore((state) => state.identityName)

  const {
    session,
    segments,
    speakers,
    entities,
    note,
    evidence,
    selectedSegmentRef,
    evidenceFocus,
    attach,
    detach,
    refresh,
    selectSegment,
    focusEvidence,
    setNote,
  } = useSessionStore()

  const [versions, setVersions] = useState<NoteVersion[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    attach(id).catch((err: Error) => setError(err.message))
    return () => detach()
  }, [attach, detach, id])

  const loadVersions = useCallback(() => {
    if (!id) return
    api
      .noteVersions(id)
      .then(setVersions)
      .catch(() => setVersions([]))
  }, [id])

  useEffect(loadVersions, [loadVersions, note?.version])

  const stats = useMemo(() => {
    const validated = evidence.filter((link) => link.validated).length
    const sectionConfidences = note
      ? Object.values(note.content)
          .filter((value): value is { confidence: number } => typeof value === 'object' && value !== null && 'confidence' in value)
          .map((value) => value.confidence)
      : []
    const average = sectionConfidences.length
      ? sectionConfidences.reduce((sum, value) => sum + value, 0) / sectionConfidences.length
      : 0
    return { validated, total: evidence.length, average }
  }, [evidence, note])

  const highlightedRefs = useMemo(() => {
    if (!evidenceFocus) return []
    return evidence
      .filter((link) => link.target_key === evidenceFocus.targetKey && link.segment_ref)
      .map((link) => link.segment_ref as string)
  }, [evidence, evidenceFocus])

  const saveSection = async (section: NoteSectionKey, text: string) => {
    if (!note) return
    try {
      const updated = await api.editNote(note.id, { [section]: text, editor: identityName })
      setNote(updated)
      pushToast({ kind: 'success', title: 'Section saved', detail: `Note is now version ${updated.version}.` })
      loadVersions()
    } catch (err) {
      pushToast({ kind: 'error', title: 'Could not save section', detail: (err as Error).message })
    }
  }

  const approve = async () => {
    if (!note) return
    setBusy(true)
    try {
      const updated = await api.approveNote(note.id, identityName)
      setNote(updated)
      await refresh()
      loadVersions()
      pushToast({ kind: 'success', title: 'Note approved', detail: `Approved by ${identityName}.` })
    } catch (err) {
      pushToast({ kind: 'error', title: 'Approval blocked', detail: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const reopen = async () => {
    if (!note) return
    setBusy(true)
    try {
      const updated = await api.reopenNote(note.id)
      setNote(updated)
      setAcknowledged(false)
      await refresh()
      loadVersions()
      pushToast({ kind: 'info', title: 'Note reopened for editing' })
    } catch (err) {
      pushToast({ kind: 'error', title: 'Could not reopen note', detail: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const exportAs = async (format: ExportFormat) => {
    if (!session) return
    setBusy(true)
    try {
      const { blob, filename } = await api.exportSession(session.id, format)
      downloadBlob(blob, filename)
      await refresh()
      pushToast({ kind: 'success', title: `${format} export downloaded`, detail: filename })
    } catch (err) {
      pushToast({ kind: 'error', title: `${format} export failed`, detail: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <InlineAlert kind="error" title="Could not load session">
          {error}
        </InlineAlert>
      </div>
    )
  }

  if (!session || !note) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-navy-500">
        <Spinner /> Loading review workspace…
      </div>
    )
  }

  const flags = note.review_flags ?? []
  const approvable = note.status === 'DRAFT' || note.status === 'REVIEW_REQUIRED'
  const isApproved = note.status === 'APPROVED' || note.status === 'EXPORTED'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-navy-200 bg-white px-4 py-2.5">
        <Link to={`/sessions/${session.id}/live`} className="btn-secondary">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Return to Session
        </Link>
        <div className="leading-tight">
          <p className="mono text-xs font-semibold text-navy-900">{session.reference}</p>
          <p className="text-2xs text-navy-500">
            {session.name} · patient {session.patient_id} · {formatDuration(session.duration_seconds)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void exportAs('JSON')}>
            <FileJson className="h-4 w-4" aria-hidden />
            JSON
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void exportAs('PDF')}>
            <FileText className="h-4 w-4" aria-hidden />
            PDF
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void exportAs('FHIR')}>
            <Download className="h-4 w-4" aria-hidden />
            FHIR JSON
          </button>
          {isApproved ? (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void reopen()}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reopen
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          <TranscriptPanel
            segments={segments}
            speakers={speakers}
            evidence={evidence}
            selectedRef={selectedSegmentRef}
            highlightedRefs={highlightedRefs}
            live={false}
            onSelect={selectSegment}
          />
          <SpeakerRoster speakers={speakers} editable={!isApproved} onChanged={() => void refresh()} />
        </div>

        <ClinicalNotePanel
          note={note}
          changedSections={[]}
          editable={!isApproved}
          onShowSource={(targetKey, statement) => focusEvidence({ targetKey, statement, kind: 'SECTION' })}
          onSaveSection={saveSection}
        />

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Evidence links" value={`${stats.validated}/${stats.total}`} detail="validated" />
            <StatCard label="Avg confidence" value={formatConfidence(stats.average)} detail="section level" />
            <StatCard label="Entities" value={entities.length} detail="extracted" />
            <StatCard
              label="Note status"
              value={NOTE_STATUS_LABELS[note.status]}
              tone={isApproved ? 'approved' : flags.length > 0 ? 'review' : 'default'}
            />
          </div>

          <Panel title="Human-in-the-loop approval" icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />} bodyClassName="space-y-2 p-3">
            {flags.length > 0 ? (
              <InlineAlert kind="warning" title="Resolve these items before approval">
                <ul className="mt-1 space-y-0.5">
                  {flags.map((flag) => (
                    <li key={`${flag.section}-${flag.reason}`}>
                      <span className="font-semibold">{flag.label}:</span> {flag.reason}
                    </li>
                  ))}
                </ul>
              </InlineAlert>
            ) : (
              <InlineAlert kind="info" title="No outstanding review flags">
                Every documented statement is linked to transcript evidence.
              </InlineAlert>
            )}

            {isApproved ? (
              <InlineAlert kind="success" title={`Approved by ${note.approved_by ?? 'reviewer'}`}>
                {formatDateTime(note.approved_at)}
                {note.exported_at ? ` · exported ${formatDateTime(note.exported_at)}` : ''}
              </InlineAlert>
            ) : (
              <>
                <label className="flex items-start gap-2 rounded border border-navy-200 bg-navy-50/60 p-2.5 text-xs leading-relaxed text-navy-700">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-navy-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    I have read this note and its supporting evidence. I confirm it reflects the simulated encounter and
                    accept clinical responsibility for the documentation.
                  </span>
                </label>
                <button
                  type="button"
                  className="btn-teal w-full"
                  disabled={busy || !acknowledged || !approvable || flags.length > 0}
                  onClick={() => void approve()}
                >
                  <BadgeCheck className="h-4 w-4" aria-hidden />
                  Approve Note
                </button>
                <p className="text-2xs leading-relaxed text-navy-500">
                  AI-generated documentation is never auto-approved. Approval always requires an explicit human action
                  from a DOCTOR or FACULTY role.
                </p>
              </>
            )}
          </Panel>

          <Panel title="Version history" icon={<History className="h-3.5 w-3.5" aria-hidden />}>
            {versions.length === 0 ? (
              <p className="p-3 text-xs text-navy-500">No versions recorded yet.</p>
            ) : (
              <ol className="divide-y divide-navy-50">
                {versions.map((version) => (
                  <li key={version.id} className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="mono text-2xs font-semibold text-navy-800">v{version.version}</span>
                      <span className="badge border-navy-200 bg-navy-50 text-navy-600">{version.author_type}</span>
                      <span className="ml-auto text-2xs text-navy-400">{formatDateTime(version.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-2xs text-navy-600">{version.change_summary ?? '—'}</p>
                    {version.changed_sections?.length ? (
                      <p className="mono mt-0.5 text-2xs text-navy-400">{version.changed_sections.join(', ')}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Session metadata" icon={<Stethoscope className="h-3.5 w-3.5" aria-hidden />} bodyClassName="p-3">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-2xs">
              <Meta label="Scenario" value={session.scenario ?? '—'} />
              <Meta label="Simulation type" value={session.simulation_type} />
              <Meta label="Doctor" value={session.doctor_name ?? '—'} />
              <Meta label="Faculty" value={session.faculty_name ?? '—'} />
              <Meta label="Mode" value={session.mode} />
              <Meta label="Audio source" value={session.audio_source} />
              <Meta label="AI mode" value={session.ai_mode} />
              <Meta label="Model" value={session.model_name} />
              <Meta label="Started" value={formatDateTime(session.started_at)} />
              <Meta label="Ended" value={formatDateTime(session.ended_at)} />
            </dl>
          </Panel>
        </div>
      </div>

      {evidenceFocus ? (
        <div className="pointer-events-none fixed inset-y-0 right-0 flex">
          <div className="pointer-events-auto">
            <EvidenceViewer
              sessionId={session.id}
              targetKey={evidenceFocus.targetKey}
              statement={evidenceFocus.statement}
              onClose={() => focusEvidence(null)}
              onHighlight={selectSegment}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-semibold uppercase tracking-[0.1em] text-navy-500">{label}</dt>
      <dd className="truncate text-navy-800">{value}</dd>
    </>
  )
}
