import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GraduationCap, Lock, Mic, PlayCircle, Sparkles, Stethoscope, Unlock, Upload, Users } from 'lucide-react'

import { InlineAlert, Panel, Spinner } from '@/components/ui/primitives'
import { ENCOUNTER_TYPES } from '@/constants'
import { api } from '@/services/api'
import { useUiStore } from '@/store/uiStore'
import type { SessionMode } from '@/types'
import { cn } from '@/utils/cn'

const PRESETS = [
  {
    key: 'COLLEGE_HEADS',
    label: 'College Heads Meeting (MoM)',
    subtitle: 'Principal, Deans & Department Heads',
    icon: GraduationCap,
    tone: 'butter',
    values: {
      name: 'College Department Heads & Academic Council Meeting',
      patient_id: 'COLLEGE-COUNCIL-01',
      simulation_type: 'MEETING',
      doctor_name: 'Dr. R. Sharma (Principal)',
      scenario:
        'College Heads meeting with Principal, Dean Academics, HOD CSE, HOD ECE, and Placement Director discussing curriculum revision, student placements, lab upgrades, and exam schedules.',
    },
  },
  {
    key: 'HOSPITAL_MDT',
    label: 'Hospital Multi-Disciplinary Team (MDT)',
    subtitle: 'Multi-Doctor Specialty Board',
    icon: Users,
    tone: 'mint',
    values: {
      name: 'Multi-Disciplinary Team (MDT) Clinical Board',
      patient_id: 'MDT-BOARD-01',
      simulation_type: 'MDT',
      doctor_name: 'Dr. A. Rao (Chief of Surgery)',
      scenario:
        'Multi-specialty conference with Chief of Surgery, Cardiology, Medical Oncology, Radiology, and Pathology reviewing patient cases and consensus treatment decisions.',
    },
  },
  {
    key: 'CLINIC_OUTPATIENT',
    label: 'Clinical Consultation',
    subtitle: '1-on-1 Doctor–Patient Encounter',
    icon: Stethoscope,
    tone: 'sky',
    values: {
      name: 'Outpatient Consultation',
      patient_id: 'PT-1042',
      simulation_type: 'OUTPATIENT',
      doctor_name: 'Dr. A. Rao',
      scenario: 'Adult patient presenting with intermittent chest discomfort',
    },
  },
]

const MODES: { value: SessionMode; label: string; detail: string; icon: typeof Mic }[] = [
  {
    value: 'MICROPHONE',
    label: 'Live Microphone',
    detail: 'Record the doctor–patient conversation directly in the clinic. Speech is transcribed and structured in real time.',
    icon: Mic,
  },
  {
    value: 'UPLOAD',
    label: 'Upload Audio File',
    detail: 'Upload an audio file (.wav, .mp3, .m4a) of an encounter to generate notes in one pass.',
    icon: Upload,
  },
]

const DEFAULTS = {
  name: 'Outpatient Consultation',
  patient_id: 'PT-1042',
  scenario: 'Adult patient presenting with intermittent chest discomfort',
  simulation_type: 'OUTPATIENT',
  doctor_name: 'Dr. A. Rao',
}

