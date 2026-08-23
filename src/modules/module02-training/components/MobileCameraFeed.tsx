import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  buildMobileCaptureConstraints,
  getFacingLabel,
  isDeviceCameraSupported,
  isHandheldDevice,
  type CameraFacing,
} from '../services/deviceCamera.service'
import { subscribeMobileCameraFlip } from '../services/mobileCameraFlip'
import {
  createMobileAiAnalyzeClient,
  getMobileAiBackendUrl,
  MOBILE_AI_BACKEND_STORAGE_KEY,
  type MobileAiAnalyzeResult,
  type MobileAiDetection,
} from '../services/mobileAiBackend.service'
import { MobileAiOverlay } from './MobileAiOverlay'
import {
  getVideoObjectFitForCamera,
  getVideoObjectPositionForCamera,
} from '../data/trainingCameraFeeds'
import { isMobileSmokingFireCamera, isPatrolPersonCamera, isPpeCamera } from '../data/cameraAiRuntime'
import {
  setPatrolMobileLiveSnapshot,
  touchPatrolMobileStreamOnline,
  scheduleClearPatrolMobileLiveSnapshot,
  cancelScheduledClearPatrolMobile,
} from '@/services/patrolMobileMetricsBridge'
import { pushPatrolMobilePpeEvents } from '@/services/patrolMobileEventsBridge'
import {
  getPatrolHelmetGps,
  setPatrolHelmetGps,
} from '@/services/patrolHelmetGpsBridge'
import { watchDeviceGps } from '../services/deviceGps.service'
import { getLastDeviceHeading, watchDeviceHeading } from '../services/deviceHeading.service'
import { useCameraAiEnabledModels } from '../hooks/useCameraAiConfig'
import { useCameraBboxVisible } from './CameraBboxToggle'
import type { PpeDetection } from '@/modules/module03-safety/services/ppeBackend.service'
import { groupPpeDetections } from '@/modules/module03-safety/utils/ppeDetectionGroups'
import { tightenPersonOverlayBbox } from '@/modules/module03-safety/utils/personOverlayLabel'
import { PATROL_PPE_UI_HIDDEN } from '@/modules/module05-productivity/utils/patrolPpeVisibility'

/**
 * HC bodycam — chỉ bbox person (xanh).
 * PPE violation overlay ẩn theo yêu cầu Module 05 (PATROL_PPE_UI_HIDDEN).
 */
