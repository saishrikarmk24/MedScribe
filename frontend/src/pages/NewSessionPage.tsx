import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, Mic, PlayCircle, Sparkles, Upload } from 'lucide-react'

import { InlineAlert, Panel, Spinner } from '@/components/ui/primitives'
import { ENCOUNTER_TYPES } from '@/constants'
import { api } from '@/services/api'
import { useUiStore } from '@/store/uiStore'
import type { SessionMode } from '@/types'
import { cn } from '@/utils/cn'

const MODES: { value: SessionMode; label: string; detail: string; icon: typeof Mic }[] = [
  {
    value: 'MICROPHONE',
    label: 'Microphone (live)',
    detail: 'Record the real encounter in the browser. Your speech is transcribed when you press Stop.',
    icon: Mic,
  },
  {
    value: 'UPLOAD',
    label: 'Uploaded Recording',
    detail: 'Upload a recording of a real encounter and transcribe it in one pass.',
    icon: Upload,
  },
  {
    value: 'DEMO',
    label: 'Demo',
    detail: 'Scripted conversation replayed through the pipeline. No real audio is transcribed.',
    icon: FlaskConical,
  },
]

const DEFAULTS = {
  name: 'Outpatient chest discomfort',
  patient_id: 'SIM-PT-0042',
  scenario: 'Standardised patient reporting intermittent chest discomfort',
  simulation_type: 'OUTPATIENT',
  doctor_name: 'Dr. A. Rao',
}

export function NewSessionPage() {
  const navigate = useNavigate()
  const pushToast = useUiStore((state) => state.pushToast)
  const identityName = useUiStore((state) => state.identityName)

  const [form, setForm] = useState({ ...DEFAULTS, doctor_name: DEFAULTS.doctor_name })
  // Real microphone capture is the default; Demo Mode has to be chosen deliberately
  // so a scripted transcript can never be mistaken for a recorded encounter.
  const [mode, setMode] = useState<SessionMode>('MICROPHONE')
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
        faculty_name: null,
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
          <h1 className="text-lg font-semibold tracking-tight text-navy-900">New Session</h1>
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
            <span className="field-label">Patient ID</span>
            <input className="field-input mono" value={form.patient_id} onChange={update('patient_id')} required />
          </label>
          <label>
            <span className="field-label">Encounter type</span>
            <select className="field-input" value={form.simulation_type} onChange={update('simulation_type')}>
              {ENCOUNTER_TYPES.map((type) => (
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
              Demo Mode replays this script through the real clinical structuring layer, so the intelligence you see
              is genuine while the audio is synthetic. It does not use your microphone and does not transcribe real
              speech — choose <span className="font-semibold">Microphone (live)</span> for that.
            </p>
          </Panel>
        ) : null}

        {mode === 'MICROPHONE' ? (
          <Panel title="Before you record" bodyClassName="p-4">
            <ul className="space-y-1 text-2xs leading-relaxed text-navy-500">
              <li>The browser will ask for microphone permission the first time you press Record.</li>
              <li>Speak the encounter, then press Stop to transcribe the recording you just made.</li>
              <li>
                Transcription requires the backend to have a configured speech provider. If it does not, you will get
                an explicit error rather than sample content.
              </li>
            </ul>
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
            Start Session
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
            Run Scripted Demo
          </button>
          <button type="button" className="btn-secondary" disabled={submitting} onClick={() => void submit(false)}>
            Create without starting
          </button>
        </div>
      </div>
    </div>
  )
}
