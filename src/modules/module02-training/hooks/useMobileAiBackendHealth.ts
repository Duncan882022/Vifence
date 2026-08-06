import { useCallback, useEffect, useState } from 'react'
import {
  getMobileAiBackendUrl,
  pingMobileAiBackend,
} from '../services/mobileAiBackend.service'
import { useMobileAiBackendVersion } from './useMobileAiBackendVersion'

export type BackendHealthStatus = 'unconfigured' | 'checking' | 'connected' | 'disconnected'

/** Poll /health — cập nhật khi URL backend đổi (⚙ / localStorage / .env). */
export function useMobileAiBackendHealth(pollMs = 12_000): {
  status: BackendHealthStatus
  recheck: () => void
} {
  const urlVersion = useMobileAiBackendVersion()
  const [status, setStatus] = useState<BackendHealthStatus>('checking')
  const [recheckTick, setRecheckTick] = useState(0)

  const recheck = useCallback(() => {
    setRecheckTick(t => t + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    let timerId = 0

    const tick = async () => {
      const url = getMobileAiBackendUrl()
      if (!url) {
        if (!cancelled) setStatus('unconfigured')
        return
      }
      setStatus(prev => (prev === 'connected' ? prev : 'checking'))
      const ok = await pingMobileAiBackend(url)
      if (!cancelled) setStatus(ok ? 'connected' : 'disconnected')
    }

    void tick()
    timerId = window.setInterval(() => { void tick() }, pollMs)

    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [urlVersion, pollMs, recheckTick])

  return { status, recheck }
}
