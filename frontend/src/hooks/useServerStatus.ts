import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkServerHealth,
  fetchBeaconServerUrl,
  getServerBaseUrl,
  isLocalDemoHost,
  serverIsBusy,
  setServerBaseUrl,
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

const CHECK_INTERVAL_SEC = 8
const FAILURES_BEFORE_OFFLINE = 3

export function useServerStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const [isChecking, setIsChecking] = useState<boolean>(false)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [serverUrl, setServerUrlState] = useState<string>(getServerBaseUrl())
  const [retryCountdown, setRetryCountdown] = useState<number>(CHECK_INTERVAL_SEC)

  const inFlightRef = useRef<boolean>(false)
  const failuresRef = useRef(0)

  const performCheck = useCallback(async (targetUrl?: string, force = false) => {
    if (inFlightRef.current) return failuresRef.current < FAILURES_BEFORE_OFFLINE
    // A piece upload or the note request already owns the tunnel. One dropped
    // health check in that window is not the server going away.
    if (!force && !targetUrl && serverIsBusy()) {
      setRetryCountdown(CHECK_INTERVAL_SEC)
      return true
    }
    inFlightRef.current = true
    setIsChecking(true)

    try {
      const localDemo = typeof window !== 'undefined' && isLocalDemoHost()
      // The hosted site has no backend of its own, so it may follow a healthy Kaggle tunnel.
      // A local demo must not: a failed health check used to replace localhost with a dead tunnel.
      const isVercel = typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
      if (isVercel && !targetUrl && !localDemo) {
        const beaconUrl = await fetchBeaconServerUrl()
        if (beaconUrl) {
          const beaconHealth = await checkServerHealth(beaconUrl, 12000)
          if (beaconHealth.ok) {
            setServerBaseUrl(beaconUrl)
            setServerUrlState(beaconUrl)
          }
        }
      }

      let activeUrl = targetUrl || getServerBaseUrl()
      let res = await checkServerHealth(activeUrl, 12000)

      if (!res.ok && !localDemo) {
        const discovered = await fetchBeaconServerUrl()
        if (discovered && discovered !== activeUrl) {
          const discoveredHealth = await checkServerHealth(discovered, 12000)
          if (discoveredHealth.ok) {
            activeUrl = discovered
            setServerBaseUrl(discovered)
            setServerUrlState(discovered)
            res = discoveredHealth
          }
        }
      }

      if (res.ok) {
        failuresRef.current = 0
        setIsOnline(true)
        setLastError(null)
      } else {
        failuresRef.current += 1
        setLastError(res.error ?? 'Server unreachable')
        setIsOnline(failuresRef.current < FAILURES_BEFORE_OFFLINE)
      }
      setLastCheckedAt(Date.now())
      setRetryCountdown(CHECK_INTERVAL_SEC)
      return res.ok
    } finally {
      setIsChecking(false)
      inFlightRef.current = false
    }
  }, [])

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
    checkNow: () => performCheck(undefined, true),
  }
}
