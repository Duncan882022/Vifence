/**
 * Chọn đường phát cho tile camera: WHEP (WebRTC) trước, LL-HLS dự phòng.
 *
 * WHEP cho độ trễ ~200–500ms nên bbox bám video gần như tức thời. Nhưng WebRTC
 * cần UDP, hay bị firewall văn phòng chặn — nên phải tự rơi về HLS thay vì để
 * tile đen. Một khi đã rơi về HLS thì giữ nguyên, không thử lại WHEP giữa phiên
 * xem để tránh video giật khi chuyển qua lại — trừ khi user gọi recoverStream().
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { startWhepSubscriber, type WhepSubscriber } from '@/services/webrtc/whepClient'
import { useHlsVideoSource, type VideoClockSource } from './useHlsVideoSource'
import { WHEP_DISPLAY_WALLCLOCK_LAG_MS } from '@/modules/module05-productivity/data/patrolHelmetScope'
import {
  createPlaybackStallChecker,
  PLAYBACK_STALL_CHECK_MS,
  WHEP_DISCONNECTED_RECOVER_MS,
  WHEP_NO_FRAME_RECOVER_MS,
  WHEP_RECONNECT_BEFORE_HLS,
  watchVideoFrameAdvance,
} from './videoPlaybackStall'

const WHEP_NO_FRAME_FALLBACK_MS = 2500

/** Wallclock ước lượng khung WHEP — backend cần at_ms để trả overlay_sync aligned. */
export function getWhepDisplayWallclockMs(nowMs: number = Date.now()): number {
  return nowMs - WHEP_DISPLAY_WALLCLOCK_LAG_MS
}

const whepVideoClock: VideoClockSource = {
  getDisplayWallclockMs: () => getWhepDisplayWallclockMs(),
}

export type VideoSourceMode = 'whep' | 'hls'

export interface LowLatencyVideoSource {
  mode: VideoSourceMode
  clock: VideoClockSource
  /** WHEP đã kết nối được hay chưa — dùng cho badge độ trễ trên toolbar. */
  whepConnected: boolean
  /** Làm mới luồng — reconnect WHEP hoặc gắn lại HLS. */
  recoverStream: () => void
}

