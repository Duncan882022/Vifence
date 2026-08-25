/**
 * Điều phối phát sóng cho mũ: camera → WHIP → MediaMTX, GPS/IMU → WebSocket.
 *
 * Chạy trên trang phát sóng riêng, không phải trong CMS. Người đeo mũ chỉ cần
 * màn hình này: nhẹ, giữ màn sáng, tự kết nối lại khi rớt sóng công trường.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildMobileCaptureConstraints,
  isDeviceCameraSupported,
  type CameraFacing,
} from '@/modules/module02-training/services/deviceCamera.service'
import { watchDeviceGps } from '@/modules/module02-training/services/deviceGps.service'
import {
  getLastDeviceHeading,
  requestDeviceHeadingPermission,
  watchDeviceHeading,
} from '@/modules/module02-training/services/deviceHeading.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import {
  createHelmetTelemetrySender,
  type HelmetTelemetrySender,
} from '@/services/helmetTelemetrySocket'
import { setPatrolHelmetGps } from '@/services/patrolHelmetGpsBridge'
import {
  startWhipPublisher,
  EMPTY_WHIP_STATS,
  type WhipConnectionState,
  type WhipPublishStats,
  type WhipPublisher,
} from '@/services/webrtc/whipClient'
import { getHelmetWhipUrl } from '../data/helmetIngest'

export type PublisherStatus = 'idle' | 'starting' | 'live' | 'error'

export interface HelmetGpsState {
  lat: number
  lng: number
  accuracyM: number
  updatedAt: number
}

export interface HelmetPublisherState {
  status: PublisherStatus
  connection: WhipConnectionState
  errorMessage?: string
  stats: WhipPublishStats
  gps: HelmetGpsState | null
  headingDeg: number | null
  telemetryConnected: boolean
  facing: CameraFacing
  /** Số giây đã phát — hiển thị thời lượng ca. */
  elapsedSec: number
}

interface UseHelmetPublisherOptions {
  helmetId: string
  videoRef: React.RefObject<HTMLVideoElement | null>
  maxBitrateBps?: number
}

/** Chu kỳ đọc heading để gửi kèm telemetry. */
const HEADING_SAMPLE_MS = 1000
/** Tự thử phát lại sau khi WebRTC hỏng (ms). */
const RECONNECT_DELAY_MS = 3000

