import { Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { ToastHost } from '@/components/ui/ToastHost'
import { DashboardPage } from '@/pages/DashboardPage'
import { GMeetRecordPage } from '@/pages/GMeetRecordPage'
import { LiveSessionPage } from '@/pages/LiveSessionPage'
import { NewSessionPage } from '@/pages/NewSessionPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ReviewPage } from '@/pages/ReviewPage'
import { SessionDetailPage } from '@/pages/SessionDetailPage'
import { SessionsPage } from '@/pages/SessionsPage'
import { SettingsPage } from '@/pages/SettingsPage'

export function App() {
  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/sessions/new" element={<NewSessionPage />} />
          <Route path="/sessions/gmeet" element={<GMeetRecordPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/sessions/:id/live" element={<LiveSessionPage />} />
          <Route path="/sessions/:id/review" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <ToastHost />
    </>
  )
}
