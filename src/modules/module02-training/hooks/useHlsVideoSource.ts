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
    let hlsInstance: { destroy: () => void } | null = null

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
          backBufferLength: 30,
        })
        hls.loadSource(src)
        hls.attachMedia(video)
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
