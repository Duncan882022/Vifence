import { useEffect } from 'react'
import type { RefObject } from 'react'

/** Gắn HLS (.m3u8) hoặc MP4 thuần vào <video>. Safari native HLS; Chrome dùng hls.js. */
export function useHlsVideoSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  src: string,
  playing: boolean,
) {
  const isHls = src.includes('.m3u8')

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let destroyed = false
    let hlsInstance: {
      destroy: () => void
      startLoad: () => void
      recoverMediaError: () => void
    } | null = null

    const attachMp4 = () => {
      video.src = src
      video.load()
    }

    const attachHls = async () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
        video.load()
        return
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
        hls.loadSource(src)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (destroyed || !data.fatal) return
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            window.setTimeout(() => hls.startLoad(), 800)
            return
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()
          }
        })
        hlsInstance = hls
      } catch {
        attachMp4()
      }
    }

    void (isHls ? attachHls() : attachMp4())

    return () => {
      destroyed = true
      hlsInstance?.destroy()
      hlsInstance = null
    }
  }, [videoRef, src, isHls])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!playing) {
      video.pause()
    }
  }, [playing, videoRef])
}

export function isHlsStreamUrl(src: string): boolean {
  return src.includes('.m3u8')
}
