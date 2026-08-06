import { useEffect, useState, type RefObject } from 'react'

/**
 * Đếm tick khi kích thước video đổi (loadedmetadata/resize) — dùng làm key
 * remount cho các DetectionBox overlay để chúng tính lại vị trí map lên video.
 */
export function useOverlayLayoutTick(videoRef: RefObject<HTMLVideoElement | null>): number {
  const [layoutTick, setLayoutTick] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const bump = () => setLayoutTick(v => v + 1)
    video.addEventListener('loadedmetadata', bump)
    video.addEventListener('resize', bump)
    window.addEventListener('resize', bump)
    return () => {
      video.removeEventListener('loadedmetadata', bump)
      video.removeEventListener('resize', bump)
      window.removeEventListener('resize', bump)
    }
  }, [videoRef, layoutTick])

  return layoutTick
}
