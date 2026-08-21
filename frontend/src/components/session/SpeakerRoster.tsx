import { useState } from 'react'
import { UserCog } from 'lucide-react'

import { EmptyState, Panel, StatusDot } from '@/components/ui/primitives'
import { ROLE_STYLES, SPEAKER_ROLES } from '@/constants'
import { api } from '@/services/api'
import { useUiStore } from '@/store/uiStore'
import type { Speaker, SpeakerRole } from '@/types'
import { cn } from '@/utils/cn'
import { formatConfidence } from '@/utils/format'

/**
 * Diarization proposes speaker labels; the human owns the final role. A human
 * override re-runs clinical structuring so the note reflects the corrected roles.
 */
export function SpeakerRoster({
  speakers,
  editable = false,
  compact = false,
  onChanged,
}: {
  speakers: Speaker[]
  editable?: boolean
  compact?: boolean
  onChanged?: (speaker: Speaker) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const pushToast = useUiStore((state) => state.pushToast)

  const update = async (speaker: Speaker, role: SpeakerRole) => {
    if (role === speaker.role) return
    setBusy(speaker.id)
    try {
      const updated = await api.updateSpeakerRole(speaker.id, role)
      onChanged?.(updated)
      pushToast({
        kind: 'success',
        title: `${speaker.label} set to ${ROLE_STYLES[role].label}`,
        detail: 'Clinical structuring will re-run with the corrected roles.',
      })
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not update speaker role', detail: (error as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const body =
    speakers.length === 0 ? (
      <EmptyState title="No speakers detected yet" detail="Speakers appear once diarization clusters the first voices." />
    ) : (
      <ul className={cn('divide-y divide-navy-100', compact && 'text-xs')}>
        {speakers.map((speaker) => {
          const role = ROLE_STYLES[speaker.role] ?? ROLE_STYLES.UNKNOWN
          return (
            <li key={speaker.id} className="flex items-center gap-2 px-3 py-2">
              <StatusDot className={role.dot} />
              <div className="min-w-0 flex-1">
                <p className="mono truncate text-xs font-medium text-navy-800">{speaker.label}</p>
                <p className="text-2xs text-navy-500">
                  {speaker.role_source === 'HUMAN' ? 'Human assigned' : `Auto ${formatConfidence(speaker.confidence)}`}
                </p>
              </div>
              {editable ? (
                <select
                  value={speaker.role}
                  disabled={busy === speaker.id}
                  onChange={(event) => void update(speaker, event.target.value as SpeakerRole)}
                  className="rounded border border-navy-200 bg-white px-1.5 py-1 text-2xs font-semibold uppercase tracking-wide text-navy-700 focus:border-teal-500 focus:outline-none"
                  aria-label={`Role for ${speaker.label}`}
                >
                  {SPEAKER_ROLES.map((option) => (
                    <option key={option} value={option}>
                      {ROLE_STYLES[option].label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={cn('badge', role.badge)}>{role.label}</span>
              )}
            </li>
          )
        })}
      </ul>
    )

  if (compact) return body

  return (
    <Panel title="Speakers" icon={<UserCog className="h-3.5 w-3.5" aria-hidden />} className="shrink-0">
      {body}
    </Panel>
  )
}
