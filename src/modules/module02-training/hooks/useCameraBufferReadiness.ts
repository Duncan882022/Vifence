/**
 * Đo mức đệm của từng tile và báo về cửa chờ overlay.
 *
 * `video.buffered` là quãng đã tải sẵn phía trước điểm đang phát — chính là độ
 * trễ giữa khung hình người xem thấy và khung hình camera vừa gửi lên. Đo được
 * con số này thì không phải đoán độ trễ bằng hằng số nữa.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import {
  clearCameraBufferState,
  getOverlayBufferGate,
  reportCameraBufferState,
  subscribeOverlayBufferGate,
  type OverlayBufferGate,
} from '@/services/cameraBufferReadiness'

/** Nhịp đo — đệm thay đổi theo phân đoạn (~1–2s) nên không cần dày hơn. */
const SAMPLE_INTERVAL_MS = 400

/** Quãng đã đệm sẵn phía trước điểm đang phát (ms). */
export function readBufferedAheadMs(video: HTMLVideoElement): number {
  const ranges = video.buffered
  if (!ranges || ranges.length === 0) return 0
  const playhead = video.currentTime

  for (let i = ranges.length - 1; i >= 0; i -= 1) {
    const start = ranges.start(i)
    const end = ranges.end(i)
    // Ngay sau khi seek, playhead có thể nằm sát mép quãng — nới một chút để
    // không bỏ sót quãng đang phát và báo nhầm là chưa đệm gì.
    if (start <= playhead + 0.05 && end >= playhead) {
      return Math.max(0, (end - playhead) * 1000)
    }
  }
  return 0
}

export interface CameraBufferReadinessOptions {
  playing: boolean
  /** Luồng có phải chờ đệm không — WHEP độ trễ thấp đặt false. */
  needsBuffer: boolean
}

/** Báo mức đệm của tile này lên cửa chờ overlay trong suốt vòng đời tile. */
export function useCameraBufferReadiness(
  videoRef: RefObject<HTMLVideoElement | null>,
  cameraId: string,
  { playing, needsBuffer }: CameraBufferReadinessOptions,
): void {
  useEffect(() => {
    if (!cameraId || !playing) {
      clearCameraBufferState(cameraId)
      return
    }

    const sample = () => {
      const video = videoRef.current
      if (!video) return
      reportCameraBufferState(cameraId, {
        bufferedAheadMs: readBufferedAheadMs(video),
        needsBuffer,
      })
    }

    sample()
    const timer = window.setInterval(sample, SAMPLE_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
      clearCameraBufferState(cameraId)
    }
  }, [videoRef, cameraId, playing, needsBuffer])
}

/** Trạng thái cửa chờ — dùng để ẩn overlay và hiện chỉ báo đang đồng bộ. */
export function useOverlayBufferGate(): OverlayBufferGate {
  const subscribe = useCallback(
    (listener: () => void) => subscribeOverlayBufferGate(listener),
    [],
  )
  return useSyncExternalStore(subscribe, getOverlayBufferGate, getOverlayBufferGate)
}
