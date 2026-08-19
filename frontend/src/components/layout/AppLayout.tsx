import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  ClipboardList,
  Cpu,
  Database,
  LayoutDashboard,
  PlusCircle,
  Settings,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react'

import { StatusDot } from '@/components/ui/primitives'
import { SAFETY_NOTICE } from '@/constants'
import { api } from '@/services/api'
import { useUiStore } from '@/store/uiStore'
import type { SystemStatus } from '@/types'
import { cn } from '@/utils/cn'
import { initials } from '@/utils/format'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/sessions/new', label: 'New Simulation', icon: PlusCircle, end: false },
  { to: '/sessions', label: 'Sessions', icon: ClipboardList, end: true },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

export function AppLayout() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const location = useLocation()
  const { identityName, identityRole } = useUiStore()

  useEffect(() => {
    let cancelled = false
    const load = () => {
      api
        .status()
        .then((next) => {
          if (!cancelled) setStatus(next)
        })
        .catch(() => {
          if (!cancelled) setStatus(null)
        })
    }
    load()
    const timer = window.setInterval(load, 20000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [location.pathname])

  const aiConfigured = Boolean(status?.ai.gemini_configured)
  const dbConnected = Boolean(status?.database.connected)

  return (
    <div className="flex h-full min-h-0 bg-navy-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-navy-200 bg-navy-950 text-navy-100">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3.5">
          <Stethoscope className="h-5 w-5 text-teal-300" aria-hidden />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-white">MedScribe Live</p>
            <p className="text-2xs uppercase tracking-[0.14em] text-navy-400">Simulation Suite</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded px-2.5 py-2 text-xs font-medium transition',
                  isActive ? 'bg-teal-500/15 text-teal-200' : 'text-navy-300 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-white/10 px-3 py-3 text-2xs">
          <p className="font-semibold uppercase tracking-[0.14em] text-navy-400">System</p>
          <SystemRow
            icon={<Database className="h-3.5 w-3.5" aria-hidden />}
            label={status?.database.dialect === 'sqlite' ? 'SQLite (dev)' : 'PostgreSQL'}
            ok={dbConnected}
            detail={status?.database.using_fallback ? 'fallback' : undefined}
          />
          <SystemRow
            icon={<Cpu className="h-3.5 w-3.5" aria-hidden />}
            label={status ? `${status.ai.provider}` : 'AI provider'}
            ok={aiConfigured}
            detail={aiConfigured ? String(status?.ai.model ?? '') : 'rule-based'}
          />
          <SystemRow
            icon={<Activity className="h-3.5 w-3.5" aria-hidden />}
            label="WebSocket"
            ok={Boolean(status)}
            detail={status ? `${status.websocket.connections} client(s)` : undefined}
          />
          <div className="flex items-start gap-1.5 rounded bg-amber-500/10 px-2 py-1.5 text-amber-200/90">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p className="leading-snug">Simulation only. Human review required.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
          <span className="mono grid h-7 w-7 place-items-center rounded-full bg-teal-500/20 text-2xs font-semibold text-teal-200">
            {initials(identityName)}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-medium text-white">{identityName}</p>
            <p className="text-2xs uppercase tracking-wide text-navy-400">{identityRole}</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
        <footer className="border-t border-navy-200 bg-white px-4 py-1.5 text-2xs text-navy-500">
          {SAFETY_NOTICE}
        </footer>
      </div>
    </div>
  )
}

function SystemRow({
  icon,
  label,
  ok,
  detail,
}: {
  icon: React.ReactNode
  label: string
  ok: boolean
  detail?: string
}) {
  return (
    <div className="flex items-center gap-2 text-navy-300">
      <span className="text-navy-500">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? <span className="truncate text-navy-500">{detail}</span> : null}
      <StatusDot className={ok ? 'bg-teal-400' : 'bg-amber-400'} />
    </div>
  )
}
