import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ClipboardList, FileCheck2, PlusCircle, ShieldAlert } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { InlineAlert, Panel, Spinner, StatCard, StatusDot } from '@/components/ui/primitives'
import { NOTE_STATUS_LABELS, SESSION_STATUS_STYLES } from '@/constants'
import { api } from '@/services/api'
import type { DashboardStats, NoteStatus } from '@/types'
import { cn } from '@/utils/cn'
import { formatDuration, formatRelative, titleCase } from '@/utils/format'

const BAR_COLORS = ['#159f94', '#2563eb', '#7c3aed', '#b45309', '#0d9488', '#3c6795']

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const nextStats = await api.dashboard()
        if (cancelled) return
        setStats(nextStats)
        setError(null)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    }
    void load()
    const timer = window.setInterval(load, 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  if (error && !stats) {
    return (
      <div className="p-6">
        <InlineAlert kind="error" title="Backend unreachable">
          {error}. Start the API with <code className="mono">uvicorn app.main:app --reload</code> in{' '}
          <code className="mono">backend/</code>.
        </InlineAlert>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-navy-500">
        <Spinner /> Loading dashboard…
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-4 p-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-navy-900">Documentation Overview</h1>
            <p className="text-xs text-navy-500">
              Every note requires human review before approval.
            </p>
          </div>
          <Link to="/sessions/new" className="btn-primary">
            <PlusCircle className="h-4 w-4" aria-hidden />
            New Session
          </Link>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Active"
            value={stats.active_sessions}
            detail="live or processing"
            tone={stats.active_sessions > 0 ? 'live' : 'default'}
            icon={<Activity className="h-4 w-4" aria-hidden />}
          />
          <StatCard
            label="Completed"
            value={stats.completed_sessions}
            detail={`${stats.total_sessions} total`}
            icon={<ClipboardList className="h-4 w-4" aria-hidden />}
          />
          <StatCard
            label="Notes generated"
            value={stats.notes_generated}
            detail={`${stats.notes_approved} approved`}
            icon={<FileCheck2 className="h-4 w-4" aria-hidden />}
          />
          <StatCard
            label="Review required"
            value={stats.review_required_count}
            detail="human action needed"
            tone={stats.review_required_count > 0 ? 'review' : 'default'}
            icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="Sessions per day" className="lg:col-span-2" bodyClassName="p-3">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.sessions_by_day}>
                  <CartesianGrid stroke="#e2eaf3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#5d86b1' }}
                    tickFormatter={(value: string) => value.slice(5)}
                    axisLine={{ stroke: '#c3d3e5' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: '#5d86b1' }}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 4, borderColor: '#c3d3e5' }}
                    labelStyle={{ color: '#254163' }}
                  />
                  <Bar dataKey="sessions" fill="#159f94" radius={[2, 2, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Extracted information" bodyClassName="p-3">
            {stats.entity_distribution.length === 0 ? (
              <p className="p-2 text-xs text-navy-500">No clinical information extracted yet.</p>
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.entity_distribution} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid stroke="#e2eaf3" horizontal={false} />
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="type"
                      tick={{ fontSize: 10, fill: '#5d86b1' }}
                      tickFormatter={titleCase}
                      axisLine={false}
                      tickLine={false}
                      width={92}
                    />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 4, borderColor: '#c3d3e5' }} />
                    <Bar dataKey="count" radius={[0, 2, 2, 0]} maxBarSize={16}>
                      {stats.entity_distribution.map((entry, index) => (
                        <Cell key={entry.type} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        <Panel
          title="Recent sessions"
          actions={
            <Link to="/sessions" className="text-2xs font-semibold text-teal-700 hover:underline">
              View all
            </Link>
          }
        >
          {stats.recent_sessions.length === 0 ? (
            <p className="p-4 text-xs text-navy-500">
              No sessions yet. Create one and load the demo conversation to see the full pipeline.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-navy-100 bg-navy-50/50 text-2xs uppercase tracking-[0.12em] text-navy-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Reference</th>
                  <th className="px-3 py-2 font-semibold">Session</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                  <th className="px-3 py-2 text-right font-semibold">Segments</th>
                  <th className="px-3 py-2 text-right font-semibold">Entities</th>
                  <th className="px-3 py-2 text-right font-semibold">Duration</th>
                  <th className="px-3 py-2 text-right font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {stats.recent_sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-navy-50/50">
                    <td className="px-3 py-2">
                      <Link to={`/sessions/${session.id}`} className="mono font-medium text-teal-700 hover:underline">
                        {session.reference}
                      </Link>
                    </td>
                    <td className="max-w-[18rem] truncate px-3 py-2 text-navy-800">{session.name}</td>
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
                    <td className="mono px-3 py-2 text-right text-navy-700">{session.entity_count}</td>
                    <td className="mono px-3 py-2 text-right text-navy-700">
                      {formatDuration(session.duration_seconds)}
                    </td>
                    <td className="px-3 py-2 text-right text-navy-500">{formatRelative(session.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  )
}
