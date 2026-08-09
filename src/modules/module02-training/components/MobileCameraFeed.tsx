import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  buildMobileCaptureConstraints,
  isDeviceCameraSupported,
  isHandheldDevice,
  type CameraFacing,
} from '../services/deviceCamera.service'
import {
  createMobileAiAnalyzeClient,
  getMobileAiBackendUrl,
  MOBILE_AI_BACKEND_STORAGE_KEY,
  type MobileAiAnalyzeResult,
  type MobileAiDetection,
} from '../services/mobileAiBackend.service'
import { MobileAiOverlay } from './MobileAiOverlay'
import { isMobileSmokingFireCamera } from '../data/cameraAiRuntime'
import { useCameraAiEnabledModels } from '../hooks/useCameraAiConfig'
import { useCameraBboxVisible } from './CameraBboxToggle'

type MobileFeedStatus = 'idle' | 'scanning' | 'live' | 'error'

interface MobileCameraFeedProps {
  cameraId: string
  label: string
  playing?: boolean
  /** Chỉ gọi getUserMedia khi true — luồng mobile đang được chọn hiển thị chính */
  autoStartCapture?: boolean
  compact?: boolean
  aiEnabled?: boolean
}

export function MobileCameraFeed({
  cameraId,
  label,
  playing = true,
  autoStartCapture = false,
  compact,
  aiEnabled = false,
}: MobileCameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const aiClientRef = useRef<{ stop: () => void } | null>(null)
  const detectionHoldRef = useRef<{ until: number; items: MobileAiDetection[] }>({
    until: 0,
    items: [],
  })
  const [status, setStatus] = useState<MobileFeedStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string>()
  const [backendUrl, setBackendUrl] = useState(() => getMobileAiBackendUrl())
  const [detections, setDetections] = useState<MobileAiDetection[]>([])
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [layoutTick, setLayoutTick] = useState(0)
  const facingRef = useRef<CameraFacing>('environment')
  const deviceIndexRef = useRef(0)
  const [bboxVisible] = useCameraBboxVisible(cameraId)
  useCameraAiEnabledModels(cameraId)
  const mobileAiEnabled = isMobileSmokingFireCamera(cameraId)
  const showAiOverlay = aiEnabled && bboxVisible && mobileAiEnabled

  const stopAiClient = useCallback(() => {
    aiClientRef.current?.stop()
    aiClientRef.current = null
    setDetections([])
  }, [])

  const stopCapture = useCallback(() => {
    stopAiClient()
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [stopAiClient])

  const startAiClient = useCallback(() => {
    stopAiClient()
    const video = videoRef.current
    const url = getMobileAiBackendUrl()
    if (!showAiOverlay || !video || !url || status !== 'live') return

    aiClientRef.current = createMobileAiAnalyzeClient(video, {
      cameraId,
      backendUrl: url,
      onResult: (result: MobileAiAnalyzeResult) => {
        const minConf = (d: MobileAiDetection) => {
          if (d.behavior === 'fire' && d.label.startsWith('flame')) return d.confidence >= 0.58
          if (d.behavior === 'fire') return d.confidence >= 0.62
          if (d.behavior === 'smoking') return d.confidence >= 0.42
          return d.confidence >= 0.5
        }
        const filtered = result.detections.filter(minConf)
        const now = Date.now()
        if (filtered.length > 0) {
          detectionHoldRef.current = { until: now + 1800, items: filtered }
          setDetections(filtered)
        } else if (now < detectionHoldRef.current.until) {
          setDetections(detectionHoldRef.current.items)
        } else {
          setDetections([])
        }
        setFrameSize({ width: result.width, height: result.height })
      },
      onStatusChange: () => {
        // Trạng thái backend hiển thị qua toolbar ngrok trên CameraChrome.
      },
    })
  }, [showAiOverlay, cameraId, status, stopAiClient])

  const startCapture = useCallback(async (
    nextFacing?: CameraFacing,
    nextDeviceIndex?: number,
  ) => {
    const useFacing = nextFacing ?? facingRef.current
    const useDeviceIndex = nextDeviceIndex ?? deviceIndexRef.current

    if (!isDeviceCameraSupported()) {
      setStatus('error')
      setErrorMsg('Trình duyệt không hỗ trợ camera thiết bị.')
      return
    }

    setStatus('scanning')
    setErrorMsg(undefined)
    stopCapture()

    try {
      const videoConstraints = await buildMobileCaptureConstraints(
        cameraId,
        useFacing,
        isHandheldDevice() ? undefined : useDeviceIndex,
      )

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      })

      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }
      facingRef.current = useFacing
      deviceIndexRef.current = useDeviceIndex
      setStatus('live')
    } catch (err) {
      setStatus('error')
      const msg = err instanceof Error ? err.message : 'Không mở được camera.'
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setErrorMsg('Cần cấp quyền camera cho trình duyệt.')
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setErrorMsg('Không tìm thấy camera trên thiết bị.')
      } else {
        setErrorMsg(msg)
      }
    }
  }, [cameraId, stopCapture])

  useEffect(() => {
    const bump = () => setBackendUrl(getMobileAiBackendUrl())
    const onStorage = (e: StorageEvent) => {
      if (e.key === MOBILE_AI_BACKEND_STORAGE_KEY) bump()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('vifence-mobile-ai-backend-changed', bump)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('vifence-mobile-ai-backend-changed', bump)
    }
  }, [])

  useEffect(() => {
    if (!playing) {
      stopCapture()
      setStatus('idle')
      return stopCapture
    }
    if (autoStartCapture) {
      void startCapture()
    } else {
      stopCapture()
      setStatus('idle')
    }
    return stopCapture
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ restart khi playing/cameraId/autoStartCapture đổi
  }, [playing, cameraId, autoStartCapture])

  useEffect(() => {
    if (status === 'live' && showAiOverlay && backendUrl) {
      startAiClient()
    } else {
      stopAiClient()
    }
    return stopAiClient
  }, [status, showAiOverlay, backendUrl, startAiClient, stopAiClient])

  useEffect(() => {
    const video = videoRef.current
    if (!video || status !== 'live') return
    const bump = () => setLayoutTick(t => t + 1)
    const observer = new ResizeObserver(bump)
    observer.observe(video)
    video.addEventListener('loadedmetadata', bump)
    video.addEventListener('resize', bump)
    bump()
    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', bump)
      video.removeEventListener('resize', bump)
    }
  }, [status])

  if (!playing) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#0a1219] text-muted-foreground">
        <Camera className={cn(compact ? 'w-4 h-4' : 'w-6 h-6', 'opacity-50')} />
        <span className={cn('font-semibold text-white/70 truncate px-1', compact ? 'text-[6px]' : 'text-[9px]')}>
          {label}
        </span>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn(
          'absolute inset-0 h-full w-full object-contain',
          status !== 'live' && 'opacity-0',
        )}
      />

      {status === 'live' && showAiOverlay && (
        <MobileAiOverlay
          detections={detections}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          videoRef={videoRef}
          layoutTick={layoutTick}
          compact={compact}
          modelId="mobile_smoking_fire"
        />
      )}

      {status === 'scanning' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0a1219]/95">
          <Camera className={cn(compact ? 'w-5 h-5' : 'w-7 h-7', 'text-sky-400 animate-pulse')} />
          <p className={cn('text-sky-200/90 font-medium', compact ? 'text-[8px]' : 'text-[11px]')}>
            Đang quét camera…
          </p>
        </div>
      )}

      {status === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0a1219]/95 p-3">
          <Camera className={cn(compact ? 'w-5 h-5' : 'w-7 h-7', 'text-sky-400')} />
          <button
            type="button"
            onClick={() => { void startCapture() }}
            className={cn(
              'rounded font-semibold bg-sky-500/20 border border-sky-500/40 text-sky-200 hover:bg-sky-500/30 transition-colors',
              compact ? 'text-[8px] px-2 py-1' : 'text-[11px] px-3 py-1.5',
            )}
          >
            Bắt đầu ghi hình
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0a1219]/95 p-3 text-center">
          <Camera className={cn(compact ? 'w-5 h-5' : 'w-7 h-7', 'text-red-400/80')} />
          <p className={cn('text-red-300/90 font-medium', compact ? 'text-[7px]' : 'text-[10px]')}>
            {errorMsg ?? 'Không mở được camera.'}
          </p>
          <button
            type="button"
            onClick={() => { void startCapture() }}
            className={cn(
              'rounded font-semibold bg-sky-500/20 border border-sky-500/40 text-sky-200 hover:bg-sky-500/30 transition-colors',
              compact ? 'text-[8px] px-2 py-1' : 'text-[11px] px-3 py-1.5',
            )}
          >
            Thử lại
          </button>
        </div>
      )}
    </div>
  )
}
