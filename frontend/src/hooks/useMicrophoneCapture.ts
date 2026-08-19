/**
 * Browser microphone capture.
 *
 * Captures at the pipeline's canonical format (16 kHz mono PCM16) and posts WAV
 * chunks to the backend, which owns preprocessing, VAD, diarization and ASR.
 * WAV is used rather than MediaRecorder's WebM/Opus because the backend decodes
 * WAV without an ffmpeg dependency.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '@/services/api'
import { useUiStore } from '@/store/uiStore'

const TARGET_SAMPLE_RATE = 16000
const CHUNK_SECONDS = 2

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }
  return buffer
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const length = Math.floor(input.length / ratio)
  const output = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), input.length)
    let sum = 0
    for (let j = start; j < end; j += 1) sum += input[j]
    output[i] = end > start ? sum / (end - start) : 0
  }
  return output
}

export interface MicrophoneCapture {
  active: boolean
  level: number
  error: string | null
  start: () => Promise<void>
  stop: () => void
}

export function useMicrophoneCapture(sessionId: string | null, enabled: boolean): MicrophoneCapture {
  const [active, setActive] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const pushToast = useUiStore((state) => state.pushToast)

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const bufferRef = useRef<Float32Array[]>([])
  const bufferedRef = useRef(0)
  const sendingRef = useRef(false)

  const flush = useCallback(
    async (sampleRate: number) => {
      if (!sessionId || sendingRef.current || bufferRef.current.length === 0) return
      sendingRef.current = true
      const chunks = bufferRef.current
      bufferRef.current = []
      bufferedRef.current = 0

      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const merged = new Float32Array(total)
      let offset = 0
      for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.length
      }
      const resampled = downsample(merged, sampleRate, TARGET_SAMPLE_RATE)

      try {
        await api.sendAudioChunk(sessionId, {
          audio_base64: toBase64(encodeWav(resampled, TARGET_SAMPLE_RATE)),
          mime_type: 'audio/wav',
          sample_rate: TARGET_SAMPLE_RATE,
          channels: 1,
          duration_seconds: resampled.length / TARGET_SAMPLE_RATE,
        })
      } catch (err) {
        setError((err as Error).message)
      } finally {
        sendingRef.current = false
      }
    },
    [sessionId],
  )

  const stop = useCallback(() => {
    processorRef.current?.disconnect()
    processorRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void contextRef.current?.close()
    contextRef.current = null
    bufferRef.current = []
    bufferedRef.current = 0
    setActive(false)
    setLevel(0)
  }, [])

  const start = useCallback(async () => {
    if (!sessionId || active) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
      contextRef.current = context
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      const chunkSamples = context.sampleRate * CHUNK_SECONDS

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0)
        bufferRef.current.push(new Float32Array(input))
        bufferedRef.current += input.length

        let peak = 0
        for (let i = 0; i < input.length; i += 16) peak = Math.max(peak, Math.abs(input[i]))
        setLevel(peak)

        if (bufferedRef.current >= chunkSamples) void flush(context.sampleRate)
      }

      source.connect(processor)
      // ScriptProcessor only fires while connected to a destination; a zero-gain
      // node keeps the graph alive without echoing the mic back to the speakers.
      const silent = context.createGain()
      silent.gain.value = 0
      processor.connect(silent)
      silent.connect(context.destination)

      setActive(true)
      pushToast({ kind: 'success', title: 'Microphone connected', detail: '16 kHz mono capture streaming to the pipeline.' })
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      pushToast({ kind: 'error', title: 'Microphone unavailable', detail: message })
      stop()
    }
  }, [active, flush, pushToast, sessionId, stop])

  useEffect(() => {
    if (!enabled) stop()
    return () => stop()
  }, [enabled, stop])

  return { active, level, error, start, stop }
}
