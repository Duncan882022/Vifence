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
import { clearVmsDetectionOverlayFrame } from '../utils/liveOverlaySync'
import type { VmsDetectionFeed } from '../context/VmsDetectionContext'
import { isPatrolMetricsCameraId } from '@/modules/module05-productivity/data/patrolHelmetScope'

/** HC-* / DR-* — poll nhanh hơn demo cam để ROI bám chuyển động. */
const PATROL_VMS_DETECTIONS_POLL_MS = 280
const DEFAULT_VMS_DETECTIONS_POLL_MS = 450

export interface VmsDetectionFeedOptions {
  /**
   * Wallclock (ms) khung hình tile đang chiếu. Truyền vào thì backend chọn lại
   * overlay của đúng khung đó, nên bbox bám người thay vì chạy trước video.
   */
  getDisplayWallclockMs?: () => number | null
}

export function useVmsDetectionFeed(
  cameraId: string,
  enabled: boolean,
  options?: VmsDetectionFeedOptions,
): VmsDetectionFeed {
  const feedRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [snapshot, setSnapshot] = useState<VmsDetectionSnapshot | null>(null)
  const [transport, setTransport] = useState<DetectionsTransport>('polling')

  const active = enabled && isVmsLiveCamera(cameraId)

  // Đồng hồ đổi identity mỗi lần render; giữ trong ref để không dựng lại
  // WebSocket detections sau mỗi render của tile.
  const clockRef = useRef(options?.getDisplayWallclockMs)
  clockRef.current = options?.getDisplayWallclockMs

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
      pollIntervalMs: isPatrolMetricsCameraId(cameraId)
        ? PATROL_VMS_DETECTIONS_POLL_MS
        : DEFAULT_VMS_DETECTIONS_POLL_MS,
      onBeforeSnapshot: () => clearVmsDetectionOverlayFrame(cameraId),
      getDisplayWallclockMs: () => clockRef.current?.() ?? null,
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
