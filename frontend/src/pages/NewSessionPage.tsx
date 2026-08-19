import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, Mic, PlayCircle, Sparkles, Upload } from 'lucide-react'

import { InlineAlert, Panel, Spinner } from '@/components/ui/primitives'
import { SIMULATION_TYPES } from '@/constants'
import { api } from '@/services/api'
import { useUiStore } from '@/store/uiStore'
import type { SessionMode } from '@/types'
import { cn } from '@/utils/cn'

const MODES: { value: SessionMode; label: string; detail: string; icon: typeof Mic }[] = [
  {
    value: 'DEMO',
    label: 'Demo Simulation',
    detail: 'Synthetic conversation replayed through the real pipeline. No microphone needed.',
    icon: FlaskConical,
  },
  {
    value: 'MICROPHONE',
    label: 'Microphone',
    detail: 'Browser capture at 16 kHz mono, streamed to the backend in 2-second chunks.',
    icon: Mic,
  },
  {
    value: 'UPLOAD',
    label: 'Uploaded Recording',
    detail: 'Upload a WAV recording of a simulated encounter and process it in one pass.',
    icon: Upload,
  },
]

const DEFAULTS = {
  name: 'Outpatient chest discomfort simulation',
  patient_id: 'SIM-PT-0042',
  scenario: 'Standardised patient reporting intermittent chest discomfort',
  simulation_type: 'OUTPATIENT',
  doctor_name: 'Dr. A. Rao',
  faculty_name: 'Prof. M. Iyer',
}

export function NewSessionPage() {
  const navigate = useNavigate()
  const pushToast = useUiStore((state) => state.pushToast)
  const identityName = useUiStore((state) => state.identityName)

  const [form, setForm] = useState({ ...DEFAULTS, doctor_name: DEFAULTS.doctor_name })
  const [mode, setMode] = useState<SessionMode>('DEMO')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scripts, setScripts] = useState<{ key: string; title: string; description: string; utterances: number }[]>([])
  const [demoEnabled, setDemoEnabled] = useState(true)

  useEffect(() => {
    api
      .scripts()
      .then((response) => {
        setScripts(response.scripts)
        setDemoEnabled(response.demo_mode_enabled)
      })
      .catch(() => setScripts([]))
  }, [])

  const audioSource = useMemo(
    () => (mode === 'DEMO' ? 'SIMULATION' : mode === 'MICROPHONE' ? 'MICROPHONE' : 'UPLOAD'),
    [mode],
  )

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }))

  const submit = async (autoStart: boolean) => {
    setSubmitting(true)
    setError(null)
    try {
      const session = await api.createSession({
        name: form.name.trim(),
        patient_id: form.patient_id.trim(),
        scenario: form.scenario.trim() || null,
        simulation_type: form.simulation_type,
        doctor_name: form.doctor_name.trim() || identityName,
        faculty_name: form.faculty_name.trim() || null,
        mode,
        audio_source: audioSource,
      })
      if (autoStart) {
        await api.startSession(session.id)
        pushToast({ kind: 'success', title: `${session.reference} started`, detail: 'Streaming the live pipeline.' })
      } else {
        pushToast({ kind: 'success', title: `${session.reference} created` })
      }
      navigate(`/sessions/${session.id}/live`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-5">
        <header>
          <h1 className="text-lg font-semibold tracking-tight text-navy-900">New Simulation Session</h1>
          <p className="text-xs text-navy-500">
            Use synthetic patient identifiers only. Nothing entered here should reference a real patient.
          </p>
        </header>

        {error ? (
          <InlineAlert kind="error" title="Could not create session" onDismiss={() => setError(null)}>
            {error}
          </InlineAlert>
        ) : null}

        <Panel title="Session details" bodyClassName="grid gap-3 p-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="field-label">Session name</span>
            <input className="field-input" value={form.name} onChange={update('name')} required />
          </label>
          <label>
            <span className="field-label">Simulated patient ID</span>
            <input className="field-input mono" value={form.patient_id} onChange={update('patient_id')} required />
          </label>
          <label>
            <span className="field-label">Simulation type</span>
            <select className="field-input" value={form.simulation_type} onChange={update('simulation_type')}>
              {SIMULATION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="field-label">Scenario</span>
            <input className="field-input" value={form.scenario} onChange={update('scenario')} />
          </label>
          <label>
            <span className="field-label">Doctor</span>
            <input className="field-input" value={form.doctor_name} onChange={update('doctor_name')} />
          </label>
          <label>
            <span className="field-label">Faculty / Instructor</span>
            <input className="field-input" value={form.faculty_name} onChange={update('faculty_name')} />
          </label>
        </Panel>

        <Panel title="Audio source" bodyClassName="grid gap-2.5 p-4 sm:grid-cols-3">
          {MODES.map(({ value, label, detail, icon: Icon }) => {
            const disabled = value === 'DEMO' && !demoEnabled
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => setMode(value)}
                className={cn(
                  'flex flex-col gap-1.5 rounded border p-3 text-left transition',
                  mode === value
                    ? 'border-teal-500 bg-teal-50/70 ring-1 ring-teal-500/30'
                    : 'border-navy-200 bg-white hover:border-navy-300',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
                aria-pressed={mode === value}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-navy-900">
                  <Icon className="h-4 w-4 text-teal-600" aria-hidden />
                  {label}
                </span>
                <span className="text-2xs leading-relaxed text-navy-500">{detail}</span>
              </button>
            )
          })}
        </Panel>

        {mode === 'DEMO' && scripts.length > 0 ? (
          <Panel title="Demo conversation" bodyClassName="p-4">
            {scripts.map((script) => (
              <div key={script.key} className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                <div>
                  <p className="text-xs font-semibold text-navy-900">
                    {script.title} <span className="mono text-navy-400">({script.utterances} utterances)</span>
                  </p>
                  <p className="text-2xs leading-relaxed text-navy-500">{script.description}</p>
                </div>
              </div>
            ))}
            <p className="mt-2 text-2xs leading-relaxed text-navy-500">
              Demo Mode drives mock diarization and mock ASR from synthesised audio, then runs the real clinical
              structuring layer — so the intelligence you see is genuine, only the audio is synthetic.
            </p>
          </Panel>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={submitting || !form.name.trim() || !form.patient_id.trim()}
            onClick={() => void submit(true)}
          >
            {submitting ? <Spinner className="text-white" /> : <PlayCircle className="h-4 w-4" aria-hidden />}
            Start Simulation
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={submitting}
            onClick={() => {
              setMode('DEMO')
              void submit(true)
            }}
          >
            <FlaskConical className="h-4 w-4" aria-hidden />
            Load Demo
          </button>
          <button type="button" className="btn-secondary" disabled={submitting} onClick={() => void submit(false)}>
            Create without starting
          </button>
        </div>
      </div>
    </div>
  )
}
