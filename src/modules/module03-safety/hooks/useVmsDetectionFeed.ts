import { useEffect, useRef, useState } from 'react'
import type { MobileAiConnectionStatus } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  createVmsDetectionPoller,
  getVmsBackendUrl,
  isVmsLiveCamera,
  type VmsDetectionSnapshot,
} from '../services/vmsDetections.service'
import type { VmsDetectionFeed } from '../context/VmsDetectionContext'

export function useVmsDetectionFeed(cameraId: string, enabled: boolean): VmsDetectionFeed {
  const pollerRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [snapshot, setSnapshot] = useState<VmsDetectionSnapshot | null>(null)

  const active = enabled && isVmsLiveCamera(cameraId)

  useEffect(() => {
    if (!active) {
      pollerRef.current?.stop()
      pollerRef.current = null
      setSnapshot(null)
      setStatus('idle')
      setStatusMsg(undefined)
      return
    }

    pollerRef.current?.stop()
    pollerRef.current = createVmsDetectionPoller({
      cameraId,
      backendUrl: getVmsBackendUrl(),
      onSnapshot: setSnapshot,
      onStatusChange: (next, msg) => {
        setStatus(next)
        setStatusMsg(msg)
      },
    })

    return () => {
      pollerRef.current?.stop()
      pollerRef.current = null
    }
  }, [active, cameraId])

  return { active, status, statusMsg, snapshot }
}
