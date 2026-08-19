import { useEffect, useMemo, useRef } from 'react'
import { MessageSquare, Layers, Radio } from 'lucide-react'

import { ConfidenceMeter, EmptyState, Panel, StatusDot } from '@/components/ui/primitives'
import { ROLE_STYLES } from '@/constants'
import type { EvidenceLink, Speaker, TranscriptSegment } from '@/types'
import { cn } from '@/utils/cn'
import { formatTimestamp } from '@/utils/format'

interface Props {
  segments: TranscriptSegment[]
  speakers: Speaker[]
  evidence: EvidenceLink[]
  selectedRef: string | null
  highlightedRefs: string[]
  live: boolean
  onSelect: (ref: string | null) => void
  actions?: React.ReactNode
}

export function TranscriptPanel({
  segments,
  speakers,
  evidence,
  selectedRef,
  highlightedRefs,
  live,
  onSelect,
  actions,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)

  const evidenceCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const link of evidence) {
      if (!link.segment_ref) continue
      counts.set(link.segment_ref, (counts.get(link.segment_ref) ?? 0) + 1)
    }
    return counts
  }, [evidence])

  const speakerNames = useMemo(
    () => new Map(speakers.map((speaker) => [speaker.label, speaker.display_name ?? speaker.label])),
    [speakers],
  )

  // Auto-follow the live feed, but stop fighting the user once they scroll up.
  useEffect(() => {
    const node = scrollRef.current
    if (!node || !pinnedToBottom.current) return
    node.scrollTop = node.scrollHeight
  }, [segments.length])

  const handleScroll = () => {
    const node = scrollRef.current
    if (!node) return
    pinnedToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48
  }

  const highlighted = new Set(highlightedRefs)

  return (
    <Panel
      title="Live Transcript"
      icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />}
      actions={
        <>
          {actions}
          <span className="mono flex items-center gap-1 text-2xs text-navy-500">
            <Layers className="h-3 w-3" aria-hidden />
            {segments.length}
          </span>
          {live ? (
            <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-rose-600">
              <StatusDot className="bg-rose-500" pulse />
              Live
            </span>
          ) : null}
        </>
      }
      bodyClassName="divide-y divide-navy-100"
    >
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
        {segments.length === 0 ? (
          <EmptyState
            icon={<Radio className="h-6 w-6" aria-hidden />}
            title="Waiting for speech"
            detail="Transcript segments appear as soon as the pipeline detects voice activity and the ASR provider returns text."
          />
        ) : (
          <ol className="divide-y divide-navy-100">
            {segments.map((segment) => {
              const role = ROLE_STYLES[segment.role] ?? ROLE_STYLES.UNKNOWN
              const isSelected = selectedRef === segment.ref
              const isHighlighted = highlighted.has(segment.ref)
              const evidenceCount = evidenceCounts.get(segment.ref) ?? 0
              return (
                <li key={segment.ref}>
                  <button
                    type="button"
                    onClick={() => onSelect(isSelected ? null : segment.ref)}
                    className={cn(
                      'flex w-full flex-col gap-1 border-l-2 px-3 py-2.5 text-left transition',
                      role.accent,
                      isSelected
                        ? 'bg-teal-50/80'
                        : isHighlighted
                          ? 'bg-amber-50/70'
                          : 'bg-white hover:bg-navy-50/60',
                    )}
                    aria-current={isSelected}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('badge', role.badge)}>{role.label}</span>
                      <span className="mono text-2xs text-navy-500">
                        {formatTimestamp(segment.start_time)}
                      </span>
                      <span className="text-2xs text-navy-400">
                        {speakerNames.get(segment.speaker_label ?? '') ?? segment.speaker_label ?? 'unassigned'}
                      </span>
                      <span className="mono text-2xs text-navy-300">{segment.ref}</span>
                      <span className="ml-auto flex items-center gap-1.5">
                        {segment.overlapping ? (
                          <span className="badge border-amber-200 bg-amber-50 text-amber-700">Overlap</span>
                        ) : null}
                        {evidenceCount > 0 ? (
                          <span className="badge border-teal-200 bg-teal-50 text-teal-700">
                            {evidenceCount} cited
                          </span>
                        ) : null}
                        <ConfidenceMeter value={segment.confidence} />
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-navy-900">{segment.text}</p>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Panel>
  )
}
