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
import { resolveOverlayAnalyzeFrameSize } from '@/modules/module02-training/utils/videoOverlayCoords'
import { isMobileSmokingFireCamera, isPatrolPersonCamera } from '../data/cameraAiRuntime'
import {
  setPatrolMobileLiveSnapshot,
  touchPatrolMobileStreamOnline,
  scheduleClearPatrolMobileLiveSnapshot,
  cancelScheduledClearPatrolMobile,
  clearPatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import { setPatrolCameraFramesLive } from '@/services/patrolCameraFrameBridge'
import { pushPatrolMobilePersonEvents } from '@/services/patrolPersonEventsBridge'
import {
  getPatrolHelmetGps,
  setPatrolHelmetGps,
} from '@/services/patrolHelmetGpsBridge'
import { watchDeviceGps } from '../services/deviceGps.service'
import { getLastDeviceHeading, watchDeviceHeading } from '../services/deviceHeading.service'
import { useCameraAiEnabledModels } from '../hooks/useCameraAiConfig'
import { useCameraBboxVisible } from './CameraBboxToggle'
import { useOverlayLayoutTick } from '@/modules/module03-safety/hooks/useOverlayLayoutTick'
import { syncLivePatrolPersonDetectionsToHeatmap } from '@/modules/module05-productivity/utils/patrolHeatmapLiveSync'
import { PatrolPersonRoiOverlay } from '@/modules/module05-productivity/personRoi'
import { useVmsDetectionFeed } from '@/modules/module03-safety/hooks/useVmsDetectionFeed'
import { useSyncedVmsDetections } from '@/modules/module03-safety/hooks/useSyncedVmsDetections'
import { isVmsLiveCamera } from '@/modules/module03-safety/services/vmsDetections.service'
import { usePatrolLocalFrameAnalyze } from '@/modules/module05-productivity/hooks/usePatrolLocalFrameAnalyze'
import { patrolPersonMeetsDetectionGate, patrolPersonMeetsDisplayGate, suppressPatrolObjectOverlappingIdentified } from '@/modules/module05-productivity/utils/patrolPersonVisibility'
import { resolveEffectivePatrolFlightMode, resolvePatrolFlycamGateFlags } from '@/modules/module05-productivity/utils/patrolFlightMode'
import { gateVmsPatrolPersonDetections } from '@/modules/module05-productivity/utils/patrolVmsRoiSync'
import { isPatrolPersonRoiCameraId, isPatrolMetricsCameraId } from '@/modules/module05-productivity/data/patrolHelmetScope'
import { ingestHelmetImu } from '@/modules/module05-productivity/utils/positionEngine'

/** Ngưỡng overlay HC-02 — person từ 0.22 (vàng nếu <0.42). Khớp BE _PERSON_CONF_BODYCAM. */
const HC02_PERSON_MIN_CONF = 0.22
const HC02_PERSON_STRONG_CONF = 0.42

function tagHc02PersonDetections(items: MobileAiDetection[]): MobileAiDetection[] {
  return items.map(d => {
    if (d.behavior !== 'person') return d
    const weak = d.confidence >= HC02_PERSON_MIN_CONF && d.confidence < HC02_PERSON_STRONG_CONF
    return weak ? { ...d, weak: true } : d
  })
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
  /**
   * Luồng camera do nơi khác mở (trang Phát sóng trên cùng máy).
   * iOS chỉ cho một consumer giữ camera, nên nhận lại luồng sẵn có thay vì
   * gọi getUserMedia lần hai. Không sở hữu luồng ⇒ không được stop track.
   */
  externalStream?: MediaStream | null
}

export function MobileCameraFeed({
  cameraId,
  label,
  playing = true,
  autoStartCapture = false,
  compact,
  aiEnabled = false,
  externalStream = null,
}: MobileCameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  /** Luồng do chính component mở — chỉ luồng này mới được stop khi dọn dẹp. */
  const ownsStreamRef = useRef(false)
  const externalStreamRef = useRef<MediaStream | null>(externalStream)
  externalStreamRef.current = externalStream
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
  const roiLayoutTick = useOverlayLayoutTick(videoRef)
  const facingRef = useRef<CameraFacing>('environment')
  const [facing, setFacing] = useState<CameraFacing>('environment')
  const deviceIndexRef = useRef(0)
  const [bboxVisible] = useCameraBboxVisible(cameraId)
  useCameraAiEnabledModels(cameraId)
  const mobileAiEnabled = isMobileSmokingFireCamera(cameraId) || isPatrolPersonCamera(cameraId)
  const isPatrolCam = isPatrolPersonCamera(cameraId)
  const overlayModelId = isPatrolCam ? 'patrol_person' as const : 'mobile_smoking_fire' as const
  const videoFit = getVideoObjectFitForCamera(cameraId, 'mobile')
  const videoObjectPosition = getVideoObjectPositionForCamera(cameraId, 'mobile')
  /** Analyze vẫn chạy khi ẩn ROI — heatmap/personCount cần detections. */
  const runAiAnalyze = aiEnabled && mobileAiEnabled
  const showAiOverlay = runAiAnalyze && bboxVisible
  /** Module 05 patrol — Kalman/ByteTrack ROI (HC + DR). */
  const usePatrolPersonRoi = isPatrolPersonRoiCameraId(cameraId) && isPatrolCam
  /** Mũ đang phát từ chính máy này — ROI local, không chờ VMS (trễ ~1s). */
  const isLocalPublisher = Boolean(externalStream) || (status === 'live' && autoStartCapture)
  /** VMS worker — cùng nguồn detections với HC-01 / DR-* (không dual pipeline local). */
  const vmsPatrolRoiActive = Boolean(
    usePatrolPersonRoi && runAiAnalyze && status === 'live' && isVmsLiveCamera(cameraId) && !isLocalPublisher,
  )
  const rawVmsFeed = useVmsDetectionFeed(cameraId, vmsPatrolRoiActive)
  const vmsFeed = useSyncedVmsDetections(rawVmsFeed, null, {
    useRuntimeLagHint: vmsPatrolRoiActive && isPatrolMetricsCameraId(cameraId),
  })
  /** Local analyze khi legacy-mobile hoặc mũ đang publish từ thiết bị này. */
  const patrolLocalRoiEnabled = Boolean(
    usePatrolPersonRoi && runAiAnalyze && status === 'live' && (!isVmsLiveCamera(cameraId) || isLocalPublisher),
  )
  const localRoiFrameSize = usePatrolLocalFrameAnalyze(cameraId, videoRef, patrolLocalRoiEnabled)

  useEffect(() => {
    if (!vmsPatrolRoiActive || !vmsFeed.snapshot) return
    const flightMode = resolveEffectivePatrolFlightMode(cameraId, vmsFeed.snapshot.metrics)
    syncLivePatrolPersonDetectionsToHeatmap(
      cameraId,
      gateVmsPatrolPersonDetections(vmsFeed.snapshot, cameraId, flightMode),
    )
  }, [
    vmsPatrolRoiActive,
    cameraId,
    vmsFeed.snapshot?.updated_at,
    vmsFeed.snapshot?.width,
    vmsFeed.snapshot?.height,
    vmsFeed.snapshot?.metrics,
  ])

  /** ROI cần frame size — VMS snapshot ưu tiên, rồi local JPEG analyze, rồi intrinsic video (iOS). */
  const overlayFrameSize = useMemo(() => {
    const video = videoRef.current
    if (vmsPatrolRoiActive && vmsFeed.snapshot && vmsFeed.snapshot.width > 0 && vmsFeed.snapshot.height > 0) {
      return resolveOverlayAnalyzeFrameSize(video, vmsFeed.snapshot.width, vmsFeed.snapshot.height)
    }
    if (localRoiFrameSize.width > 0 && localRoiFrameSize.height > 0) {
      return resolveOverlayAnalyzeFrameSize(video, localRoiFrameSize.width, localRoiFrameSize.height)
    }
    if (frameSize.width > 0 && frameSize.height > 0) {
      return resolveOverlayAnalyzeFrameSize(video, frameSize.width, frameSize.height)
    }
    const vw = video?.videoWidth ?? 0
    const vh = video?.videoHeight ?? 0
    if (vw > 0 && vh > 0) {
      return { width: vw, height: vh }
    }
    return resolveOverlayAnalyzeFrameSize(video, 0, 0)
  }, [vmsPatrolRoiActive, vmsFeed.snapshot, localRoiFrameSize, frameSize, roiLayoutTick, status])
  const overlayDetections = useMemo(() => {
    const mapped = detections
    return cameraId === 'HC-02' ? tagHc02PersonDetections(mapped) : mapped
  }, [detections, cameraId])

  const stopAiClient = useCallback(() => {
    aiClientRef.current?.stop()
    aiClientRef.current = null
    setDetections([])
    // Giữ mobile metrics + GPS — map vẫn cần person dots khi AI client restart.
  }, [])

  const stopCapture = useCallback((opts?: { clearPatrol?: boolean }) => {
    const clearPatrol = opts?.clearPatrol !== false
    stopAiClient()
    // Luồng mượn của trang Phát sóng: tắt track ở đây là cắt luôn sóng đang phát.
    if (ownsStreamRef.current) {
      streamRef.current?.getTracks().forEach(track => track.stop())
    }
    ownsStreamRef.current = false
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    // Flip / maximize: delay clear — feed mới kịp heartbeat thì hủy
    if (cameraId === 'HC-02' && clearPatrol) {
      scheduleClearPatrolMobileLiveSnapshot(cameraId, 2500)
    }
  }, [cameraId, stopAiClient])

  useEffect(() => {
    if (cameraId !== 'HC-02') return
    if (status === 'live') return
    cancelScheduledClearPatrolMobile()
    clearPatrolMobileLiveSnapshot(cameraId)
  }, [cameraId, status])

  useEffect(() => {
    if (!isPatrolPersonRoiCameraId(cameraId)) return
    setPatrolCameraFramesLive(cameraId, status === 'live')
    return () => setPatrolCameraFramesLive(cameraId, false)
  }, [cameraId, status])

  const startAiClient = useCallback(() => {
    stopAiClient()
    const video = videoRef.current
    const url = getMobileAiBackendUrl()
    if (!runAiAnalyze || !video || !url || status !== 'live') return

    aiClientRef.current = createMobileAiAnalyzeClient(video, {
      cameraId,
      backendUrl: url,
      /** Patrol ROI do local analyze — client này chỉ KPI/sự kiện, thưa hơn tránh 2× infer. */
      intervalMs: usePatrolPersonRoi
        ? 420
        : (isPatrolCam && cameraId.startsWith('HC-') ? 120 : 450),
      getGps: cameraId === 'HC-02'
        ? () => {
            const snap = getPatrolHelmetGps(cameraId)
            return snap ? { lat: snap.lat, lng: snap.lng } : null
          }
        : undefined,
      getHeading: cameraId === 'HC-02' ? () => getLastDeviceHeading() : undefined,
      onResult: (result: MobileAiAnalyzeResult) => {
        const minConf = (d: MobileAiDetection) => {
          if (isPatrolCam) {
            if (d.behavior === 'person') {
              return d.confidence >= (cameraId === 'HC-02' ? HC02_PERSON_MIN_CONF : 0.18)
            }
            return false
          }
          if (d.behavior === 'fire' && d.label.startsWith('flame')) return d.confidence >= 0.58
          if (d.behavior === 'fire') return d.confidence >= 0.62
          if (d.behavior === 'smoking') return d.confidence >= 0.42
          return d.confidence >= 0.5
        }
        const filtered = result.detections.filter(minConf)
        const frameW = result.width > 0 ? result.width : (videoRef.current?.videoWidth ?? 0)
        const frameH = result.height > 0 ? result.height : (videoRef.current?.videoHeight ?? 0)
        const patrolBox = (d: MobileAiDetection): [number, number, number, number] | null => {
          const raw = d.subject_bbox?.length === 4 ? d.subject_bbox : d.bbox
          if (!raw || raw.length < 4) return null
          return [raw[0], raw[1], raw[2], raw[3]]
        }
        const patrolPersonCam = isPatrolPersonRoiCameraId(cameraId)
        const flycamGates = resolvePatrolFlycamGateFlags(
          cameraId,
          resolveEffectivePatrolFlightMode(cameraId, result.metrics),
        )
        /** Vẽ ROI cho mọi người nhìn thấy được — chỉ loại mảnh chân/tay. */
        const patrolVisible = (d: MobileAiDetection) => {
          if (!patrolPersonCam || d.behavior !== 'person') return true
          const box = patrolBox(d)
          if (!box || frameW <= 0 || frameH <= 0) return false
          return patrolPersonMeetsDisplayGate({
            bbox: box,
            frameW,
            frameH,
            workerId: d.worker_id,
            flycam: flycamGates.flycam,
            proximityFlycam: flycamGates.proximityFlycam,
          })
        }
        /** Khung hiện tại — tiêu chí sự kiện: đầu + ≥30% thân, hoặc đã có mặt/mã. */
        const patrolCountable = (d: MobileAiDetection) => {
          if (!patrolPersonCam || d.behavior !== 'person') return true
          const box = patrolBox(d)
          if (!box || frameW <= 0 || frameH <= 0) return false
          return patrolPersonMeetsDetectionGate({
            bbox: box,
            frameW,
            frameH,
            workerId: d.worker_id,
            faceEligible: d.face_eligible,
          })
        }
        const gated = suppressPatrolObjectOverlappingIdentified(filtered.filter(patrolVisible))
        const now = Date.now()
        const isPatrolPerson = isPatrolCam && (cameraId.startsWith('HC-') || cameraId.startsWith('DR-'))
        /** Patrol ROI overlay đọc engine local — không giữ ghost bbox từ round-trip cũ. */
        const holdMs = usePatrolPersonRoi ? 0 : (isPatrolPerson ? 900 : 1800)
        if (gated.length > 0) {
          detectionHoldRef.current = { until: now + holdMs, items: gated }
          setDetections(gated)
        } else if (holdMs > 0 && now < detectionHoldRef.current.until) {
          setDetections(detectionHoldRef.current.items)
        } else {
          setDetections([])
        }
        if (isPatrolPerson) {
          // Đếm person từ raw detections (trước filter overlay) — map không miss khi conf thấp
          const rawPersons = result.detections.filter(d => d.behavior === 'person'
            && d.confidence >= HC02_PERSON_MIN_CONF
            && patrolCountable(d))
          const persons = gated.filter(d => d.behavior === 'person' && patrolCountable(d))
          const personCount = Math.max(rawPersons.length, persons.length)
          const workerNames = [...rawPersons, ...persons]
            .map(d => d.worker_name?.trim())
            .filter((name): name is string => Boolean(name))
          // streamOnline trước sync — resolvePatrolHeatmapGps đọc snapshot cho site-center fallback.
          setPatrolMobileLiveSnapshot({
            cameraId,
            streamOnline: true,
            personCount,
            identifiedWorkers: new Set(
              [...rawPersons, ...persons]
                .map(d => d.worker_id)
                .filter((id): id is string => Boolean(id && id !== 'unknown')),
            ).size,
            workerNames: [...new Set(workerNames)].slice(0, 5),
            updatedAt: now,
          })
          if (!usePatrolPersonRoi) {
            syncLivePatrolPersonDetectionsToHeatmap(cameraId, gated)
          }

          if (result.events?.length) {
            pushPatrolMobilePersonEvents(result.events, cameraId)
          }
        }
        setFrameSize({ width: result.width, height: result.height })
      },
      onStatusChange: () => {
        // Trạng thái backend hiển thị qua toolbar ngrok trên CameraChrome.
      },
    })
  }, [runAiAnalyze, cameraId, status, stopAiClient, usePatrolPersonRoi, isPatrolCam])

  const startCapture = useCallback(async (
    nextFacing?: CameraFacing,
    nextDeviceIndex?: number,
  ) => {
    const useFacing = nextFacing ?? facingRef.current
    const useDeviceIndex = nextDeviceIndex ?? deviceIndexRef.current

    // Trang Phát sóng đang giữ camera — mở lần hai sẽ cướp luồng và cắt sóng.
    if (externalStreamRef.current) return

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
      ownsStreamRef.current = true
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
      if (cameraId === 'HC-02') {
        cancelScheduledClearPatrolMobile()
        clearPatrolMobileLiveSnapshot(cameraId)
      }
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
    const unsubHeading = watchDeviceHeading()
    const imuTick = window.setInterval(() => {
      const h = getLastDeviceHeading()
      if (h != null) ingestHelmetImu(cameraId, h)
    }, 50)
    return () => {
      unsubHeading()
      window.clearInterval(imuTick)
    }
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

  /**
   * Luồng mượn từ trang Phát sóng — gắn thẳng, không mở camera lần hai.
   * Gắn lại mỗi khi phần tử video mất srcObject (remount, hoặc trình duyệt tự
   * huỷ nguồn) để tile không kẹt ở màn chờ.
   */
  useEffect(() => {
    if (!externalStream) return
    if (!playing) {
      // Tile ẩn: dừng gửi frame, nhưng tuyệt đối không đụng vào track của sóng.
      stopAiClient()
      streamRef.current = null
      setStatus('idle')
      return
    }

    stopAiClient()
    ownsStreamRef.current = false
    streamRef.current = externalStream
    cancelScheduledClearPatrolMobile()

    const attach = () => {
      const video = videoRef.current
      if (!video) return
      if (video.srcObject !== externalStream) video.srcObject = externalStream
      video.muted = true
      video.setAttribute('playsinline', 'true')
      if (video.paused) void video.play().catch(() => {})
    }

    attach()
    const track = externalStream.getVideoTracks()[0]
    const settings = track?.getSettings?.()
    if (settings?.facingMode === 'user' || settings?.facingMode === 'environment') {
      facingRef.current = settings.facingMode
      setFacing(settings.facingMode)
    }
    setStatus(track && track.readyState !== 'ended' ? 'live' : 'scanning')

    const keepAlive = window.setInterval(attach, 1000)
    const onEnded = () => setStatus('scanning')
    track?.addEventListener('ended', onEnded)

    return () => {
      window.clearInterval(keepAlive)
      track?.removeEventListener('ended', onEnded)
      stopAiClient()
      streamRef.current = null
      const video = videoRef.current
      if (video && video.srcObject === externalStream) video.srcObject = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stopAiClient ổn định theo cameraId
  }, [externalStream, playing])

  useEffect(() => {
    if (externalStream) return
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
  }, [playing, cameraId, autoStartCapture, externalStream])

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
    const keepPlaying = () => {
      if (video.paused) void video.play().catch(() => {})
    }
    video.addEventListener('loadedmetadata', keepPlaying)
    document.addEventListener('visibilitychange', keepPlaying)
    keepPlaying()
    return () => {
      video.removeEventListener('loadedmetadata', keepPlaying)
      document.removeEventListener('visibilitychange', keepPlaying)
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

      {status === 'live' && showAiOverlay && usePatrolPersonRoi && (
        <PatrolPersonRoiOverlay
          cameraId={cameraId}
          frameWidth={overlayFrameSize.width}
          frameHeight={overlayFrameSize.height}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
        />
      )}

      {status === 'live' && showAiOverlay && !usePatrolPersonRoi && (
        <MobileAiOverlay
          detections={overlayDetections}
          frameWidth={overlayFrameSize.width}
          frameHeight={overlayFrameSize.height}
          videoRef={videoRef}
          layoutTick={roiLayoutTick}
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
