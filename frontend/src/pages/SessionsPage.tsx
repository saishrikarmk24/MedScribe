import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlusCircle, Trash2 } from 'lucide-react'

import { InlineAlert, Panel, Spinner, StatusDot } from '@/components/ui/primitives'
import { NOTE_STATUS_LABELS, SESSION_STATUS_STYLES } from '@/constants'
import { api } from '@/services/api'
import { useUiStore } from '@/store/uiStore'
import type { NoteStatus, SessionStatus, SessionSummary } from '@/types'
import { cn } from '@/utils/cn'
import { formatDateTime, formatDuration } from '@/utils/format'

const STATUS_FILTERS: (SessionStatus | 'ALL')[] = [
  'ALL',
  'CREATED',
  'LIVE',
  'PAUSED',
  'REVIEW',
  'APPROVED',
  'COMPLETED',
]

const PAGE_SIZE = 25

export function SessionsPage() {
  const [items, setItems] = useState<SessionSummary[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState<SessionStatus | 'ALL'>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pushToast = useUiStore((state) => state.pushToast)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const page = await api.listSessions({
        limit: PAGE_SIZE,
        offset,
        status: filter === 'ALL' ? undefined : filter,
      })
      setItems(page.items)
      setTotal(page.total)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filter, offset])

  useEffect(() => {
    void load()
  }, [load])

  const remove = async (session: SessionSummary) => {
    if (!window.confirm(`Delete ${session.reference}? This removes its transcript, entities and note.`)) return
    try {
      await api.deleteSession(session.id)
      pushToast({ kind: 'success', title: `${session.reference} deleted` })
      void load()
    } catch (err) {
      pushToast({ kind: 'error', title: 'Delete failed', detail: (err as Error).message })
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-4 p-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-navy-900">Session History</h1>
            <p className="text-xs text-navy-500">{total} session(s) recorded.</p>
          </div>
          <Link to="/sessions/new" className="btn-primary">
            <PlusCircle className="h-4 w-4" aria-hidden />
            New Session
          </Link>
        </header>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setFilter(status)
                setOffset(0)
              }}
              className={cn(
                'rounded border px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide transition',
                filter === status
                  ? 'border-navy-800 bg-navy-800 text-white'
                  : 'border-navy-200 bg-white text-navy-600 hover:border-navy-400',
              )}
            >
              {status}
            </button>
          ))}
        </div>

        {error ? (
          <InlineAlert kind="error" title="Could not load sessions">
            {error}
          </InlineAlert>
        ) : null}

        <Panel title="Sessions">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-xs text-navy-500">
              <Spinner /> Loading…
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-xs text-navy-500">No sessions match this filter.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-navy-100 bg-navy-50/50 text-2xs uppercase tracking-[0.12em] text-navy-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Reference</th>
                  <th className="px-3 py-2 font-semibold">Session</th>
                  <th className="px-3 py-2 font-semibold">Patient</th>
                  <th className="px-3 py-2 font-semibold">Mode</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                  <th className="px-3 py-2 text-right font-semibold">Segments</th>
                  <th className="px-3 py-2 text-right font-semibold">Duration</th>
                  <th className="px-3 py-2 text-right font-semibold">Created</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {items.map((session) => (
                  <tr key={session.id} className="hover:bg-navy-50/50">
                    <td className="px-3 py-2">
                      <Link to={`/sessions/${session.id}`} className="mono font-medium text-teal-700 hover:underline">
                        {session.reference}
                      </Link>
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-navy-800">{session.name}</td>
                    <td className="mono px-3 py-2 text-navy-600">{session.patient_id}</td>
                    <td className="px-3 py-2 text-navy-600">{session.mode}</td>
                    <td className="px-3 py-2">
                      <span className={cn('badge', SESSION_STATUS_STYLES[session.status])}>
                        <StatusDot
                          className={session.status === 'LIVE' ? 'bg-rose-500' : 'bg-current opacity-60'}
                          pulse={session.status === 'LIVE'}
                        />
                        {session.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-navy-600">
                      {session.note_status ? NOTE_STATUS_LABELS[session.note_status as NoteStatus] : '—'}
                    </td>
                    <td className="mono px-3 py-2 text-right text-navy-700">{session.segment_count}</td>
                    <td className="mono px-3 py-2 text-right text-navy-700">
                      {formatDuration(session.duration_seconds)}
                    </td>
                    <td className="px-3 py-2 text-right text-navy-500">{formatDateTime(session.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to={session.status === 'LIVE' ? `/sessions/${session.id}/live` : `/sessions/${session.id}/review`}
                          className="text-2xs font-semibold text-teal-700 hover:underline"
                        >
                          {session.status === 'LIVE' ? 'Open live' : 'Review'}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void remove(session)}
                          className="rounded p-1 text-navy-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Delete ${session.reference}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {total > PAGE_SIZE ? (
          <div className="flex items-center justify-between text-xs text-navy-600">
            <button
              type="button"
              className="btn-secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </button>
            <span className="mono">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              type="button"
              className="btn-secondary"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
