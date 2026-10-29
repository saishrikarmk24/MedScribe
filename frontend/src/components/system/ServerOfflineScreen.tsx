import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Server,
  Settings,
  Stethoscope,
} from 'lucide-react'
import { setServerBaseUrl } from '@/services/serverConfig'
import { cn } from '@/utils/cn'

interface ServerOfflineScreenProps {
  isChecking: boolean
  lastError: string | null
  serverUrl: string
  retryCountdown: number
  onRetry: () => Promise<boolean>
}

export function ServerOfflineScreen({
  isChecking,
  lastError,
  serverUrl,
  retryCountdown,
  onRetry,
}: ServerOfflineScreenProps) {
  const [showConfig, setShowConfig] = useState(false)
  const [customUrl, setCustomUrl] = useState(serverUrl)
  const [configSaving, setConfigSaving] = useState(false)
  const [configMessage, setConfigMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customUrl.trim()) return
    setConfigSaving(true)
    setConfigMessage(null)

    setServerBaseUrl(customUrl.trim())
    const ok = await onRetry()
    setConfigSaving(false)

    if (ok) {
      setConfigMessage({ ok: true, text: 'Connected successfully! Launching workstation...' })
      setTimeout(() => setShowConfig(false), 900)
    } else {
      setConfigMessage({
        ok: false,
        text: 'Server unreachable. Verify that your Kaggle runner is active.',
      })
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-y-auto bg-canvas p-4 sm:p-6 text-ink">
      {/* Subtle brand tint matching authentic VoiceScribe layout */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgb(var(--aqua)/0.12),transparent)]" />

      <div className="relative w-full max-w-lg animate-fade-in">
        <div className="card p-6 sm:p-8 shadow-raised border border-line bg-surface text-ink">
          {/* Header */}
          <div className="flex flex-col items-center text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand border border-brand/20">
              <Stethoscope className="h-6 w-6" aria-hidden />
            </div>

            <div className="mt-4">
              <span className="badge tone-warning">
                <span className="h-1.5 w-1.5 rounded-full bg-tone-warning-fg animate-pulse" />
                Clinical Workstation Standby
              </span>
            </div>

            <h1 className="mt-3 text-xl font-bold tracking-tight text-ink sm:text-2xl">
              VoiceScribe Server Offline
            </h1>

            <p className="mt-2 text-xs leading-relaxed text-ink-2 sm:text-sm">
              The AI workstation is currently offline or warming up its dual-GPU inference engines.
              This screen connects automatically the moment the backend becomes active.
            </p>
          </div>

          {/* Diagnostic Details Tile */}
          <div className="mt-6 rounded-tile border border-line bg-surface-2 p-4 text-xs space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
              <span className="flex items-center gap-1.5 font-semibold text-ink-2">
                <Server className="h-3.5 w-3.5 text-brand" />
                Target AI Host
              </span>
              <span className="mono text-ink text-[11px] truncate max-w-[210px]">
                {serverUrl || 'Auto-discovering...'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-3">Status:</span>
              <span className="flex items-center gap-1 font-semibold text-tone-warning-fg">
                <AlertCircle className="h-3.5 w-3.5" />
                Awaiting Connection
              </span>
            </div>

            {lastError && !lastError.includes('HTTP 200') ? (
              <p className="rounded-control border border-tone-warning-line bg-tone-warning-bg/40 p-2 text-[11px] text-tone-warning-fg">
                {lastError}
              </p>
            ) : null}

            {/* Auto-countdown progress */}
            <div className="pt-1 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-ink-3">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className={cn('h-3 w-3', isChecking && 'animate-spin text-brand')} />
                  Auto-discovering live tunnel
                </span>
                <span className="mono text-ink-2">in {retryCountdown}s</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-brand transition-all duration-1000 ease-linear"
                  style={{ width: `${((8 - Math.min(retryCountdown, 8)) / 8) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void onRetry()}
              disabled={isChecking}
              className="btn btn-primary w-full py-2.5"
            >
              <RefreshCw className={cn('h-4 w-4', isChecking && 'animate-spin')} />
              {isChecking ? 'Checking Connection...' : 'Check Connection Now'}
            </button>

            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="btn btn-secondary w-full py-2 text-xs"
            >
              <Settings className="h-3.5 w-3.5 text-ink-3" />
              {showConfig ? 'Hide Server Configuration' : 'Configure Server URL Manually'}
            </button>
          </div>

          {/* Collapsible Manual Config */}
          {showConfig ? (
            <form
              onSubmit={handleSaveConfig}
              className="mt-4 rounded-tile border border-line bg-surface-2 p-4 text-left animate-fade-in space-y-3"
            >
              <div>
                <label className="field-label">Cloudflare Tunnel URL</label>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://xxxx.trycloudflare.com"
                  required
                  className="field-input text-xs mono"
                />
                <p className="field-hint">
                  If you started Kaggle manually, paste the generated <code className="mono text-[11px]">trycloudflare.com</code> URL here.
                </p>
              </div>

              {configMessage ? (
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-control p-2 text-xs',
                    configMessage.ok
                      ? 'border border-tone-success-line bg-tone-success-bg text-tone-success-fg'
                      : 'border border-tone-danger-line bg-tone-danger-bg text-tone-danger-fg'
                  )}
                >
                  {configMessage.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{configMessage.text}</span>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={configSaving}
                className="btn btn-primary btn-sm w-full"
              >
                {configSaving ? 'Verifying...' : 'Save & Connect'}
              </button>
            </form>
          ) : null}

          {/* Footer Branding */}
          <div className="mt-6 border-t border-line pt-4 text-center">
            <p className="text-[11px] text-ink-3">
              SIMS Hospital · VoiceScribe Ambulatory Documentation System
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
