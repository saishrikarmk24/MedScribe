import { useMemo } from 'react'
import { Activity, Brain, Link2 } from 'lucide-react'

import { ConfidenceMeter, EmptyState, Panel, StatusDot } from '@/components/ui/primitives'
import {
  ENTITY_GROUPS,
  ENTITY_STATUS_LABELS,
  ENTITY_STATUS_STYLES,
  PIPELINE_STAGES,
} from '@/constants'
import type { ClinicalEntity, EvidenceLink, ProcessingStage } from '@/types'
import { cn } from '@/utils/cn'
import { formatTimestamp, titleCase } from '@/utils/format'

interface Props {
  entities: ClinicalEntity[]
  evidence: EvidenceLink[]
  stage: ProcessingStage
  stageDetail: string
  onShowSource: (targetKey: string, statement: string) => void
  onHighlight: (ref: string | null) => void
}

export function IntelligencePanel({ entities, evidence, stage, stageDetail, onShowSource, onHighlight }: Props) {
  const grouped = useMemo(() => {
    return ENTITY_GROUPS.map((group) => ({
      title: group.title,
      items: entities.filter((entity) => group.key.includes(entity.entity_type)),
    })).filter((group) => group.items.length > 0)
  }, [entities])

  const recentEvidence = useMemo(() => evidence.slice(-6).reverse(), [evidence])
  const activeIndex = PIPELINE_STAGES.findIndex((item) => item.stage === stage)

  return (
    <Panel title="Clinical Intelligence" icon={<Brain className="h-3.5 w-3.5" aria-hidden />}>
      <div className="space-y-3 p-3">
        <section className="rounded border border-navy-200/80 bg-white">
          <header className="flex items-center gap-2 border-b border-navy-100 bg-navy-50/50 px-2.5 py-1.5">
            <Activity className="h-3.5 w-3.5 text-teal-600" aria-hidden />
            <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-navy-700">Pipeline</h3>
            <span className="ml-auto truncate text-2xs text-navy-500">{stageDetail || 'idle'}</span>
          </header>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1 px-2.5 py-2">
            {PIPELINE_STAGES.map((item, index) => {
              const isActive = item.stage === stage
              const isDone = activeIndex > index
              return (
                <li key={item.stage} className="flex items-center gap-1.5 text-2xs">
                  <StatusDot
                    className={isActive ? 'bg-teal-500' : isDone ? 'bg-teal-300' : 'bg-navy-200'}
                    pulse={isActive}
                  />
                  <span className={cn(isActive ? 'font-semibold text-navy-800' : 'text-navy-500')}>{item.label}</span>
                </li>
              )
            })}
          </ul>
        </section>

        {entities.length === 0 ? (
          <EmptyState
            title="No clinical information yet"
            detail="Entities appear after the first batch of transcript segments has been structured."
          />
        ) : (
          grouped.map((group) => (
            <section key={group.title} className="rounded border border-navy-200/80 bg-white">
              <header className="flex items-center gap-2 border-b border-navy-100 bg-navy-50/50 px-2.5 py-1.5">
                <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-navy-700">{group.title}</h3>
                <span className="mono ml-auto text-2xs text-navy-400">{group.items.length}</span>
              </header>
              <ul className="divide-y divide-navy-50">
                {group.items.map((entity) => (
                  <li key={entity.ref} className="px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('badge', ENTITY_STATUS_STYLES[entity.status])}>
                        {ENTITY_STATUS_LABELS[entity.status]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-navy-900">{entity.value}</span>
                      <button
                        type="button"
                        onClick={() => onShowSource(entity.ref, entity.value)}
                        className="shrink-0 text-2xs font-semibold text-navy-500 hover:text-teal-700"
                        aria-label={`Show source for ${entity.value}`}
                      >
                        <Link2 className="h-3 w-3" aria-hidden />
                      </button>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-2xs text-navy-500">{titleCase(entity.entity_type)}</span>
                      {entity.detail ? (
                        <span className="truncate text-2xs text-navy-400">{entity.detail}</span>
                      ) : null}
                      <ConfidenceMeter value={entity.confidence} className="ml-auto" />
                    </div>
                    {entity.review_required ? (
                      <p className="mt-0.5 text-2xs text-amber-700">{entity.review_reason ?? 'Review required'}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {recentEvidence.length > 0 ? (
          <section className="rounded border border-navy-200/80 bg-white">
            <header className="flex items-center gap-2 border-b border-navy-100 bg-navy-50/50 px-2.5 py-1.5">
              <Link2 className="h-3.5 w-3.5 text-teal-600" aria-hidden />
              <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-navy-700">Recent evidence</h3>
              <span className="mono ml-auto text-2xs text-navy-400">{evidence.length} links</span>
            </header>
            <ul className="divide-y divide-navy-50">
              {recentEvidence.map((link) => (
                <li key={link.id}>
                  <button
                    type="button"
                    onClick={() => onHighlight(link.segment_ref)}
                    className="w-full px-2.5 py-1.5 text-left hover:bg-navy-50/60"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="mono text-2xs text-navy-400">{link.segment_ref ?? 'unlinked'}</span>
                      <span className="mono text-2xs text-navy-400">{formatTimestamp(link.timestamp ?? 0)}</span>
                      {!link.validated ? (
                        <span className="badge ml-auto border-amber-300 bg-amber-50 text-amber-800">Unverified</span>
                      ) : null}
                    </div>
                    <p className="truncate text-2xs text-navy-600">{link.clinical_statement}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Panel>
  )
}