function mapMobilePpeOverlayDetections(detections: MobileAiDetection[]): MobileAiDetection[] {
  const ppeDets: Array<PpeDetection & { subject_bbox?: [number, number, number, number] }> = detections.map(d => ({
    behavior: d.behavior as PpeDetection['behavior'],
    label: d.label,
    scenario_id: 'PPE-001',
    confidence: d.confidence,
    bbox: d.bbox,
    subject_bbox: d.subject_bbox,
    worker_id: d.worker_id,
    worker_name: d.worker_name,
  }))
  const groups = groupPpeDetections(ppeDets)
  return groups.map(g => ({
    behavior: 'person' as const,
    label: g.person.label,
    confidence: g.person.confidence,
    bbox: tightenPersonOverlayBbox(g.person.bbox, g.person.subject_bbox),
    subject_bbox: g.person.subject_bbox,
    worker_id: g.person.worker_id,
    worker_name: g.person.worker_name,
  }))
}

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
  const [facing, setFacing] = useState<CameraFacing>('environment')
  const deviceIndexRef = useRef(0)
  const [bboxVisible] = useCameraBboxVisible(cameraId)
  useCameraAiEnabledModels(cameraId)
  const mobileAiEnabled = isMobileSmokingFireCamera(cameraId)
    || isPpeCamera(cameraId)
    || isPatrolPersonCamera(cameraId)
  const overlayModelId = isPpeCamera(cameraId) || isPatrolPersonCamera(cameraId)
    ? 'ppe' as const
    : 'mobile_smoking_fire' as const
  const videoFit = getVideoObjectFitForCamera(cameraId, 'mobile')
  const videoObjectPosition = getVideoObjectPositionForCamera(cameraId, 'mobile')
  /** Analyze vẫn chạy khi ẩn ROI — heatmap/personCount cần detections. */
  const runAiAnalyze = aiEnabled && mobileAiEnabled
  const showAiOverlay = runAiAnalyze && bboxVisible
  const overlayDetections = useMemo(
    () => (overlayModelId === 'ppe' ? mapMobilePpeOverlayDetections(detections) : detections),
    [detections, overlayModelId],
  )

  const stopAiClient = useCallback(() => {
    aiClientRef.current?.stop()
    aiClientRef.current = null
    setDetections([])
    // Giữ mobile metrics + GPS — map vẫn cần person dots khi AI client restart.
  }, [])

  const stopCapture = useCallback((opts?: { clearPatrol?: boolean }) => {
    const clearPatrol = opts?.clearPatrol !== false
    stopAiClient()
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    // Flip / maximize: delay clear — feed mới kịp heartbeat thì hủy
    if (cameraId === 'HC-02' && clearPatrol) {
      scheduleClearPatrolMobileLiveSnapshot(cameraId, 2500)
    }
  }, [cameraId, stopAiClient])

  const startAiClient = useCallback(() => {
    stopAiClient()
    const video = videoRef.current
    const url = getMobileAiBackendUrl()
    if (!runAiAnalyze || !video || !url || status !== 'live') return

    aiClientRef.current = createMobileAiAnalyzeClient(video, {
      cameraId,
      backendUrl: url,
      getGps: cameraId === 'HC-02'
        ? () => {
            const snap = getPatrolHelmetGps(cameraId)
            return snap ? { lat: snap.lat, lng: snap.lng } : null
          }
        : undefined,
      getHeading: cameraId === 'HC-02' ? () => getLastDeviceHeading() : undefined,
      onResult: (result: MobileAiAnalyzeResult) => {
        const minConf = (d: MobileAiDetection) => {
          if (overlayModelId === 'ppe') {
            if (d.behavior === 'person') return d.confidence >= 0.45
            if (['no_helmet', 'no_vest', 'no_shoes'].includes(d.behavior)) return d.confidence >= 0.55
            return d.confidence >= 0.5
          }
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
        if (cameraId === 'HC-02' && (isPpeCamera(cameraId) || isPatrolPersonCamera(cameraId))) {
          // Đếm person từ raw detections (trước filter overlay) — map không miss khi conf thấp
          const rawPersons = result.detections.filter(d => d.behavior === 'person')
          const persons = filtered.filter(d => d.behavior === 'person')
          const personCount = Math.max(rawPersons.length, persons.length)
          const violations = filtered.filter(d =>
            ['no_helmet', 'no_vest', 'no_shoes'].includes(d.behavior),
          )
          const workerNames = [...rawPersons, ...persons]
            .map(d => d.worker_name?.trim())
            .filter((name): name is string => Boolean(name))
          setPatrolMobileLiveSnapshot({
            cameraId,
            streamOnline: true,
            personCount,
            // PPE ẩn trên Module 05 — không đẩy số vi phạm PPE lên KPI/live.
            activePpeViolations: PATROL_PPE_UI_HIDDEN ? 0 : violations.length,
            identifiedWorkers: new Set(
              [...rawPersons, ...persons]
                .map(d => d.worker_id)
                .filter((id): id is string => Boolean(id && id !== 'unknown')),
            ).size,
            workerNames: [...new Set(workerNames)].slice(0, 5),
            updatedAt: now,
          })

          if (result.events?.length && !PATROL_PPE_UI_HIDDEN) {
            pushPatrolMobilePpeEvents(result.events, cameraId)
          }
        }
        setFrameSize({ width: result.width, height: result.height })
      },
      onStatusChange: () => {
        // Trạng thái backend hiển thị qua toolbar ngrok trên CameraChrome.
      },
    })
  }, [runAiAnalyze, cameraId, status, stopAiClient])

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
    // Không schedule-clear khi restart cam (flip trước/sau)
    stopCapture({ clearPatrol: false })
    if (cameraId === 'HC-02') {
      cancelScheduledClearPatrolMobile()
      touchPatrolMobileStreamOnline(cameraId)
    }

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
      setFacing(useFacing)
      setStatus('live')
      // iOS: ép play lại sau khi gắn stream (tile nhỏ dễ paused/đen)
      requestAnimationFrame(() => {
        const v = videoRef.current
        if (!v) return
        v.muted = true
        void v.play().catch(() => {})
      })
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
    if (cameraId !== 'HC-02' || status !== 'live') return
    return watchDeviceGps(reading => {
      setPatrolHelmetGps({
        cameraId,
        lat: reading.lat,
        lng: reading.lng,
        accuracyM: reading.accuracyM,
        updatedAt: reading.updatedAt,
      })
    })
  }, [cameraId, status])

  useEffect(() => {
    if (cameraId !== 'HC-02' || status !== 'live') return
    return watchDeviceHeading()
  }, [cameraId, status])

  /* HC-02: heartbeat online — cam trước/sau đều tính live (kể cả lúc AI tạm dừng). */
  useEffect(() => {
    if (cameraId !== 'HC-02' || status !== 'live') return
    cancelScheduledClearPatrolMobile()
    touchPatrolMobileStreamOnline(cameraId)
    const id = window.setInterval(() => touchPatrolMobileStreamOnline(cameraId), 2500)
    return () => window.clearInterval(id)
  }, [cameraId, status])

  useEffect(() => {
    return subscribeMobileCameraFlip(cameraId, () => {
      const next: CameraFacing = facingRef.current === 'environment' ? 'user' : 'environment'
      void startCapture(next)
    })
  }, [cameraId, startCapture])

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
    if (status === 'live' && runAiAnalyze && backendUrl) {
      startAiClient()
    } else {
      stopAiClient()
    }
    return stopAiClient
  }, [status, runAiAnalyze, backendUrl, startAiClient, stopAiClient])

  useEffect(() => {
    const video = videoRef.current
    if (!video || status !== 'live') return
    const bump = () => {
      setLayoutTick(t => t + 1)
      if (video.paused) void video.play().catch(() => {})
    }
    const observer = new ResizeObserver(bump)
    observer.observe(video)
    video.addEventListener('loadedmetadata', bump)
    video.addEventListener('resize', bump)
    document.addEventListener('visibilitychange', bump)
    bump()
    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', bump)
      video.removeEventListener('resize', bump)
      document.removeEventListener('visibilitychange', bump)
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
          'absolute inset-0 h-full w-full bg-black',
          videoFit === 'contain' ? 'object-contain' : 'object-cover',
          status !== 'live' && 'opacity-0',
        )}
      />

      {status === 'live' && (
        <span className={cn(
          'absolute z-[6] rounded bg-black/55 text-white/85 font-medium pointer-events-none',
          compact ? 'bottom-8 left-1.5 text-[7px] px-1 py-0.5' : 'bottom-12 left-2 text-[9px] px-1.5 py-0.5',
        )}>
          Cam {getFacingLabel(facing)}
        </span>
      )}

      {status === 'live' && showAiOverlay && (
        <MobileAiOverlay
          detections={overlayDetections}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          videoRef={videoRef}
          layoutTick={layoutTick}
          compact={compact}
          modelId={overlayModelId}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
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
