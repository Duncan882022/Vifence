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
import { patrolPersonMeetsDetectionGate } from '../utils/patrolPersonVisibility'

/**
 * Nhịp gửi khung — thưa hơn trang Phát sóng vì máy này còn đang tải luồng WHIP lên.
 */
const LOCAL_ANALYZE_INTERVAL_MS = 280

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
    if (!d.bbox || d.bbox.length < 4) return false
    return patrolPersonMeetsDetectionGate({
      bbox: [d.bbox[0], d.bbox[1], d.bbox[2], d.bbox[3]],
      frameW,
      frameH,
      workerId: d.worker_id,
    })
  })
}

/**
 * ROI cho mũ đang phát từ chính máy đang mở CMS.
 *
 * Tile lúc đó hiển thị camera thời gian thực, còn detections của worker VMS phải
 * đi vòng WHIP → MediaMTX → RTSP → AI nên mô tả khung hình của hơn một giây
 * trước. Mũ vừa quay là bbox rơi ra ngoài người. Chụp thẳng khung đang hiển thị
 * gửi `/analyze/frame` thì bbox chắc chắn thuộc đúng khung đó.
 *
 * Sự kiện, KPI và ghi hình vẫn do worker VMS lo — hook này chỉ nuôi ROI overlay.
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
