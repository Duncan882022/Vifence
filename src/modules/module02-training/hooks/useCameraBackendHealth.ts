import { useCallback, useEffect, useState } from 'react'
import {
  getVmsBackendUrl,
  isVmsLiveCamera,
} from '@/modules/module03-safety/services/vmsDetections.service'
import {
  getMobileAiBackendUrl,
  pingMobileAiBackend,
} from '../services/mobileAiBackend.service'
import { useMobileAiBackendVersion } from './useMobileAiBackendVersion'

export type BackendHealthStatus = 'unconfigured' | 'checking' | 'connected' | 'disconnected'

/** Poll /health — VMS cam (A-03/A-04) dùng VMS URL, còn lại mobile AI URL. */
export function useCameraBackendHealth(cameraId?: string, pollMs = 12_000): {
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

    const resolveUrl = (): string => {
      if (cameraId && isVmsLiveCamera(cameraId)) return getVmsBackendUrl()
      return getMobileAiBackendUrl()
    }

    const tick = async () => {
      const url = resolveUrl()
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
  }, [cameraId, urlVersion, pollMs, recheckTick])

  return { status, recheck }
}
