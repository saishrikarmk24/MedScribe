import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkServerHealth,
  fetchBeaconServerUrl,
  getServerBaseUrl,
  subscribeServerUrl,
} from '@/services/serverConfig'

export interface ServerStatusState {
  isOnline: boolean
  isChecking: boolean
  lastCheckedAt: number | null
  lastError: string | null
  serverUrl: string
  retryCountdown: number
}

const CHECK_INTERVAL_SEC = 5

export function useServerStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const [isChecking, setIsChecking] = useState<boolean>(false)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [serverUrl, setServerUrlState] = useState<string>(getServerBaseUrl())
  const [retryCountdown, setRetryCountdown] = useState<number>(CHECK_INTERVAL_SEC)

  const inFlightRef = useRef<boolean>(false)

  const performCheck = useCallback(async (targetUrl?: string) => {
    if (inFlightRef.current) return isOnline
    inFlightRef.current = true
    setIsChecking(true)

    try {
      // If deployed on Vercel and no manual targetUrl is specified, always sync latest beacon
      const isVercel = typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
      if (isVercel && !targetUrl) {
        const beaconUrl = await fetchBeaconServerUrl(true)
        if (beaconUrl) {
          setServerUrlState(beaconUrl)
        }
      }

      let activeUrl = targetUrl || getServerBaseUrl()
      let res = await checkServerHealth(activeUrl, 6000)

      // If activeUrl is failing, refresh from beacon
      if (!res.ok) {
        const discovered = await fetchBeaconServerUrl(true)
        if (discovered && discovered !== activeUrl) {
          activeUrl = discovered
          setServerUrlState(discovered)
          res = await checkServerHealth(discovered, 6000)
        }
      }

      setIsOnline(res.ok)
      setLastError(res.ok ? null : res.error ?? 'Server unreachable')
      setLastCheckedAt(Date.now())
      setRetryCountdown(CHECK_INTERVAL_SEC)
      return res.ok
    } finally {
      setIsChecking(false)
      inFlightRef.current = false
    }
  }, [isOnline])

  // Listen for server URL changes from beacon or manual entry
  useEffect(() => {
    const unsub = subscribeServerUrl((newUrl) => {
      setServerUrlState(newUrl)
    })
    return unsub
  }, [])

  // Initial check on mount
  useEffect(() => {
    void performCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Periodic heartbeat poll & countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          void performCheck()
          return CHECK_INTERVAL_SEC
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [performCheck])

  return {
    isOnline,
    isChecking,
    lastCheckedAt,
    lastError,
    serverUrl,
    retryCountdown,
    checkNow: performCheck,
  }
}
