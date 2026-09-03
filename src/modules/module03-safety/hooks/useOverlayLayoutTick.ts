import { useEffect, useState, type RefObject } from 'react'

/**
 * Đếm tick khi kích thước video đổi (loadedmetadata/resize) — dùng làm key
 * remount cho các DetectionBox overlay để chúng tính lại vị trí map lên video.
 *
 * iOS Safari (WHEP/HLS): `<video>` có thể mount sau effect đầu — poll gắn lại
 * listener cho tới khi có metadata + client box.
 */
export function useOverlayLayoutTick(videoRef: RefObject<HTMLVideoElement | null>): number {
  const [layoutTick, setLayoutTick] = useState(0)

  useEffect(() => {
    let attachedVideo: HTMLVideoElement | null = null
    let observer: ResizeObserver | null = null
    let pollId = 0
    let cancelled = false
    let lastGeometry = ''

    /**
     * Chỉ đổi số khi hình học thật sự khác.
     *
     * Vòng poll bên dưới chạy mỗi 280ms; đếm vô điều kiện thì overlay dùng tick
     * này làm key sẽ dựng lại toàn bộ hộp ~4 lần mỗi giây — mất transition, mất
     * tác dụng `memo`, và nhìn thấy rõ thành nháy khi có nhiều hộp.
     */
    const bump = () => {
      const video = videoRef.current
      if (!video) return
      const geometry = [
        video.videoWidth,
        video.videoHeight,
        Math.round(video.clientWidth),
        Math.round(video.clientHeight),
      ].join('x')
      if (geometry === lastGeometry) return
      lastGeometry = geometry
      setLayoutTick(v => v + 1)
    }

    const detach = () => {
      if (!attachedVideo) return
      attachedVideo.removeEventListener('loadedmetadata', bump)
      attachedVideo.removeEventListener('loadeddata', bump)
      attachedVideo.removeEventListener('resize', bump)
      attachedVideo.removeEventListener('playing', bump)
      observer?.disconnect()
      observer = null
      attachedVideo = null
    }

    const attach = () => {
      const video = videoRef.current
      if (!video || video === attachedVideo) return

      detach()
      attachedVideo = video
      video.addEventListener('loadedmetadata', bump)
      video.addEventListener('loadeddata', bump)
      video.addEventListener('resize', bump)
      video.addEventListener('playing', bump)
      observer = new ResizeObserver(bump)
      observer.observe(video)
      if (video.videoWidth > 0 && video.clientWidth > 0) bump()
    }

    attach()
    window.addEventListener('resize', bump)

    pollId = window.setInterval(() => {
      if (cancelled) return
      attach()
      const video = videoRef.current
      if (video && video.videoWidth > 0 && video.clientWidth > 0) bump()
    }, 280)

    return () => {
      cancelled = true
      window.clearInterval(pollId)
      window.removeEventListener('resize', bump)
      detach()
    }
  }, [videoRef])

  return layoutTick
}
