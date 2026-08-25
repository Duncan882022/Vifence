import { useEffect, useRef, useState } from 'react'
import type { MobileAiConnectionStatus } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  createDetectionsFeed,
  type DetectionsTransport,
} from '../services/detectionsSocket.service'
import {
  getVmsBackendUrl,
  isVmsLiveCamera,
  type VmsDetectionSnapshot,
} from '../services/vmsDetections.service'
import type { VmsDetectionFeed } from '../context/VmsDetectionContext'

export function useVmsDetectionFeed(cameraId: string, enabled: boolean): VmsDetectionFeed {
  const feedRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [snapshot, setSnapshot] = useState<VmsDetectionSnapshot | null>(null)
  const [transport, setTransport] = useState<DetectionsTransport>('polling')

  const active = enabled && isVmsLiveCamera(cameraId)

  useEffect(() => {
    if (!active) {
      feedRef.current?.stop()
      feedRef.current = null
      setSnapshot(null)
      setStatus('idle')
      setStatusMsg(undefined)
      return
    }

    feedRef.current?.stop()
    feedRef.current = createDetectionsFeed({
      cameraId,
      backendUrl: getVmsBackendUrl(),
      onSnapshot: setSnapshot,
      onStatusChange: (next, msg) => {
        setStatus(next)
        setStatusMsg(msg)
      },
      onTransportChange: setTransport,
    })

    return () => {
      feedRef.current?.stop()
      feedRef.current = null
    }
  }, [active, cameraId])

  return { active, status, statusMsg, snapshot, transport }
}
