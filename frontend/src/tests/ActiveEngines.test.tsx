import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ActiveEngines } from '@/components/system/ActiveEngines'
import type { SecondPassStatus, SystemStatus } from '@/types'

function status(secondPass: SecondPassStatus | null): SystemStatus {
  return {
    environment: 'test',
    version: '1',
    database: { connected: true, dialect: 'sqlite', using_fallback: true, url: '' },
    ai: { provider: 'local', model: 'medgemma:9b', mode: 'local', gemini_configured: false },
    providers: {
      asr: {
        name: 'faster_whisper',
        mock: false,
        model: 'large-v3-turbo',
        device: 'cuda',
        compute_type: 'float16',
        language_mode: 'per-utterance (code-switching)',
        loaded: false,
        second_pass: secondPass,
      },
      diarization: { name: 'text', mock: false },
      terminology: {},
      security: {},
    },
    websocket: { connections: 0, sessions: 0 },
    demo_mode_enabled: false,
    pipeline: { llm_fallback_chain: 'medgemma:9b → gemma2:2b', languages: 'ta,hi,te,en' },
  }
}

describe('ActiveEngines', () => {
  it('shows the server model and its fallback, not a hard-coded menu', () => {
    render(<ActiveEngines status={status(null)} />)
    expect(screen.getByText('medgemma:9b')).toBeInTheDocument()
    expect(screen.getByText(/gemma2:2b is tried next/)).toBeInTheDocument()
    expect(screen.getByText('Loads on first recording')).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('surfaces why the second recogniser failed', () => {
    render(
      <ActiveEngines
        status={status({ model: 'ai4bharat/indic-conformer-600m-multilingual', decoder: 'ctc', status: 'failed', error: '401 gated repo' })}
      />,
    )
    expect(screen.getByText('Failed · Whisper only')).toBeInTheDocument()
    expect(screen.getByText('401 gated repo')).toBeInTheDocument()
  })

  it('renders Google Gemini Cloud engine badges when running in cloud mode', () => {
    const cloudStatus: SystemStatus = {
      environment: 'production',
      version: '1',
      database: { connected: true, dialect: 'sqlite', using_fallback: true, url: '' },
      ai: { provider: 'gemini', model: 'gemini-3.7-flash', mode: 'gemini', gemini_configured: true },
      providers: {
        asr: {
          name: 'gemini',
          mock: false,
          model: 'gemini-3.7-flash',
          second_pass: null,
        },
        diarization: { name: 'gemini', mock: false },
        terminology: {},
        security: {},
      },
      websocket: { connections: 0, sessions: 0 },
      demo_mode_enabled: false,
      pipeline: { languages: 'en,ta,hi' },
    }

    render(<ActiveEngines status={cloudStatus} />)
    expect(screen.getByText('gemini-3.7-flash')).toBeInTheDocument()
    expect(screen.getByText('Google Gemini (Cloud)')).toBeInTheDocument()
    expect(screen.getByText('Cloud Audio')).toBeInTheDocument()
    expect(screen.getByText('Native')).toBeInTheDocument()
  })
})

