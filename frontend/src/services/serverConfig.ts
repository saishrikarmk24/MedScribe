/**
 * Dynamic server URL resolver and health monitor.
 *
 * Allows the frontend (deployed on Vercel or running locally) to automatically
 * discover and connect to the active Kaggle Cloudflare tunnel or backend server.
 */

const STORAGE_KEY = 'voicescribe_active_server_url'
type ServerUrlListener = (url: string) => void
const listeners = new Set<ServerUrlListener>()

export function cleanUrl(raw: string): string {
  if (!raw) return ''
  const matches = raw.match(/https?:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]+/g)
  let url = matches && matches.length > 0 ? matches[matches.length - 1] : raw.trim()
  if (url.endsWith('/')) {
    url = url.slice(0, -1)
  }
  if (url.endsWith('/api')) {
    url = url.slice(0, -4)
  }
  return url
}

/**
 * Initializes and resolves the active server base URL.
 * Automatically inspects the URL query string (?server=...) on load.
 */
export function initServerUrl(): string {
  if (typeof window === 'undefined') return 'http://127.0.0.1:8000'

  try {
    const params = new URLSearchParams(window.location.search)
    const paramServer = params.get('server')
    if (paramServer) {
      const sanitized = cleanUrl(paramServer)
      localStorage.setItem(STORAGE_KEY, sanitized)
      // Clean query parameter from browser address bar without reload
      params.delete('server')
      const newQuery = params.toString() ? `?${params.toString()}` : ''
      window.history.replaceState({}, '', `${window.location.pathname}${newQuery}${window.location.hash}`)
      return sanitized
    }
  } catch (err) {
    console.warn('Could not parse server query parameter:', err)
  }

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    const cleaned = cleanUrl(stored)
    // If stored URL is not vercel self, use it
    if (!cleaned.includes('vercel.app')) {
      return cleaned
    }
  }

  const envUrl = import.meta.env.VITE_API_BASE
  if (envUrl && envUrl.startsWith('http')) {
    return cleanUrl(envUrl)
  }

  // Local development default
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://127.0.0.1:8000'
  }

  return window.location.origin
}

const BEACON_URL = 'https://ntfy.sh/voicescribe_doctor_live_beacon/raw?poll=1'

/**
 * Automatically discovers the active Kaggle Cloudflare tunnel URL from the cloud beacon.
 * Tests candidate URLs starting from newest to oldest to find the live responding host.
 */
export async function fetchBeaconServerUrl(): Promise<string | null> {
  try {
    const res = await fetch(`${BEACON_URL}&_=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    const matches = text.match(/https?:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]+/g)
    if (!matches || matches.length === 0) return null

    // Unique URLs, newest first
    const candidates = Array.from(new Set(matches.map(cleanUrl).filter(Boolean))).reverse()

    // Test each candidate quickly to find the one actively responding
    for (const candidate of candidates) {
      if (!candidate.startsWith('http')) continue
      const health = await checkServerHealth(candidate, 2200)
      if (health.ok) {
        if (candidate !== currentServerUrl) {
          setServerBaseUrl(candidate)
        }
        return candidate
      }
    }

    // If none are online right now, return the newest candidate so UI knows the target host
    if (candidates.length > 0) {
      const latest = candidates[0]
      if (latest !== currentServerUrl && !currentServerUrl.includes('trycloudflare.com')) {
        setServerBaseUrl(latest)
      }
      return latest
    }
  } catch (e) {
    console.warn('Beacon discovery failed:', e)
  }
  return null
}

let currentServerUrl = initServerUrl()

export function getServerBaseUrl(): string {
  return currentServerUrl
}

export function setServerBaseUrl(newUrl: string): void {
  const sanitized = cleanUrl(newUrl)
  if (!sanitized) return
  currentServerUrl = sanitized
  try {
    localStorage.setItem(STORAGE_KEY, sanitized)
  } catch {
    // ignore
  }
  listeners.forEach((fn) => {
    try {
      fn(sanitized)
    } catch (e) {
      console.error(e)
    }
  })
}

export function subscribeServerUrl(listener: ServerUrlListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Resolves a full REST API endpoint URL.
 */
export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const base = getServerBaseUrl()
  return `${base}/api${normalizedPath}`
}

/**
 * Resolves a full WebSocket endpoint URL.
 */
export function getWsUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const base = getServerBaseUrl()
  const isSecure = base.startsWith('https:') || (base.startsWith('//') && window.location.protocol === 'https:')
  const protocol = isSecure ? 'wss:' : 'ws:'
  const cleanBase = base.replace(/^https?:\/\//, '')
  return `${protocol}//${cleanBase}/ws${normalizedPath}`
}

/**
 * Checks server health against a given URL (or the active configured URL).
 */
export async function checkServerHealth(
  targetUrl?: string,
  timeoutMs: number = 3000
): Promise<{ ok: boolean; status?: unknown; error?: string }> {
  const base = targetUrl ? cleanUrl(targetUrl) : getServerBaseUrl()

  // Guard against checking self when running on Vercel
  if (typeof window !== 'undefined' && base === window.location.origin && window.location.origin.includes('vercel.app')) {
    return {
      ok: false,
      error: 'Connecting to Cloudflare tunnel...',
    }
  }

  const endpoint = `${base}/api/health`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        error: 'Target host is serving HTML instead of backend API. Connecting to active tunnel...',
      }
    }
    const data = await res.json()
    return { ok: true, status: data }
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const message = err instanceof Error ? err.message : 'Connection failed'
    return { ok: false, error: message }
  }
}
