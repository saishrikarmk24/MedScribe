import { useEffect, useState } from 'react'
import { Check, FileText, Link2, Pencil, ShieldAlert, Sparkles, X } from 'lucide-react'

import { ConfidenceMeter, EmptyState, InlineAlert, Panel } from '@/components/ui/primitives'
import {
  ENTITY_STATUS_LABELS,
  ENTITY_STATUS_STYLES,
  NOTE_STATUS_LABELS,
  NOTE_STATUS_STYLES,
  SECTION_HINTS,
  SECTION_LABELS,
  SECTION_ORDER,
} from '@/constants'
import type { ClinicalEntity, ClinicalNote, ClinicalSection, EntityGroupKey, NoteSectionKey } from '@/types'
import { cn } from '@/utils/cn'
import { formatRelative } from '@/utils/format'

const ENTITY_GROUP_TITLES: Record<EntityGroupKey, string> = {
  symptoms: 'Symptoms',
  medications: 'Medications',
  allergies: 'Allergies',
  findings: 'Examination / Findings',
  investigations: 'Investigations',
}

interface Props {
  note: ClinicalNote | null
  changedSections: string[]
  editable?: boolean
  onShowSource: (targetKey: string, statement: string) => void
  onSaveSection?: (section: NoteSectionKey, text: string) => Promise<void>
  actions?: React.ReactNode
}

export function ClinicalNotePanel({
  note,
  changedSections,
  editable = false,
  onShowSource,
  onSaveSection,
  actions,
}: Props) {
  if (!note) {
    return (
      <Panel title="Clinical Note" icon={<FileText className="h-3.5 w-3.5" aria-hidden />}>
        <EmptyState title="No note yet" detail="The note is created as soon as the session is started." />
      </Panel>
    )
  }

  const content = note.content
  const flagged = note.review_flags ?? []

  return (
    <Panel
      title="Clinical Note"
      icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
      actions={
        <>
          {actions}
          <span className="mono text-2xs text-navy-500">v{note.version}</span>
          <span className={cn('badge', NOTE_STATUS_STYLES[note.status])}>{NOTE_STATUS_LABELS[note.status]}</span>
        </>
      }
    >
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2 text-2xs text-navy-500">
          <span className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-teal-600" aria-hidden />
            {note.model ?? 'pending'}
          </span>
          <span>updated {formatRelative(note.updated_at)}</span>
          {note.approved_by ? <span>approved by {note.approved_by}</span> : null}
        </div>

        {flagged.length > 0 ? (
          <InlineAlert kind="warning" title={`${flagged.length} item(s) require review`}>
            <ul className="mt-1 space-y-0.5">
              {flagged.map((flag) => (
                <li key={`${flag.section}-${flag.reason}`}>
                  <span className="font-semibold">{flag.label}:</span> {flag.reason}
                </li>
              ))}
            </ul>
          </InlineAlert>
        ) : null}

        {SECTION_ORDER.map((key) => (
          <NoteSection
            key={key}
            sectionKey={key}
            section={content[key]}
            changed={changedSections.includes(key)}
            editable={editable}
            onShowSource={onShowSource}
            onSave={onSaveSection}
          />
        ))}

        {(Object.keys(ENTITY_GROUP_TITLES) as EntityGroupKey[]).map((groupKey) => (
          <EntityGroup
            key={groupKey}
            title={ENTITY_GROUP_TITLES[groupKey]}
            entities={content[groupKey] ?? []}
            onShowSource={onShowSource}
          />
        ))}
      </div>
    </Panel>
  )
}

