import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** Trình phát cần đọc được wallclock khung hình đang hiển thị để đồng bộ overlay. */
export interface VideoClockSource {
  /**
   * Wallclock (ms) của khung hình đang phát, lấy từ EXT-X-PROGRAM-DATE-TIME.
   * Trả null khi playlist không có PDT (backend cũ) — caller rơi về snapshot mới nhất.
   */
  getDisplayWallclockMs: () => number | null
}

interface HlsInstance {
  destroy: () => void
  startLoad: () => void
  recoverMediaError: () => void
  playingDate: Date | null
}

/** Safari phát HLS native — getStartDate() cho mốc PDT của đầu luồng. */
function nativeStartDateMs(video: HTMLVideoElement): number | null {
  const withStartDate = video as HTMLVideoElement & { getStartDate?: () => Date }
  if (typeof withStartDate.getStartDate !== 'function') return null
  const start = withStartDate.getStartDate()
  const ms = start?.getTime?.()
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null
}

/** Gắn HLS (.m3u8) hoặc MP4 thuần vào <video>. Safari native HLS; Chrome dùng hls.js. */
export function useHlsVideoSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  src: string,
  playing: boolean,
  fallbackSrc?: string,
): VideoClockSource {
  const [activeSrc, setActiveSrc] = useState(src)
  const primaryRef = useRef(src)
  const fallbackRef = useRef(fallbackSrc)
  const usedFallbackRef = useRef(false)

  useEffect(() => {
    primaryRef.current = src
    fallbackRef.current = fallbackSrc
    usedFallbackRef.current = false
    setActiveSrc(src)
  }, [src, fallbackSrc])

  const isHls = activeSrc.includes('.m3u8')
  const hlsRef = useRef<HlsInstance | null>(null)

  const switchToFallback = useCallback(() => {
    const fb = fallbackRef.current
    if (!fb || usedFallbackRef.current || fb === primaryRef.current) return false
    usedFallbackRef.current = true
    setActiveSrc(fb)
    return true
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeSrc) return

    let destroyed = false

    const attachMp4 = () => {
      video.src = activeSrc
      video.load()
    }

    const attachHls = async () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = activeSrc
        video.load()
        const onNativeError = () => {
          if (destroyed) return
          if (switchToFallback()) return
          video.removeEventListener('error', onNativeError)
        }
        video.addEventListener('error', onNativeError)
        return () => video.removeEventListener('error', onNativeError)
      }

      try {
        const { default: Hls } = await import('hls.js')
        if (destroyed || !Hls.isSupported()) {
          attachMp4()
          return
        }
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
          maxLiveSyncPlaybackRate: 1.5,
          maxBufferLength: 4,
          backBufferLength: 0,
          manifestLoadingMaxRetry: 8,
          manifestLoadingRetryDelay: 800,
          levelLoadingMaxRetry: 6,
          fragLoadingMaxRetry: 8,
          fragLoadingRetryDelay: 600,
        })
        hls.loadSource(activeSrc)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (destroyed || !data.fatal) return
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (switchToFallback()) return
            window.setTimeout(() => hls.startLoad(), 800)
            return
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()
          }
        })
        hlsRef.current = hls as unknown as HlsInstance
      } catch {
        if (switchToFallback()) return
        attachMp4()
      }
    }

    let cleanupNative: (() => void) | undefined
    void (async () => {
      if (isHls) {
        cleanupNative = await attachHls() ?? undefined
      } else {
        attachMp4()
      }
    })()

    return () => {
      destroyed = true
      cleanupNative?.()
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [videoRef, activeSrc, isHls, switchToFallback])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!playing) {
      video.pause()
    }
  }, [playing, videoRef])

  const getDisplayWallclockMs = useCallback((): number | null => {
    if (!isHls) return null

    const playingDate = hlsRef.current?.playingDate
    if (playingDate) {
      const ms = playingDate.getTime()
      if (Number.isFinite(ms)) return ms
    }

    const video = videoRef.current
    if (!video) return null
    const startMs = nativeStartDateMs(video)
    if (startMs === null) return null
    return startMs + video.currentTime * 1000
  }, [isHls, videoRef])

  return { getDisplayWallclockMs }
}

export function isHlsStreamUrl(src: string): boolean {
  return src.includes('.m3u8')
}
