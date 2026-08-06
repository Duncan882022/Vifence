import { useEffect, type RefObject } from 'react'
import { invalidateVideoFrameCapture } from '@/modules/module02-training/utils/videoFrameCapture'

/** Xóa overlay + cache frame khi video loop / nhảy cảnh — tránh ROI “dính” frame cũ. */
export function useOverlaySceneReset(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onReset: () => void,
): void {
  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !video) return

    let lastT = video.currentTime

    const reset = () => {
      invalidateVideoFrameCapture(video)
      onReset()
    }

    const onTime = () => {
      const t = video.currentTime
      const looped = t < lastT - 0.06
      const jumped = t - lastT > 1.1
      if (looped || jumped) reset()
      lastT = t
    }

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('seeked', reset)

    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('seeked', reset)
    }
  }, [videoRef, enabled, onReset])
}