function NoteSection({
  sectionKey,
  section,
  changed,
  editable,
  onShowSource,
  onSave,
}: {
  sectionKey: NoteSectionKey
  section: ClinicalSection | undefined
  changed: boolean
  editable: boolean
  onShowSource: (targetKey: string, statement: string) => void
  onSave?: (section: NoteSectionKey, text: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section?.text ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(section?.text ?? '')
  }, [section?.text, editing])

  if (!section) return null
  const evidenceCount = section.evidence?.length ?? 0
  const needsReview = section.review_required

  const save = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(sectionKey, draft.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article
      className={cn(
        'rounded border bg-white transition',
        needsReview ? 'border-amber-300' : 'border-navy-200/80',
        changed && 'ring-1 ring-teal-400/60',
      )}
    >
      <header className="flex flex-wrap items-center gap-1.5 border-b border-navy-100 bg-navy-50/50 px-2.5 py-1.5">
        <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-navy-700">
          {SECTION_LABELS[sectionKey]}
        </h3>
        {section.edited_by_human ? (
          <span className="badge border-navy-300 bg-white text-navy-600">Human edited</span>
        ) : (
          <span className="badge border-teal-200 bg-teal-50 text-teal-700">AI generated</span>
        )}
        {needsReview ? (
          <span className="badge border-amber-300 bg-amber-50 text-amber-800">
            <ShieldAlert className="h-3 w-3" aria-hidden /> Review
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          <ConfidenceMeter value={section.confidence} />
          <button
            type="button"
            onClick={() => onShowSource(sectionKey, section.text)}
            aria-label={`Show source for ${SECTION_LABELS[sectionKey]}`}
            className="inline-flex items-center gap-1 rounded border border-navy-200 bg-white px-1.5 py-0.5 text-2xs font-semibold text-navy-600 hover:border-teal-400 hover:text-teal-700"
          >
            <Link2 className="h-3 w-3" aria-hidden />
            Show Source ({evidenceCount})
          </button>
          {editable ? (
            editing ? (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded border border-teal-600 bg-teal-600 px-1.5 py-0.5 text-2xs font-semibold text-white disabled:opacity-60"
                >
                  <Check className="h-3 w-3" aria-hidden />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setDraft(section.text)
                  }}
                  className="inline-flex items-center rounded border border-navy-200 px-1.5 py-0.5 text-2xs font-semibold text-navy-600"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 rounded border border-navy-200 bg-white px-1.5 py-0.5 text-2xs font-semibold text-navy-600 hover:border-navy-400"
              >
                <Pencil className="h-3 w-3" aria-hidden />
                Edit
              </button>
            )
          ) : null}
        </span>
      </header>

      <div className="px-2.5 py-2">
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              className="field-input font-normal"
              aria-label={`Edit ${SECTION_LABELS[sectionKey]}`}
            />
            <p className="mt-1 text-2xs text-navy-500">{SECTION_HINTS[sectionKey]}</p>
          </>
        ) : (
          <p
            className={cn(
              'whitespace-pre-wrap text-sm leading-relaxed',
              section.text && section.text !== 'Not mentioned' ? 'text-navy-900' : 'text-navy-400',
            )}
          >
            {section.text || 'Not mentioned'}
          </p>
        )}
        {needsReview && section.review_reason ? (
          <p className="mt-1.5 text-2xs text-amber-700">{section.review_reason}</p>
        ) : null}
      </div>
    </article>
  )
}

function EntityGroup({
  title,
  entities,
  onShowSource,
}: {
  title: string
  entities: ClinicalEntity[]
  onShowSource: (targetKey: string, statement: string) => void
}) {
  return (
    <article className="rounded border border-navy-200/80 bg-white">
      <header className="flex items-center gap-2 border-b border-navy-100 bg-navy-50/50 px-2.5 py-1.5">
        <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-navy-700">{title}</h3>
        <span className="mono ml-auto text-2xs text-navy-400">{entities.length}</span>
      </header>
      <div className="px-2.5 py-2">
        {entities.length === 0 ? (
          <p className="text-xs text-navy-400">Not mentioned</p>
        ) : (
          <ul className="space-y-1">
            {entities.map((entity) => (
              <li key={entity.ref} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className={cn('badge', ENTITY_STATUS_STYLES[entity.status])}>
                  {ENTITY_STATUS_LABELS[entity.status]}
                </span>
                <span className="font-medium text-navy-900">{entity.value}</span>
                {entity.detail ? <span className="text-navy-500">— {entity.detail}</span> : null}
                <button
                  type="button"
                  onClick={() => onShowSource(entity.ref, entity.value)}
                  className="ml-auto inline-flex items-center gap-1 text-2xs font-semibold text-navy-500 hover:text-teal-700"
                >
                  <Link2 className="h-3 w-3" aria-hidden />
                  Source
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
