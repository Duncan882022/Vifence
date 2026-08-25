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

/** MediaMTX LL-HLS — backend VMS relay dùng HLS thường (không EXT-X-PART). */
function isLowLatencyHlsUrl(url: string): boolean {
  return url.includes('/mediamtx/hls/')
}

/** Safari phát HLS native — getStartDate() cho mốc PDT của đầu luồng. */
function nativeStartDateMs(video: HTMLVideoElement): number | null {
  const withStartDate = video as HTMLVideoElement & { getStartDate?: () => Date }
  if (typeof withStartDate.getStartDate !== 'function') return null
  const start = withStartDate.getStartDate()
  const ms = start?.getTime?.()
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null
}

function tryPlayVideo(video: HTMLVideoElement): void {
  video.muted = true
  video.defaultMuted = true
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  void video.play().catch(() => {})
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
      if (playing) tryPlayVideo(video)
    }

    const attachHls = async () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = activeSrc
        video.load()
        const onNativeCanPlay = () => {
          if (destroyed || !playing) return
          tryPlayVideo(video)
        }
        const onNativeError = () => {
          if (destroyed) return
          if (switchToFallback()) return
          video.removeEventListener('error', onNativeError)
        }
        video.addEventListener('canplay', onNativeCanPlay)
        video.addEventListener('error', onNativeError)
        return () => {
          video.removeEventListener('canplay', onNativeCanPlay)
          video.removeEventListener('error', onNativeError)
        }
      }

      try {
        const { default: Hls } = await import('hls.js')
        if (destroyed || !Hls.isSupported()) {
          attachMp4()
          return
        }
        const llHls = isLowLatencyHlsUrl(activeSrc)
        const hls = new Hls({
          enableWorker: true,
          // Backend VMS relay = HLS thường — lowLatencyMode gây màn đen trên Chrome.
          lowLatencyMode: llHls,
          liveSyncDurationCount: llHls ? 1 : 3,
          liveMaxLatencyDurationCount: llHls ? 3 : 6,
          maxLiveSyncPlaybackRate: 1.5,
          maxBufferLength: llHls ? 4 : 10,
          backBufferLength: 0,
          manifestLoadingMaxRetry: 12,
          manifestLoadingRetryDelay: 1000,
          levelLoadingMaxRetry: 8,
          fragLoadingMaxRetry: 10,
          fragLoadingRetryDelay: 800,
        })
        hls.loadSource(activeSrc)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!destroyed && playing) tryPlayVideo(video)
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (destroyed || !data.fatal) return
          if (switchToFallback()) return
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            window.setTimeout(() => hls.startLoad(), 1000)
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
  }, [videoRef, activeSrc, isHls, switchToFallback, playing])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      tryPlayVideo(video)
    } else {
      video.pause()
    }
  }, [playing, videoRef, activeSrc])

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
