import type {
  EntityStatus,
  EntityType,
  NoteSectionKey,
  NoteStatus,
  ProcessingStage,
  SessionStatus,
  SpeakerRole,
} from '@/types'

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
export const WS_BASE = import.meta.env.VITE_WS_BASE ?? ''

export const CONFIDENCE_TOOLTIP = 'Model confidence is not a measure of clinical correctness.'

export const SPEAKER_ROLES: SpeakerRole[] = [
  'DOCTOR',
  'PATIENT',
  'NURSE',
  'STAFF',
  'BACKGROUND',
  'UNKNOWN',
]

export const ROLE_STYLES: Record<SpeakerRole, { label: string; badge: string; accent: string; dot: string }> = {
  DOCTOR: {
    label: 'Doctor',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    accent: 'border-l-blue-500',
    dot: 'bg-blue-500',
  },
  PATIENT: {
    label: 'Patient',
    badge: 'border-teal-200 bg-teal-50 text-teal-700',
    accent: 'border-l-teal-500',
    dot: 'bg-teal-500',
  },
  NURSE: {
    label: 'Nurse',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    accent: 'border-l-violet-500',
    dot: 'bg-violet-500',
  },
  STAFF: {
    label: 'Staff',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    accent: 'border-l-amber-500',
    dot: 'bg-amber-500',
  },
  BACKGROUND: {
    label: 'Background',
    badge: 'border-slate-200 bg-slate-50 text-slate-600',
    accent: 'border-l-slate-400',
    dot: 'bg-slate-400',
  },
  UNKNOWN: {
    label: 'Unknown',
    badge: 'border-slate-200 bg-white text-slate-500',
    accent: 'border-l-slate-300',
    dot: 'bg-slate-300',
  },
}

export const SESSION_STATUS_STYLES: Record<SessionStatus, string> = {
  CREATED: 'border-navy-200 bg-navy-50 text-navy-600',
  LIVE: 'border-rose-200 bg-rose-50 text-rose-700',
  PAUSED: 'border-amber-200 bg-amber-50 text-amber-700',
  PROCESSING: 'border-amber-200 bg-amber-50 text-amber-700',
  REVIEW: 'border-amber-300 bg-amber-50 text-amber-800',
  APPROVED: 'border-green-200 bg-green-50 text-green-700',
  COMPLETED: 'border-navy-200 bg-navy-50 text-navy-600',
}

export const NOTE_STATUS_STYLES: Record<NoteStatus, string> = {
  PROCESSING: 'border-navy-200 bg-navy-50 text-navy-600',
  DRAFT: 'border-blue-200 bg-blue-50 text-blue-700',
  REVIEW_REQUIRED: 'border-amber-300 bg-amber-50 text-amber-800',
  APPROVED: 'border-green-200 bg-green-50 text-green-700',
  EXPORTED: 'border-teal-200 bg-teal-50 text-teal-700',
}

export const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  PROCESSING: 'Processing',
  DRAFT: 'AI Draft',
  REVIEW_REQUIRED: 'Review Required',
  APPROVED: 'Approved',
  EXPORTED: 'Exported',
}

export const SECTION_ORDER: NoteSectionKey[] = [
  'chief_complaint',
  'history_of_present_illness',
  'relevant_medical_history',
  'assessment',
  'plan',
  'follow_up',
]

export const SECTION_LABELS: Record<NoteSectionKey, string> = {
  chief_complaint: 'Chief Complaint',
  history_of_present_illness: 'History of Present Illness',
  relevant_medical_history: 'Relevant Medical History',
  assessment: 'Assessment',
  plan: 'Plan',
  follow_up: 'Follow-up',
}

export const SECTION_HINTS: Record<NoteSectionKey, string> = {
  chief_complaint: 'The presenting problem as stated in the conversation.',
  history_of_present_illness: 'Symptom detail, negatives and qualifiers reported during the encounter.',
  relevant_medical_history: 'Past conditions and procedures explicitly mentioned.',
  assessment: 'Only assessments a clinician stated aloud. MedScribe never diagnoses.',
  plan: 'Actions a clinician explicitly stated.',
  follow_up: 'Review arrangements stated in the conversation.',
}

export const ENTITY_GROUPS: { key: EntityType[]; title: string }[] = [
  { title: 'Symptoms', key: ['SYMPTOM'] },
  { title: 'Medications', key: ['MEDICATION'] },
  { title: 'Allergies', key: ['ALLERGY'] },
  { title: 'Findings', key: ['FINDING'] },
  { title: 'Investigations', key: ['INVESTIGATION', 'PROCEDURE'] },
  { title: 'Qualifiers', key: ['DURATION', 'SEVERITY', 'FREQUENCY', 'CHARACTER'] },
  { title: 'History', key: ['MEDICAL_HISTORY'] },
  { title: 'Plan & Follow-up', key: ['PLAN', 'FOLLOW_UP'] },
  { title: 'Diagnoses stated', key: ['DIAGNOSIS_MENTIONED'] },
]

export const ENTITY_STATUS_STYLES: Record<EntityStatus, string> = {
  PRESENT: 'border-teal-200 bg-teal-50 text-teal-700',
  NEGATED: 'border-rose-200 bg-rose-50 text-rose-700',
  UNCERTAIN: 'border-amber-200 bg-amber-50 text-amber-800',
  HISTORICAL: 'border-violet-200 bg-violet-50 text-violet-700',
  UNKNOWN: 'border-slate-200 bg-slate-50 text-slate-600',
}

export const ENTITY_STATUS_LABELS: Record<EntityStatus, string> = {
  PRESENT: 'Present',
  NEGATED: 'Denied',
  UNCERTAIN: 'Uncertain',
  HISTORICAL: 'Historical',
  UNKNOWN: 'Unknown',
}

export const PIPELINE_STAGES: { stage: ProcessingStage; label: string }[] = [
  { stage: 'AUDIO_CAPTURE', label: 'Audio capture' },
  { stage: 'AUDIO_PREPROCESSING', label: 'Preprocessing' },
  { stage: 'DIARIZATION', label: 'Diarization' },
  { stage: 'ROLE_ATTRIBUTION', label: 'Role attribution' },
  { stage: 'ASR', label: 'Medical ASR' },
  { stage: 'TRANSCRIPT_ASSEMBLY', label: 'Transcript assembly' },
  { stage: 'CLINICAL_NLP', label: 'Clinical NLP' },
  { stage: 'LLM_STRUCTURING', label: 'AI structuring' },
  { stage: 'EVIDENCE_LINKING', label: 'Evidence linking' },
  { stage: 'NOTE_STATE', label: 'Note state engine' },
]

export const SIMULATION_TYPES: { value: string; label: string }[] = [
  { value: 'OSCE', label: 'OSCE / examination' },
  { value: 'WARD_ROUND', label: 'Ward round' },
  { value: 'OUTPATIENT', label: 'Outpatient consultation' },
  { value: 'EMERGENCY', label: 'Emergency scenario' },
  { value: 'TEACHING', label: 'Teaching session' },
  { value: 'OTHER', label: 'Other' },
]

export const SAFETY_NOTICE =
  'MedScribe Live documents what was said in a simulated encounter. It does not diagnose, ' +
  'recommend treatment, or replace clinical judgement. Human review is required.'
