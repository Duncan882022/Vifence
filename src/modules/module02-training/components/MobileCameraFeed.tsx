import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Circle, Wifi } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  getResolvedDeviceLabel,
  isDeviceCameraSupported,
  listVideoInputDevices,
  resolveMobileCameraDevice,
} from '../services/deviceCamera.service'
import {
  createMobileAiAnalyzeClient,
  getMobileAiBackendUrl,
  type MobileAiAnalyzeResult,
  type MobileAiConnectionStatus,
  type MobileAiDetection,
} from '../services/mobileAiBackend.service'
import { MobileAiBackendConfig } from './MobileAiBackendConfig'
import { MobileAiAlertBadge, MobileAiOverlay } from './MobileAiOverlay'

type MobileFeedStatus = 'idle' | 'scanning' | 'live' | 'error'

interface MobileCameraFeedProps {
  cameraId: string
  label: string
  playing?: boolean
  compact?: boolean
  /** Bật gửi frame lên backend AI (cần URL ngrok đã cấu hình) */
  aiEnabled?: boolean
}

export function MobileCameraFeed({
  cameraId,
  label,
  playing = true,
  compact,
  aiEnabled = false,
}: MobileCameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const aiClientRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileFeedStatus>('idle')
  const [deviceLabel, setDeviceLabel] = useState<string>()
  const [errorMsg, setErrorMsg] = useState<string>()
  const [backendUrl, setBackendUrl] = useState(() => getMobileAiBackendUrl())
  const [aiStatus, setAiStatus] = useState<MobileAiConnectionStatus>('idle')
  const [aiStatusMsg, setAiStatusMsg] = useState<string>()
  const [detections, setDetections] = useState<MobileAiDetection[]>([])
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })

  const stopAiClient = useCallback(() => {
    aiClientRef.current?.stop()
    aiClientRef.current = null
    setAiStatus('idle')
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
    if (!aiEnabled || !video || !url || status !== 'live') return

    aiClientRef.current = createMobileAiAnalyzeClient(video, {
      cameraId,
      backendUrl: url,
      onResult: (result: MobileAiAnalyzeResult) => {
        setDetections(result.detections)
        setFrameSize({ width: result.width, height: result.height })
      },
      onStatusChange: (next, message) => {
        setAiStatus(next)
        setAiStatusMsg(message)
      },
    })
  }, [aiEnabled, cameraId, status, stopAiClient])

  const startCapture = useCallback(async () => {
    if (!isDeviceCameraSupported()) {
      setStatus('error')
      setErrorMsg('Trình duyệt không hỗ trợ camera thiết bị.')
      return
    }

    setStatus('scanning')
    setErrorMsg(undefined)
    stopCapture()

    try {
      const deviceId = await resolveMobileCameraDevice(cameraId)
      const devices = await listVideoInputDevices()
      setDeviceLabel(getResolvedDeviceLabel(cameraId, devices))

      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' },
        audio: false,
      })

      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }
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
    if (playing) {
      void startCapture()
    } else {
      stopCapture()
      setStatus('idle')
    }
    return stopCapture
  }, [playing, startCapture, stopCapture])

  useEffect(() => {
    if (status === 'live' && aiEnabled && backendUrl) {
      startAiClient()
    } else {
      stopAiClient()
    }
    return stopAiClient
  }, [status, aiEnabled, backendUrl, startAiClient, stopAiClient])

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

      {playing && aiEnabled && (
        <MobileAiBackendConfig
          compact={compact}
          autoOpen={!backendUrl}
          onSaved={() => {
            setBackendUrl(getMobileAiBackendUrl())
          }}
        />
      )}

      {status === 'live' && aiEnabled && backendUrl && (
        <>
          <MobileAiOverlay
            detections={detections}
            frameWidth={frameSize.width}
            frameHeight={frameSize.height}
            compact={compact}
          />
          <MobileAiAlertBadge detections={detections} compact={compact} />
        </>
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

      {status === 'live' && (
        <div className={cn(
          'absolute left-2 flex items-center gap-1 rounded bg-black/55 border border-red-500/40 text-red-300 font-bold',
          compact ? 'top-1 px-1 py-0.5 text-[7px]' : 'top-2 px-1.5 py-0.5 text-[9px]',
        )}>
          <Circle className={cn(compact ? 'w-1.5 h-1.5' : 'w-2 h-2', 'fill-red-500 text-red-500 animate-pulse')} />
          REC
        </div>
      )}

      {status === 'live' && aiEnabled && aiStatus === 'connected' && (
        <div className={cn(
          'absolute flex items-center gap-1 rounded bg-black/55 border border-green-500/35 text-green-300/90',
          compact ? 'bottom-1 left-2 px-1 py-0.5 text-[6px]' : 'bottom-2 left-2 px-1.5 py-0.5 text-[8px]',
        )}>
          <Wifi className={cn(compact ? 'w-2 h-2' : 'w-2.5 h-2.5')} />
          AI
        </div>
      )}

      {status === 'live' && aiEnabled && aiStatus === 'error' && aiStatusMsg && (
        <div className={cn(
          'absolute inset-x-2 rounded bg-red-950/80 border border-red-500/30 text-red-200 text-center',
          compact ? 'bottom-1 px-1 py-0.5 text-[6px]' : 'bottom-2 px-2 py-1 text-[8px]',
        )}>
          {aiStatusMsg}
        </div>
      )}

      {status === 'live' && deviceLabel && (
        <div className={cn(
          'absolute right-2 rounded bg-black/55 text-white/70 truncate max-w-[55%]',
          compact ? 'bottom-1 px-1 py-0.5 text-[6px]' : 'bottom-2 px-1.5 py-0.5 text-[9px]',
        )}>
          {deviceLabel}
        </div>
      )}
    </div>
  )
}
