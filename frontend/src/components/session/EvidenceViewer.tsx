import { useEffect, useState } from 'react'
import { AlertTriangle, Link2, Quote, X } from 'lucide-react'

import { ConfidenceMeter, InlineAlert, Spinner, StatusDot } from '@/components/ui/primitives'
import { CONFIDENCE_TOOLTIP, ROLE_STYLES } from '@/constants'
import { api } from '@/services/api'
import type { EvidenceLink, SpeakerRole, TranscriptSegment } from '@/types'
import { cn } from '@/utils/cn'
import { formatTimestamp } from '@/utils/format'

interface ChainEntry {
  evidence: EvidenceLink
  segment: TranscriptSegment | null
  audio_chunk_id: string | null
}

interface Detail {
  target_key: string
  clinical_statement: string | null
  chain: ChainEntry[]
  validated_count: number
  total_count: number
}

/**
 * The "Show Source" surface: Clinical statement -> evidence -> transcript segment
 * -> speaker -> timestamp -> audio chunk. This is the provenance chain the whole
 * product is built around.
 */
export function EvidenceViewer({
  sessionId,
  targetKey,
  statement,
  onClose,
  onHighlight,
}: {
  sessionId: string
  targetKey: string
  statement: string
  onClose: () => void
  onHighlight: (ref: string | null) => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .evidenceDetail(sessionId, targetKey)
      .then((next) => {
        if (cancelled) return
        setDetail(next as Detail)
        const firstRef = (next as Detail).chain.find((entry) => entry.evidence.segment_ref)?.evidence.segment_ref
        onHighlight(firstRef ?? null)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // onHighlight is stable enough (store action); re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, targetKey])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside
      className="flex w-96 shrink-0 flex-col border-l border-navy-200 bg-white shadow-raised"
      role="complementary"
      aria-label="Evidence viewer"
    >
      <header className="flex items-start justify-between gap-2 border-b border-navy-200 bg-navy-950 px-3 py-2.5 text-white">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-teal-300">
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Evidence
          </p>
          <p className="mono mt-0.5 truncate text-2xs text-navy-300">{targetKey}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-navy-300 hover:bg-white/10 hover:text-white"
          aria-label="Close evidence viewer"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-navy-100 bg-navy-50/60 px-3 py-2.5">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-navy-500">Clinical statement</p>
          <p className="mt-1 text-sm leading-relaxed text-navy-900">
            {detail?.clinical_statement || statement || '—'}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-3 py-4 text-xs text-navy-500">
            <Spinner /> Resolving provenance chain…
          </div>
        ) : null}

        {error ? (
          <div className="p-3">
            <InlineAlert kind="error" title="Could not load evidence">
              {error}
            </InlineAlert>
          </div>
        ) : null}

        {detail && detail.chain.length === 0 && !loading ? (
          <div className="p-3">
            <InlineAlert kind="warning" title="No transcript evidence">
              This statement is not linked to any transcript segment, so it is flagged{' '}
              <strong>REVIEW REQUIRED</strong> and must be verified or removed by a human before approval.
            </InlineAlert>
          </div>
        ) : null}

        {detail && detail.chain.length > 0 ? (
          <>
            <div className="flex items-center gap-2 px-3 py-2 text-2xs text-navy-500">
              <span className="mono">
                {detail.validated_count}/{detail.total_count} validated
              </span>
              <span className="h-px flex-1 bg-navy-100" />
            </div>
            <ol className="space-y-2 px-3 pb-4">
              {detail.chain.map((entry, index) => (
                <ChainCard key={entry.evidence.id ?? index} entry={entry} onHighlight={onHighlight} />
              ))}
            </ol>
          </>
        ) : null}
      </div>

      <footer className="border-t border-navy-100 bg-navy-50/60 px-3 py-2 text-2xs leading-relaxed text-navy-500">
        {CONFIDENCE_TOOLTIP}
      </footer>
    </aside>
  )
}

function ChainCard({ entry, onHighlight }: { entry: ChainEntry; onHighlight: (ref: string | null) => void }) {
  const { evidence, segment, audio_chunk_id: audioChunkId } = entry
  const role = ROLE_STYLES[(evidence.speaker_role as SpeakerRole) ?? 'UNKNOWN'] ?? ROLE_STYLES.UNKNOWN

  return (
    <li>
      <button
        type="button"
        onClick={() => onHighlight(evidence.segment_ref)}
        className={cn(
          'w-full rounded border px-2.5 py-2 text-left transition hover:border-teal-400 hover:bg-teal-50/40',
          evidence.validated ? 'border-navy-200 bg-white' : 'border-amber-300 bg-amber-50/60',
        )}
      >
        <div className="flex items-center gap-1.5">
          <StatusDot className={role.dot} />
          <span className={cn('badge', role.badge)}>{role.label}</span>
          <span className="mono text-2xs text-navy-500">{formatTimestamp(evidence.timestamp ?? 0)}</span>
          <span className="mono ml-auto text-2xs text-navy-300">{evidence.segment_ref ?? 'unlinked'}</span>
        </div>

        <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-navy-800">
          <Quote className="mt-0.5 h-3 w-3 shrink-0 text-navy-300" aria-hidden />
          <span className="italic">{evidence.source_text || segment?.text || 'Source text unavailable'}</span>
        </p>

        <div className="mt-1.5 flex items-center gap-2">
          <ConfidenceMeter value={evidence.confidence} />
          {audioChunkId ? (
            <span className="mono text-2xs text-navy-400">audio {audioChunkId.slice(0, 8)}</span>
          ) : null}
          {!evidence.validated ? (
            <span className="ml-auto flex items-center gap-1 text-2xs font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {evidence.validation_error ?? 'Unverified'}
            </span>
          ) : null}
        </div>
      </button>
    </li>
  )
}