export function NewSessionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pushToast = useUiStore((state) => state.pushToast)
  const identityName = useUiStore((state) => state.identityName)

  const [showBeta, setShowBeta] = useState(searchParams.get('beta') === 'true')
  const [form, setForm] = useState({ ...DEFAULTS, doctor_name: DEFAULTS.doctor_name })
  const [mode, setMode] = useState<SessionMode>('MICROPHONE')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visibleEncounterTypes = useMemo(() => {
    if (showBeta) return ENCOUNTER_TYPES
    return ENCOUNTER_TYPES.filter((t) => t.value !== 'MEETING' && t.value !== 'MDT')
  }, [showBeta])

  const audioSource = useMemo(
    () => (mode === 'MICROPHONE' ? 'MICROPHONE' : 'UPLOAD'),
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
        pushToast({ kind: 'success', title: `${session.reference} started`, detail: 'Live clinical scribe is listening.' })
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
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">New Consultation</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Set up an encounter to start real-time transcription and automatic clinical note generation.
            </p>
          </div>
          {showBeta ? (
            <span className="badge border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded-full px-2.5 py-0.5 text-2xs font-bold flex items-center gap-1">
              <Unlock className="h-3 w-3" /> Private Beta Active
            </span>
          ) : null}
        </header>

        {error ? (
          <InlineAlert kind="error" title="Could not create consultation" onDismiss={() => setError(null)}>
            {error}
          </InlineAlert>
        ) : null}

        {/* Private Beta Templates (Visible only in Beta Mode) */}
        {showBeta ? (
          <div className="rounded-2xl border border-amber-200/80 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/30 p-3.5 space-y-2 animate-slide-in">
            <span className="field-label !text-amber-900 dark:!text-amber-200 flex items-center gap-1.5 font-bold">
              <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> Private Beta: Meeting Minutes & MDT Presets
            </span>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {PRESETS.map((p) => {
                const Icon = p.icon
                const isSelected = form.simulation_type === p.values.simulation_type
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, ...p.values }))}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all duration-150',
                      isSelected
                        ? 'border-teal-500 bg-white dark:bg-slate-800 shadow-xs ring-1 ring-teal-500/30'
                        : 'border-amber-200 dark:border-amber-850 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 hover:border-amber-300',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="grid h-6 w-6 place-items-center rounded-lg bg-amber-100/60 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200">
                        <Icon className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{p.label}</span>
                    </div>
                    <span className="text-2xs text-slate-400 dark:text-slate-400 font-medium pl-0.5">{p.subtitle}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <Panel title="Consultation Details" bodyClassName="grid gap-3 p-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="field-label">Consultation Title / Visit Reason</span>
            <input className="field-input" value={form.name} onChange={update('name')} placeholder="e.g. Chest Discomfort Follow-up" required />
          </label>
          <label>
            <span className="field-label">Patient ID</span>
            <input className="field-input mono" value={form.patient_id} onChange={update('patient_id')} placeholder="e.g. PT-2041" required />
          </label>
          <label>
            <span className="field-label">Consultation Type</span>
            <select className="field-input" value={form.simulation_type} onChange={update('simulation_type')}>
              {visibleEncounterTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="field-label">Clinical Scenario / Notes (Optional)</span>
            <input className="field-input" value={form.scenario} onChange={update('scenario')} placeholder="Brief context or chief concern" />
          </label>
          <label>
            <span className="field-label">Attending Clinician</span>
            <input className="field-input" value={form.doctor_name} onChange={update('doctor_name')} placeholder="e.g. Dr. A. Rao" />
          </label>
        </Panel>

        <Panel title="Audio Input Source" bodyClassName="grid gap-2.5 p-4 sm:grid-cols-2">
          {MODES.map(({ value, label, detail, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg border p-3.5 text-left transition',
                mode === value
                  ? 'border-teal-500 bg-teal-50/80 dark:bg-teal-950/60 ring-1 ring-teal-500/40 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700',
              )}
              aria-pressed={mode === value}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <Icon className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden />
                {label}
              </span>
              <span className="text-2xs leading-relaxed text-slate-500 dark:text-slate-400">{detail}</span>
            </button>
          ))}
        </Panel>

        {mode === 'MICROPHONE' ? (
          <Panel title="Microphone Instructions" bodyClassName="p-4">
            <ul className="space-y-1 text-2xs leading-relaxed text-slate-600 dark:text-slate-300 list-disc ml-4">
              <li>Click <strong>Start Consultation</strong> to open the live workspace.</li>
              <li>Press <strong>Record</strong> when ready to capture speech between doctor and patient.</li>
              <li>When the visit concludes, click <strong>Stop & Transcribe</strong> to finalize the draft note for review.</li>
            </ul>
          </Panel>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            className="btn-teal flex items-center gap-1.5 px-4 py-2 font-semibold shadow-sm"
            disabled={submitting || !form.name.trim() || !form.patient_id.trim()}
            onClick={() => void submit(true)}
          >
            {submitting ? <Spinner className="text-white" /> : <PlayCircle className="h-4 w-4" aria-hidden />}
            Start Consultation
          </button>
          <button type="button" className="btn-secondary text-xs text-slate-500" disabled={submitting} onClick={() => void submit(false)}>
            Save as Draft
          </button>
        </div>

        {/* Discreet Private Beta Labs Toggle */}
        <div className="pt-6 text-center">
          <button
            type="button"
            onClick={() => setShowBeta((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-2xs text-slate-300 hover:text-slate-500 transition-colors"
          >
            {showBeta ? (
              <>
                <Lock className="h-3 w-3" /> Hide Private Beta Features
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 opacity-50" /> Experimental Labs
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
