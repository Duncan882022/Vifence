/**
 * Chọn đường phát cho tile camera: WHEP (WebRTC) trước, LL-HLS dự phòng.
 *
 * WHEP cho độ trễ ~200–500ms nên bbox bám video gần như tức thời. Nhưng WebRTC
 * cần UDP, hay bị firewall văn phòng chặn — nên phải tự rơi về HLS thay vì để
 * tile đen. Một khi đã rơi về HLS thì giữ nguyên, không thử lại WHEP giữa phiên
 * xem để tránh video giật khi chuyển qua lại.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { startWhepSubscriber, type WhepSubscriber } from '@/services/webrtc/whepClient'
import { useHlsVideoSource, type VideoClockSource } from './useHlsVideoSource'

export type VideoSourceMode = 'whep' | 'hls'

export interface LowLatencyVideoSource {
  mode: VideoSourceMode
  clock: VideoClockSource
  /** WHEP đã kết nối được hay chưa — dùng cho badge độ trễ trên toolbar. */
  whepConnected: boolean
}

export function useLowLatencyVideoSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  options: {
    whepUrl?: string
    hlsSrc: string
    playing: boolean
  },
): LowLatencyVideoSource {
  const { whepUrl, hlsSrc, playing } = options

  const [mode, setMode] = useState<VideoSourceMode>(whepUrl ? 'whep' : 'hls')
  const [whepConnected, setWhepConnected] = useState(false)
  const subscriberRef = useRef<WhepSubscriber | null>(null)

  // Đổi camera / endpoint → thử lại WHEP từ đầu.
  useEffect(() => {
    setMode(whepUrl ? 'whep' : 'hls')
    setWhepConnected(false)
  }, [whepUrl])

  useEffect(() => {
    if (!whepUrl || mode !== 'whep' || !playing) return

    let cancelled = false

    const connect = async () => {
      try {
        const subscriber = await startWhepSubscriber({
          endpoint: whepUrl,
          onTrack: stream => {
            const video = videoRef.current
            if (!video || cancelled) return
            video.srcObject = stream
            video.muted = true
            void video.play().catch(() => {})
          },
          onStateChange: state => {
            if (cancelled) return
            if (state === 'connected') setWhepConnected(true)
            if (state === 'failed') {
              setWhepConnected(false)
              setMode('hls')
            }
          },
        })
        if (cancelled) {
          void subscriber.stop()
          return
        }
        subscriberRef.current = subscriber
      } catch {
        if (!cancelled) setMode('hls')
      }
    }

    void connect()

    return () => {
      cancelled = true
      const video = videoRef.current
      if (video?.srcObject) video.srcObject = null
      void subscriberRef.current?.stop()
      subscriberRef.current = null
    }
  }, [whepUrl, mode, playing, videoRef])

  // WHEP có thể báo connected nhưng không nhận frame (UDP/firewall) → fallback HLS.
  useEffect(() => {
    if (mode !== 'whep' || !whepConnected || !playing) return

    const timer = window.setTimeout(() => {
      const video = videoRef.current
      if (!video || video.videoWidth > 0) return
      if (video.srcObject) video.srcObject = null
      setWhepConnected(false)
      setMode('hls')
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [mode, whepConnected, playing, videoRef])

  // Hook HLS luôn được gọi (quy tắc hooks); src rỗng khi đang dùng WHEP.
  const hlsClock = useHlsVideoSource(videoRef, mode === 'hls' ? hlsSrc : '', playing)

  return useMemo(() => ({
    mode,
    whepConnected,
    clock: mode === 'hls'
      ? hlsClock
      // WebRTC không có PDT; độ trễ đủ thấp để dùng snapshot mới nhất.
      : { getDisplayWallclockMs: () => null },
  }), [mode, whepConnected, hlsClock])
}