export function useLowLatencyVideoSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  options: {
    whepUrl?: string
    hlsSrc: string
    hlsFallbackSrc?: string
    playing: boolean
  },
): LowLatencyVideoSource {
  const { whepUrl, hlsSrc, hlsFallbackSrc, playing } = options

  const [mode, setMode] = useState<VideoSourceMode>(whepUrl ? 'whep' : 'hls')
  const [whepConnected, setWhepConnected] = useState(false)
  const [whepSession, setWhepSession] = useState(0)
  const subscriberRef = useRef<WhepSubscriber | null>(null)
  const whepReconnectsRef = useRef(0)
  const disconnectedAtRef = useRef(0)
  const lastFrameAtRef = useRef(0)
  const stallCheckerRef = useRef(createPlaybackStallChecker())

  const fallbackToHls = useCallback(() => {
    const video = videoRef.current
    if (video?.srcObject) video.srcObject = null
    void subscriberRef.current?.stop()
    subscriberRef.current = null
    setWhepConnected(false)
    whepReconnectsRef.current = 0
    disconnectedAtRef.current = 0
    lastFrameAtRef.current = 0
    stallCheckerRef.current.reset()
    setMode('hls')
  }, [videoRef])

  const reconnectWhep = useCallback(() => {
    const video = videoRef.current
    if (video?.srcObject) video.srcObject = null
    void subscriberRef.current?.stop()
    subscriberRef.current = null
    setWhepConnected(false)
    disconnectedAtRef.current = 0
    lastFrameAtRef.current = 0
    stallCheckerRef.current.reset()
    setWhepSession(s => s + 1)
  }, [videoRef])

  const handleWhepStall = useCallback(() => {
    whepReconnectsRef.current += 1
    if (whepReconnectsRef.current > WHEP_RECONNECT_BEFORE_HLS) {
      fallbackToHls()
      return
    }
    reconnectWhep()
  }, [fallbackToHls, reconnectWhep])

  // Đổi camera / endpoint → thử lại WHEP từ đầu.
  useEffect(() => {
    setMode(whepUrl ? 'whep' : 'hls')
    setWhepConnected(false)
    whepReconnectsRef.current = 0
    disconnectedAtRef.current = 0
    lastFrameAtRef.current = 0
    stallCheckerRef.current.reset()
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
            if (state === 'connected') {
              setWhepConnected(true)
              disconnectedAtRef.current = 0
            }
            if (state === 'reconnecting') {
              if (!disconnectedAtRef.current) {
                disconnectedAtRef.current = Date.now()
              }
            }
            if (state === 'failed') {
              fallbackToHls()
            }
          },
        })
        if (cancelled) {
          void subscriber.stop()
          return
        }
        subscriberRef.current = subscriber
      } catch {
        if (!cancelled) fallbackToHls()
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
  }, [whepUrl, mode, playing, videoRef, whepSession, fallbackToHls])

  // WHEP connected nhưng không nhận frame (UDP/firewall) → fallback HLS nhanh.
  useEffect(() => {
    if (mode !== 'whep' || !whepConnected || !playing) return

    const video = videoRef.current
    if (!video) return

    let fallbackTimer = 0

    const fallbackIfNoFirstFrame = () => {
      if (video.videoWidth > 0) return
      fallbackToHls()
    }

    const onFirstFrame = () => {
      window.clearTimeout(fallbackTimer)
      lastFrameAtRef.current = performance.now()
    }

    video.addEventListener('loadeddata', onFirstFrame)
    video.addEventListener('playing', onFirstFrame)
    fallbackTimer = window.setTimeout(fallbackIfNoFirstFrame, WHEP_NO_FRAME_FALLBACK_MS)

    return () => {
      window.clearTimeout(fallbackTimer)
      video.removeEventListener('loadeddata', onFirstFrame)
      video.removeEventListener('playing', onFirstFrame)
    }
  }, [mode, whepConnected, playing, videoRef, whepSession, fallbackToHls])

  // WHEP đang phát nhưng đứng hình / disconnected quá lâu → reconnect hoặc HLS.
  useEffect(() => {
    if (mode !== 'whep' || !whepConnected || !playing) return

    const video = videoRef.current
    if (!video) return

    const unwatchFrames = watchVideoFrameAdvance(video, () => {
      lastFrameAtRef.current = performance.now()
      whepReconnectsRef.current = 0
    })

    const timer = window.setInterval(() => {
      const now = performance.now()

      if (
        disconnectedAtRef.current > 0
        && Date.now() - disconnectedAtRef.current >= WHEP_DISCONNECTED_RECOVER_MS
      ) {
        handleWhepStall()
        return
      }

      if (lastFrameAtRef.current > 0 && now - lastFrameAtRef.current >= WHEP_NO_FRAME_RECOVER_MS) {
        handleWhepStall()
        return
      }

      const stall = stallCheckerRef.current.tick(video, playing)
      if (stall === 'stall') handleWhepStall()
    }, PLAYBACK_STALL_CHECK_MS)

    return () => {
      unwatchFrames()
      window.clearInterval(timer)
    }
  }, [mode, whepConnected, playing, videoRef, whepSession, handleWhepStall])

  const hlsSource = useHlsVideoSource(
    videoRef,
    mode === 'hls' ? hlsSrc : '',
    playing,
    mode === 'hls' ? hlsFallbackSrc : undefined,
  )

  const recoverStream = useCallback(() => {
    if (whepUrl && mode === 'whep') {
      whepReconnectsRef.current = 0
      reconnectWhep()
      return
    }
    hlsSource.recover()
  }, [whepUrl, mode, reconnectWhep, hlsSource])

  return useMemo(() => ({
    mode,
    whepConnected,
    // WHEP không có PDT — ước lượng wallclock thay vì null (null → backend trả
    // overlay_sync latest → bbox lệch vài giây so với khung video ~300ms).
    clock: mode === 'hls' ? hlsSource.clock : whepVideoClock,
    recoverStream,
  }), [mode, whepConnected, hlsSource, recoverStream])
}
