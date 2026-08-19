import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react'

import { CONFIDENCE_TOOLTIP } from '@/constants'
import { cn } from '@/utils/cn'
import { formatConfidence } from '@/utils/format'

export function Panel({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('panel rounded', className)}>
      <header className="panel-header">
        <h2 className="panel-title">
          {icon}
          {title}
        </h2>
        {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
      </header>
      <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Badge({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span className={cn('badge', className)} title={title}>
      {children}
    </span>
  )
}

export function StatusDot({ className, pulse = false }: { className?: string; pulse?: boolean }) {
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', pulse && 'animate-pulse-dot', className)}
      aria-hidden
    />
  )
}

export function ConfidenceMeter({
  value,
  label,
  className,
}: {
  value: number
  label?: string
  className?: string
}) {
  const percentage = Math.round(Math.min(Math.max(value, 0), 1) * 100)
  const tone = percentage >= 85 ? 'bg-teal-500' : percentage >= 65 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-2xs text-navy-500', className)}
      title={CONFIDENCE_TOOLTIP}
    >
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-navy-100">
        <span className={cn('absolute inset-y-0 left-0 rounded-full', tone)} style={{ width: `${percentage}%` }} />
      </span>
      <span className="mono">{formatConfidence(value)}</span>
      {label ? <span className="uppercase tracking-wide">{label}</span> : null}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon?: ReactNode
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="text-navy-300">{icon}</div> : null}
      <p className="text-sm font-medium text-navy-700">{title}</p>
      {detail ? <p className="max-w-sm text-xs leading-relaxed text-navy-500">{detail}</p> : null}
      {action}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-teal-600', className)} aria-hidden />
}

export function InlineAlert({
  kind = 'info',
  title,
  children,
  onDismiss,
  action,
}: {
  kind?: 'info' | 'warning' | 'error' | 'success'
  title: string
  children?: ReactNode
  onDismiss?: () => void
  action?: ReactNode
}) {
  const tones = {
    info: 'border-navy-200 bg-navy-50 text-navy-700',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-rose-300 bg-rose-50 text-rose-900',
    success: 'border-green-300 bg-green-50 text-green-900',
  } as const
  const icons = {
    info: <Info className="h-4 w-4" aria-hidden />,
    warning: <AlertTriangle className="h-4 w-4" aria-hidden />,
    error: <AlertTriangle className="h-4 w-4" aria-hidden />,
    success: <CheckCircle2 className="h-4 w-4" aria-hidden />,
  } as const

  return (
    <div className={cn('flex items-start gap-2 rounded border px-3 py-2 text-xs', tones[kind])} role="status">
      <span className="mt-0.5 shrink-0">{icons[kind]}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-0.5 leading-relaxed">{children}</div> : null}
      </div>
      {action}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-current/70 hover:bg-black/5 hover:text-current"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  detail?: string
  icon?: ReactNode
  tone?: 'default' | 'live' | 'review' | 'approved'
}) {
  const tones = {
    default: 'border-navy-200/70',
    live: 'border-rose-200',
    review: 'border-amber-200',
    approved: 'border-green-200',
  } as const
  return (
    <div className={cn('rounded border bg-white p-3 shadow-panel', tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-navy-500">{label}</p>
        {icon ? <span className="text-navy-300">{icon}</span> : null}
      </div>
      <p className="mono mt-1.5 text-2xl font-semibold leading-none text-navy-900">{value}</p>
      {detail ? <p className="mt-1 text-2xs text-navy-500">{detail}</p> : null}
    </div>
  )
}

export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-navy-400">{label}</span>
      <span className="h-px flex-1 bg-navy-100" />
    </div>
  )
}
