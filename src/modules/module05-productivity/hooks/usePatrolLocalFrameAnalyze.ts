import { useEffect, useState, type RefObject } from 'react'
import {
  createMobileAiAnalyzeClient,
  getMobileAiBackendUrl,
  type MobileAiDetection,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { getLastDeviceHeading } from '@/modules/module02-training/services/deviceHeading.service'
import { getPatrolHelmetGps } from '@/services/patrolHelmetGpsBridge'
import { isPatrolHelmetCameraId } from '../data/patrolHelmetScope'
import { getPatrolPersonRoiEngine } from '../personRoi'
import { syncLivePatrolPersonDetectionsToHeatmap } from '../utils/patrolHeatmapLiveSync'
import { patrolPersonMeetsDisplayGate } from '../utils/patrolPersonVisibility'

/**
 * Nhịp gửi khung — thưa hơn trang Phát sóng vì máy này còn đang tải luồng WHIP lên.
 */
const LOCAL_ANALYZE_INTERVAL_MS = 90

export interface PatrolLocalFrameSize {
  width: number
  height: number
}

function gatePatrolPersons(
  detections: MobileAiDetection[],
  frameW: number,
  frameH: number,
): MobileAiDetection[] {
  if (frameW <= 0 || frameH <= 0) return []
  return detections.filter(d => {
    if (d.behavior !== 'person') return true
    const box = d.subject_bbox?.length === 4 ? d.subject_bbox : d.bbox
    if (!box || box.length < 4) return false
    return patrolPersonMeetsDisplayGate({
      bbox: [box[0], box[1], box[2], box[3]],
      frameW,
      frameH,
      workerId: d.worker_id,
    })
  })
}

/**
 * @deprecated Thay bằng `usePatrolOnDeviceRoi` — COCO-SSD on-device + server identity.
 *
 * Luồng cũ: chụp JPEG gửi `/analyze/frame` để bbox khớp khung video.
 * Sự kiện/KPI vẫn do worker VMS — hook này chỉ nuôi ROI overlay.
 */
export function usePatrolLocalFrameAnalyze(
  cameraId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): PatrolLocalFrameSize {
  const [frameSize, setFrameSize] = useState<PatrolLocalFrameSize>({ width: 0, height: 0 })

  useEffect(() => {
    const video = videoRef.current
    const backendUrl = getMobileAiBackendUrl()
    if (!enabled || !video || !backendUrl || !isPatrolHelmetCameraId(cameraId)) return

    // Worker VMS trả bbox theo khung 720×1280, còn ở đây là khung JPEG đã thu
    // nhỏ — giữ lại track cũ thì chúng bị vẽ sai tỉ lệ cho tới lúc hết hạn.
    const engine = getPatrolPersonRoiEngine(cameraId)
    engine.clear()

    const client = createMobileAiAnalyzeClient(video, {
      cameraId,
      backendUrl,
      intervalMs: LOCAL_ANALYZE_INTERVAL_MS,
      getGps: () => {
        const snap = getPatrolHelmetGps(cameraId)
        return snap ? { lat: snap.lat, lng: snap.lng } : null
      },
      getHeading: () => getLastDeviceHeading(),
      onResult: result => {
        const width = result.width > 0 ? result.width : video.videoWidth
        const height = result.height > 0 ? result.height : video.videoHeight
        setFrameSize(prev =>
          prev.width === width && prev.height === height ? prev : { width, height },
        )
        syncLivePatrolPersonDetectionsToHeatmap(
          cameraId,
          gatePatrolPersons(result.detections, width, height),
        )
      },
      onStatusChange: () => {
        // Trạng thái backend đã hiển thị ở toolbar camera.
      },
    })

    return () => {
      client.stop()
      engine.clear()
      setFrameSize({ width: 0, height: 0 })
    }
  }, [cameraId, enabled, videoRef])

  return frameSize
}
