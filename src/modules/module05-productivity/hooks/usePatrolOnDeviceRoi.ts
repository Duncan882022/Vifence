import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  detectPeopleInVideoPixels,
  preloadFaceDetection,
} from '@/modules/module02-training/services/faceDetection.service'
import { getPatrolPersonRoiEngine } from '../personRoi'
import { isPatrolPersonRoiCameraId } from '../data/patrolHelmetScope'
import { syncLivePatrolPersonDetectionsToHeatmap } from '../utils/patrolHeatmapLiveSync'
import {
  mergePatrolOnDeviceWithServerIdentity,
  type PatrolServerIdentityHint,
} from '../personRoi/patrolOnDeviceIdentityMerge'

/** ~15 FPS — nhịp overlay kiểu Hikvision bodycam. */
const ON_DEVICE_DETECT_INTERVAL_MS = 66

export interface PatrolOnDeviceFrameSize {
  width: number
  height: number
}

export interface PatrolServerFrameSize {
  width: number
  height: number
}

/**
 * ROI patrol kiểu Hikvision:
 * - COCO-SSD on-device nuôi vị trí box khớp pixel video (~15 FPS)
 * - Server YOLO chỉ gán sgc-* / tier / sự kiện (thưa hơn, qua prop serverIdentity)
 */
export function usePatrolOnDeviceRoi(
  cameraId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  serverIdentity: PatrolServerIdentityHint[],
  serverFrameSize: PatrolServerFrameSize,
): PatrolOnDeviceFrameSize {
  const [frameSize, setFrameSize] = useState<PatrolOnDeviceFrameSize>({ width: 0, height: 0 })
  const serverIdentityRef = useRef(serverIdentity)
  const serverFrameRef = useRef(serverFrameSize)
  serverIdentityRef.current = serverIdentity
  serverFrameRef.current = serverFrameSize

  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !video || !isPatrolPersonRoiCameraId(cameraId)) return

    preloadFaceDetection()
    const engine = getPatrolPersonRoiEngine(cameraId)
    engine.clear()

    let cancelled = false
    let detecting = false
    let raf = 0
    let lastRun = 0

    const runDetection = async (now: number) => {
      if (cancelled || detecting) return
      if (now - lastRun < ON_DEVICE_DETECT_INTERVAL_MS) return
      if (!video.videoWidth || video.readyState < 2) return

      lastRun = now
      detecting = true
      try {
        const boxes = await detectPeopleInVideoPixels(video)
        if (cancelled) return

        const width = video.videoWidth
        const height = video.videoHeight
        setFrameSize(prev =>
          prev.width === width && prev.height === height ? prev : { width, height },
        )

        const serverFrame = serverFrameRef.current
        const merged = mergePatrolOnDeviceWithServerIdentity(
          boxes,
          serverIdentityRef.current,
          width,
          height,
          serverFrame.width > 0 ? serverFrame.width : width,
          serverFrame.height > 0 ? serverFrame.height : height,
        )
        syncLivePatrolPersonDetectionsToHeatmap(cameraId, merged)
      } finally {
        detecting = false
      }
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      void runDetection(now)
    }

    raf = requestAnimationFrame(loop)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      engine.clear()
      setFrameSize({ width: 0, height: 0 })
    }
  }, [cameraId, enabled, videoRef])

  return frameSize
}
