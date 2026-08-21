import { CircleStop, Cpu, Mic, MicOff, Pause, Play, Plug, RefreshCw, Wifi, WifiOff } from 'lucide-react'

import { StatusDot } from '@/components/ui/primitives'
import { SESSION_STATUS_STYLES } from '@/constants'
import type { ConnectionState } from '@/services/socket'
import type { AiStatus, Session } from '@/types'
import { cn } from '@/utils/cn'
import { formatTimestamp } from '@/utils/format'

interface Props {
  session: Session
  elapsed: number
  connection: ConnectionState
  ai: AiStatus | null
  audioActive: boolean
  audioLabel: string
  busy: boolean
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onRetryAi: () => void
}

export function SessionBar({
  session,
  elapsed,
  connection,
  ai,
  audioActive,
  audioLabel,
  busy,
  onPause,
  onResume,
  onStop,
  onRetryAi,
}: Props) {
  const isLive = session.status === 'LIVE'
  const isPaused = session.status === 'PAUSED'
  const canEnd = ['LIVE', 'PAUSED', 'PROCESSING'].includes(session.status)

  const aiLabel = !ai
    ? 'AI idle'
    : ai.mock
      ? 'Rule-based note'
      : ai.provider === 'gemini'
        ? `Gemini · ${ai.model}`
        : 'AI connected'
  const aiOk = Boolean(ai && !ai.degraded && !ai.mock)

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-navy-200 bg-navy-950 px-4 py-2.5 text-white">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'badge border-transparent',
            isLive ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-navy-200',
          )}
        >
          <StatusDot className={isLive ? 'bg-rose-400' : 'bg-navy-400'} pulse={isLive} />
          {session.status}
        </span>
        <div className="leading-tight">
          <p className="mono text-xs font-semibold text-white">{session.reference}</p>
          <p className="max-w-[16rem] truncate text-2xs text-navy-400">{session.name}</p>
        </div>
      </div>

      <p className="mono text-xl font-semibold tabular-nums tracking-tight text-white" aria-label="Session timer">
        {formatTimestamp(elapsed)}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-navy-300">
        <span className="flex items-center gap-1.5" title={`Audio source: ${audioLabel}`}>
          {audioActive ? (
            <Mic className="h-3.5 w-3.5 text-teal-300" aria-hidden />
          ) : (
            <MicOff className="h-3.5 w-3.5 text-navy-400" aria-hidden />
          )}
          {audioLabel}
        </span>
        <span className="flex items-center gap-1.5" title={aiLabel}>
          <Cpu className={cn('h-3.5 w-3.5', aiOk ? 'text-teal-300' : 'text-amber-300')} aria-hidden />
          {aiLabel}
        </span>
        <span className="flex items-center gap-1.5">
          {connection === 'open' ? (
            <Wifi className="h-3.5 w-3.5 text-teal-300" aria-hidden />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-amber-300" aria-hidden />
          )}
          {connection === 'open' ? 'Connected' : connection === 'reconnecting' ? 'Reconnecting…' : connection}
        </span>
        <span className={cn('badge border-transparent bg-white/10', SESSION_STATUS_STYLES[session.status] && 'text-navy-100')}>
          <Plug className="h-3 w-3" aria-hidden />
          {session.mode}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onRetryAi}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded border border-white/20 px-2.5 py-1.5 text-xs font-medium text-navy-100 hover:bg-white/10 disabled:opacity-50"
          title="Force a clinical structuring pass now"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Run AI update
        </button>
        {isLive ? (
          <button
            type="button"
            onClick={onPause}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded border border-white/20 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
          >
            <Pause className="h-3.5 w-3.5" aria-hidden />
            Pause
          </button>
        ) : null}
        {isPaused ? (
          <button
            type="button"
            onClick={onResume}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded border border-teal-500 bg-teal-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            Resume
          </button>
        ) : null}
        <button
          type="button"
          onClick={onStop}
          disabled={busy || !canEnd}
          className="inline-flex items-center gap-1.5 rounded border border-rose-500 bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
        >
          <CircleStop className="h-3.5 w-3.5" aria-hidden />
          End Session
        </button>
      </div>
    </header>
  )
}
