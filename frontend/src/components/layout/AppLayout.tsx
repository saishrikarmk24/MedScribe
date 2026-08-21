import { NavLink, Outlet } from 'react-router-dom'
import { ClipboardList, LayoutDashboard, PlusCircle, Settings, ShieldAlert, Stethoscope, Video } from 'lucide-react'

import { SAFETY_NOTICE } from '@/constants'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/utils/cn'
import { initials } from '@/utils/format'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/sessions/new', label: 'New Session', icon: PlusCircle, end: false },
  { to: '/sessions/gmeet', label: 'Record Meet', icon: Video, end: false },
  { to: '/sessions', label: 'Sessions', icon: ClipboardList, end: true },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

export function AppLayout() {
  const { identityName, identityRole } = useUiStore()

  return (
    <div className="flex h-full min-h-0 bg-navy-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-navy-200 bg-navy-950 text-navy-100">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3.5">
          <Stethoscope className="h-5 w-5 text-teal-300" aria-hidden />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-white">MedScribe Live</p>
            <p className="text-2xs uppercase tracking-[0.14em] text-navy-400">Clinical Workstation</p>
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

        <div className="border-t border-white/10 px-3 py-3 text-2xs">
          <div className="flex items-start gap-1.5 rounded bg-amber-500/10 px-2 py-1.5 text-amber-200/90">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p className="leading-snug">Human review required before approval.</p>
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