export function useHelmetPublisher({
  helmetId,
  videoRef,
  maxBitrateBps,
}: UseHelmetPublisherOptions) {
  const publisherRef = useRef<WhipPublisher | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const telemetryRef = useRef<HelmetTelemetrySender | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const facingRef = useRef<CameraFacing>('environment')
  const startedAtRef = useRef(0)
  const reconnectTimerRef = useRef(0)
  /** Người dùng chủ động dừng — không tự kết nối lại. */
  const manualStopRef = useRef(false)

  const [status, setStatus] = useState<PublisherStatus>('idle')
  const [connection, setConnection] = useState<WhipConnectionState>('idle')
  const [errorMessage, setErrorMessage] = useState<string>()
  const [stats, setStats] = useState<WhipPublishStats>(EMPTY_WHIP_STATS)
  const [gps, setGps] = useState<HelmetGpsState | null>(null)
  const [headingDeg, setHeadingDeg] = useState<number | null>(null)
  const [telemetryConnected, setTelemetryConnected] = useState(false)
  const [facing, setFacing] = useState<CameraFacing>('environment')
  const [elapsedSec, setElapsedSec] = useState(0)

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      // Trình duyệt từ chối — người dùng tự giữ màn sáng.
    }
  }, [])

  const teardown = useCallback(() => {
    window.clearTimeout(reconnectTimerRef.current)
    void publisherRef.current?.stop()
    publisherRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    releaseWakeLock()
  }, [releaseWakeLock, videoRef])

  const start = useCallback(async (nextFacing?: CameraFacing) => {
    const useFacing = nextFacing ?? facingRef.current
    manualStopRef.current = false

    const endpoint = getHelmetWhipUrl(helmetId)
    if (!endpoint) {
      setStatus('error')
      setErrorMessage('Chưa cấu hình MediaMTX (VITE_MEDIAMTX_HOST hoặc VITE_MEDIAMTX_WEBRTC_URL).')
      return
    }
    if (!isDeviceCameraSupported()) {
      setStatus('error')
      setErrorMessage('Trình duyệt không hỗ trợ camera thiết bị.')
      return
    }

    setStatus('starting')
    setErrorMessage(undefined)
    teardown()

    try {
      const videoConstraints = await buildMobileCaptureConstraints(helmetId, useFacing)
      const stream = await navigator.mediaDevices.getUserMedia({
        // Độ phân giải cao giữ cho AI detect chính xác; bitrate mới là thứ bị chặn.
        video: { ...videoConstraints, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.muted = true
        await video.play().catch(() => {})
      }

      publisherRef.current = await startWhipPublisher({
        endpoint,
        stream,
        maxBitrateBps,
        onStateChange: (next, message) => {
          setConnection(next)
          if (next === 'connected') {
            setStatus('live')
            setErrorMessage(undefined)
          }
          if (next === 'failed') {
            setStatus('error')
            setErrorMessage(message ?? 'Mất kết nối tới máy chủ.')
            if (!manualStopRef.current) {
              reconnectTimerRef.current = window.setTimeout(() => {
                void start(facingRef.current)
              }, RECONNECT_DELAY_MS)
            }
          }
        },
        onStats: setStats,
      })

      facingRef.current = useFacing
      setFacing(useFacing)
      startedAtRef.current = Date.now()
      void acquireWakeLock()
      void requestDeviceHeadingPermission()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không mở được camera.'
      setStatus('error')
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setErrorMessage('Cần cấp quyền camera cho trình duyệt.')
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setErrorMessage('Không tìm thấy camera trên thiết bị.')
      } else {
        setErrorMessage(msg)
      }
    }
  }, [helmetId, maxBitrateBps, teardown, videoRef, acquireWakeLock])

  const stop = useCallback(() => {
    manualStopRef.current = true
    teardown()
    setStatus('idle')
    setConnection('closed')
    setStats(EMPTY_WHIP_STATS)
    setElapsedSec(0)
  }, [teardown])

  const flipCamera = useCallback(async () => {
    const next: CameraFacing = facingRef.current === 'environment' ? 'user' : 'environment'

    // Còn publisher thì chỉ thay track — không đàm phán lại SDP, không gián đoạn.
    if (publisherRef.current && streamRef.current) {
      try {
        const constraints = await buildMobileCaptureConstraints(helmetId, next)
        const nextStream = await navigator.mediaDevices.getUserMedia({
          video: { ...constraints, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        const nextTrack = nextStream.getVideoTracks()[0]
        if (!nextTrack) return

        await publisherRef.current.replaceVideoTrack(nextTrack)
        streamRef.current.getVideoTracks().forEach(t => t.stop())
        streamRef.current = nextStream

        const video = videoRef.current
        if (video) {
          video.srcObject = nextStream
          void video.play().catch(() => {})
        }
        facingRef.current = next
        setFacing(next)
        return
      } catch {
        // Thay track hỏng — khởi động lại toàn bộ.
      }
    }

    await start(next)
  }, [helmetId, start, videoRef])

  /* Telemetry — chạy độc lập với video, giữ vị trí ngay cả khi video rớt. */
  useEffect(() => {
    const backendUrl = getVmsBackendUrl()
    if (!backendUrl) return

    const sender = createHelmetTelemetrySender({
      cameraId: helmetId,
      backendUrl,
      onStateChange: setTelemetryConnected,
    })
    telemetryRef.current = sender

    return () => {
      sender.stop()
      telemetryRef.current = null
    }
  }, [helmetId])

  useEffect(() => {
    return watchDeviceGps(reading => {
      const next: HelmetGpsState = {
        lat: reading.lat,
        lng: reading.lng,
        accuracyM: reading.accuracyM,
        updatedAt: reading.updatedAt,
      }
      setGps(next)
      // Bridge cùng tab — bản đồ trong CMS trên chính máy này vẫn cập nhật.
      setPatrolHelmetGps({ cameraId: helmetId, ...next })
      telemetryRef.current?.send({
        lat: next.lat,
        lng: next.lng,
        accuracyM: next.accuracyM,
        heading: getLastDeviceHeading(),
        wallclockMs: next.updatedAt,
      })
    })
  }, [helmetId])

  useEffect(() => {
    const unwatch = watchDeviceHeading()
    const timer = window.setInterval(() => {
      setHeadingDeg(getLastDeviceHeading())
    }, HEADING_SAMPLE_MS)
    return () => {
      unwatch()
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (status !== 'live') return
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [status])

  /* Màn hình khoá rồi mở lại → xin lại wake lock. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && status === 'live') {
        void acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [status, acquireWakeLock])

  useEffect(() => teardown, [teardown])

  const state: HelmetPublisherState = {
    status,
    connection,
    errorMessage,
    stats,
    gps,
    headingDeg,
    telemetryConnected,
    facing,
    elapsedSec,
  }

  return { state, start, stop, flipCamera }
}
