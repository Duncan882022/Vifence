import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import { setVideoAnalyzeIntervalScale } from '../services/mobileAiBackend.service'
import { CameraAiOverlay } from './CameraAiOverlay'
import { CraneProximityOverlay } from '@/modules/module03-safety/components/CraneProximityOverlay'
import { PcccOverlay } from '@/modules/module03-safety/components/PcccOverlay'
import { PpeOverlay } from '@/modules/module03-safety/components/PpeOverlay'
import { WahOverlay } from '@/modules/module03-safety/components/WahOverlay'
import { AtgtOverlay } from '@/modules/module03-safety/components/AtgtOverlay'
import { VmsDetectionProvider } from '@/modules/module03-safety/context/VmsDetectionContext'
import { useVmsDetectionFeed } from '@/modules/module03-safety/hooks/useVmsDetectionFeed'
import { useSyncedVmsDetections } from '@/modules/module03-safety/hooks/useSyncedVmsDetections'
import { isVmsLiveCamera } from '@/modules/module03-safety/services/vmsDetections.service'
import { OverlayCycleProvider } from '@/modules/module03-safety/hooks/useOverlayCycleSync'
import { useOverlayLayoutTick } from '@/modules/module03-safety/hooks/useOverlayLayoutTick'
import { OVERLAY_CYCLE_DEFAULTS } from '@/modules/module03-safety/utils/overlayScanOrder'
import { RoadAnalysisOverlay } from '@/modules/module04-housekeeping/components/RoadAnalysisOverlay'
import { isHlsStreamUrl, useStreamSignalPhase, useVideoFramesReady } from '../hooks/useHlsVideoSource'
import { setPatrolCameraFramesLive } from '@/services/patrolCameraFrameBridge'
import { useLowLatencyVideoSource } from '../hooks/useLowLatencyVideoSource'
import {
  isAiOverlayDisabledCamera,
  isPatrolHelmetAiCamera,
  isPatrolFlycamAiCamera,
  isPatrolPersonCamera,
} from '../data/cameraAiRuntime'
import { syncLivePatrolPersonDetectionsToHeatmap } from '@/modules/module05-productivity/utils/patrolHeatmapLiveSync'
import { PatrolPersonRoiOverlay } from '@/modules/module05-productivity/personRoi'
import { resolveEffectivePatrolFlightMode, readPatrolFlightModeFromMetrics } from '@/modules/module05-productivity/utils/patrolFlightMode'
import { gateVmsPatrolPersonDetections } from '@/modules/module05-productivity/utils/patrolVmsRoiSync'
import { setPatrolFlightMode } from '@/services/patrolFlightModeBridge'
import {
  isPatrolPersonRoiCameraId,
  isPatrolMetricsCameraId,
  PATROL_LIVE_ROI_DELAY_MS,
} from '@/modules/module05-productivity/data/patrolHelmetScope'
import { resolveOverlayAnalyzeFrameSize } from '@/modules/module02-training/utils/videoOverlayCoords'
import {
  getCameraFeedPosterUrl,
  getFeedKeyForCamera,
  getVideoObjectFitForCamera,
  getVideoObjectPositionForCamera,
} from '../data/trainingCameraFeeds'
import { useCameraAiEnabledModels } from '../hooks/useCameraAiConfig'
import { useCameraLiveRoiVisible } from '../hooks/useCameraLiveRoiVisible'
import { useCameraBboxVisible } from './CameraBboxToggle'

interface CameraVideoFeedProps {
  cameraId: string
  streamType?: 'fixed' | 'bodycam' | 'flycam' | 'mobile'
  src: string
  /** Endpoint WHEP — có thì phát WebRTC độ trễ thấp, lỗi thì tự về `src` (HLS). */
  whepUrl?: string
  /** HLS dự phòng khi `src` trả 503 / chưa sẵn sàng. */
  hlsFallbackSrc?: string
  playing?: boolean
  /** Bật AI detect + vẽ box — chỉ dùng trên luồng đang chọn (grid chính) */
  aiOverlay?: boolean
  /** Thu nhỏ label overlay — vẫn hiển thị detect */
  compact?: boolean
  /** Giảm tần suất gửi frame AI khi grid nhiều luồng (video mượt hơn). */
  analyzeThrottle?: boolean
  /** Thứ tự luồng trong grid — mobile phát lệch nhau tránh iOS chặn decode song song. */
  streamIndex?: number
}

export function CameraVideoFeed({
  cameraId,
  streamType = 'fixed',
  src,
  whepUrl,
  hlsFallbackSrc,
  playing = true,
  aiOverlay = false,
  compact,
  analyzeThrottle,
  streamIndex = 0,
}: CameraVideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [bboxVisible] = useCameraBboxVisible(cameraId)
  const [liveRoiVisible] = useCameraLiveRoiVisible(cameraId)
  const { isDesktop } = useShellLayout()
  const { enabledModels } = useCameraAiEnabledModels(cameraId)
  const overlayActive = Boolean(aiOverlay && bboxVisible)
  const runPatrolAnalyze = Boolean(
    playing && aiOverlay && (isPatrolHelmetAiCamera(cameraId) || isPatrolFlycamAiCamera(cameraId)) && isVmsLiveCamera(cameraId),
  )
  const feedKey = getFeedKeyForCamera(cameraId)
  const posterUrl = feedKey ? getCameraFeedPosterUrl(feedKey) : undefined
  const overlayDisabled = isAiOverlayDisabledCamera(cameraId)
  const roadAnalysis = enabledModels.includes('road_material')
  const craneProximity = enabledModels.includes('crane_proximity')
  const ppeAnalysis = enabledModels.includes('ppe')
  const patrolPersonAnalysis = isPatrolPersonCamera(cameraId)
  const pcccAnalysis = enabledModels.includes('pccc')
  const wahAnalysis = enabledModels.includes('wah')
  const atgtAnalysis = enabledModels.includes('atgt_traffic')
  const faceDemo = enabledModels.includes('face_demo')
  const videoFit = getVideoObjectFitForCamera(cameraId, streamType)
  const videoObjectPosition = getVideoObjectPositionForCamera(cameraId, streamType)
  const showFaceOverlay = Boolean(
    overlayActive && feedKey && faceDemo && !roadAnalysis && !craneProximity && !ppeAnalysis && !pcccAnalysis && !wahAnalysis && !atgtAnalysis && !overlayDisabled,
  )
  /** A-03: polygon ROAD + MESH (toggle ROI) — luôn hiện kể cả khi bật ATGT. */
  const showA03RoadRoiLayer = cameraId === 'A-03' && liveRoiVisible
  const showRoadOverlay = Boolean(
    overlayActive && !overlayDisabled && (roadAnalysis || showA03RoadRoiLayer),
  )
  const showCraneOverlay = Boolean(overlayActive && craneProximity && !overlayDisabled)
  const runPatrolHeatmapAnalyze = Boolean(
    runPatrolAnalyze && patrolPersonAnalysis && !overlayDisabled,
  )
  const showPatrolPersonRoi = Boolean(
    runPatrolHeatmapAnalyze
    && overlayActive
    && isPatrolPersonRoiCameraId(cameraId),
  )
  const showPpeOverlay = Boolean(
    overlayActive && (ppeAnalysis || patrolPersonAnalysis) && !overlayDisabled && !runPatrolHeatmapAnalyze,
  )
  const showPcccOverlay = Boolean(overlayActive && pcccAnalysis && !overlayDisabled)
  const showWahOverlay = Boolean(overlayActive && wahAnalysis && !overlayDisabled)
  const showAtgtOverlay = Boolean(overlayActive && atgtAnalysis && !overlayDisabled)
  const showAnySafetyOverlay = showCraneOverlay || showPpeOverlay || showPatrolPersonRoi || showPcccOverlay || showWahOverlay || showAtgtOverlay
  const isHls = isHlsStreamUrl(src)
  const { clock: videoClock } = useLowLatencyVideoSource(videoRef, {
    whepUrl,
    hlsSrc: src,
    hlsFallbackSrc,
    playing,
  })

  const framesReady = useVideoFramesReady(videoRef, playing)
  const roiLayoutTick = useOverlayLayoutTick(videoRef)
  const remoteWaiting = Boolean(playing && (isHls || Boolean(whepUrl)))
  const signalPhase = useStreamSignalPhase(
    framesReady,
    playing,
    remoteWaiting,
    `${cameraId}:${src}:${hlsFallbackSrc ?? ''}:${whepUrl ?? ''}`,
  )
  const waitingForSignal = signalPhase === 'waiting'
  const showSignalOffline = signalPhase === 'offline'

  useEffect(() => {
    if (!isPatrolPersonRoiCameraId(cameraId)) return
    setPatrolCameraFramesLive(cameraId, framesReady)
    return () => setPatrolCameraFramesLive(cameraId, false)
  }, [cameraId, framesReady])

  const rawVmsFeed = useVmsDetectionFeed(
    cameraId,
    Boolean((overlayActive || runPatrolAnalyze) && isVmsLiveCamera(cameraId)),
  )
  // Khớp bbox với khung hình đang phát — HLS trễ vài giây so với lúc AI chạy.
  const vmsFeed = useSyncedVmsDetections(rawVmsFeed, videoClock, {
    fallbackLagMs: isPatrolMetricsCameraId(cameraId) ? PATROL_LIVE_ROI_DELAY_MS : undefined,
  })

  const patrolRoiFrameSize = useMemo(() => {
    const video = videoRef.current
    const snapW = vmsFeed.snapshot?.width ?? 0
    const snapH = vmsFeed.snapshot?.height ?? 0
    if (snapW > 0 && snapH > 0) {
      return resolveOverlayAnalyzeFrameSize(video, snapW, snapH)
    }
    const vw = video?.videoWidth ?? 0
    const vh = video?.videoHeight ?? 0
    if (vw > 0 && vh > 0) {
      return resolveOverlayAnalyzeFrameSize(video, vw, vh)
    }
    return { width: 0, height: 0 }
  }, [
    vmsFeed.snapshot?.width,
    vmsFeed.snapshot?.height,
    vmsFeed.snapshot?.updated_at,
    framesReady,
    videoClock,
    roiLayoutTick,
  ])

  useEffect(() => {
    if (!runPatrolHeatmapAnalyze || !vmsFeed.snapshot) return
    const fromMetrics = readPatrolFlightModeFromMetrics(vmsFeed.snapshot.metrics)
    if (cameraId.startsWith('DR-') && fromMetrics) {
      setPatrolFlightMode(cameraId, fromMetrics)
    }
    const flightMode = resolveEffectivePatrolFlightMode(cameraId, vmsFeed.snapshot.metrics)
    syncLivePatrolPersonDetectionsToHeatmap(
      cameraId,
      gateVmsPatrolPersonDetections(vmsFeed.snapshot, cameraId, flightMode),
    )
  }, [
    runPatrolHeatmapAnalyze,
    cameraId,
    vmsFeed.snapshot?.updated_at,
    vmsFeed.snapshot?.width,
    vmsFeed.snapshot?.height,
    vmsFeed.snapshot?.metrics,
  ])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const scale = analyzeThrottle ? (isDesktop ? 1.35 : 2.75) : 1
    setVideoAnalyzeIntervalScale(video, scale)
    return () => {
      setVideoAnalyzeIntervalScale(video, 1)
    }
  }, [analyzeThrottle, isDesktop, src])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let visibleRatio = 1
    let playTimer = 0
    let retryTimer = 0
    let cancelled = false
    const isMobile = !isDesktop
    const playDelayMs = isMobile ? streamIndex * 700 : 0

    const tryPlay = () => {
      window.clearTimeout(playTimer)
      if (cancelled) return

      const visibleEnough = !isMobile || visibleRatio >= 0.12
      if (!playing || !visibleEnough) {
        video.pause()
        return
      }

      video.muted = true
      video.defaultMuted = true
      video.setAttribute('playsinline', 'true')
      video.setAttribute('webkit-playsinline', 'true')

      const start = () => {
        if (cancelled) return
        void video.play().catch(() => {
          retryTimer = window.setTimeout(() => {
            video.load()
            void video.play().catch(() => {})
          }, 1200)
        })
      }

      if (playDelayMs > 0) {
        playTimer = window.setTimeout(start, playDelayMs)
      } else {
        start()
      }
    }

    /**
     * MediaStream không có gì để tải lại: `load()` chỉ đưa readyState về
     * HAVE_NOTHING và bỏ luồng đang gắn, khiến tile đứng ở màn chờ vĩnh viễn.
     */
    const isStreamSource = () => Boolean(video.srcObject)

    const onStalled = () => {
      if (isHls || isStreamSource()) return
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        video.load()
        tryPlay()
      }
    }

    const onError = () => {
      if (isHls || isStreamSource()) return
      retryTimer = window.setTimeout(() => {
        video.load()
        tryPlay()
      }, 1500)
    }

    const observer = new IntersectionObserver(
      entries => {
        visibleRatio = Math.max(...entries.map(e => e.intersectionRatio), 0)
        tryPlay()
      },
      { threshold: isMobile ? [0, 0.12, 0.35, 0.6] : [0.08, 0.25] },
    )
    observer.observe(video)

    video.addEventListener('canplay', tryPlay)
    video.addEventListener('loadeddata', tryPlay)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('error', onError)
    tryPlay()

    return () => {
      cancelled = true
      window.clearTimeout(playTimer)
      window.clearTimeout(retryTimer)
      observer.disconnect()
      video.removeEventListener('canplay', tryPlay)
      video.removeEventListener('loadeddata', tryPlay)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('error', onError)
      video.pause()
    }
  }, [src, playing, isDesktop, streamIndex, isHls])

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={isHls ? undefined : src}
        poster={posterUrl}
        autoPlay
        muted
        loop={!isHls}
        playsInline
        crossOrigin="anonymous"
        preload={playing ? (isDesktop ? 'auto' : 'metadata') : 'none'}
        className={cn(
          'absolute inset-0 h-full w-full',
          videoFit === 'contain' ? 'object-contain bg-black' : 'object-cover',
          videoObjectPosition === 'bottom' && videoFit === 'cover' && 'object-bottom',
          'saturate-[0.82] contrast-[1.06] brightness-[0.9]',
        )}
      />
      {waitingForSignal && (
        <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center gap-2 bg-black/60 text-center px-4">
          <span className="w-4 h-4 rounded-full border-2 border-white/25 border-t-white/70 animate-spin" aria-hidden />
          <span className="text-[11px] font-semibold tracking-wide text-white/80">
            {streamType === 'bodycam'
              ? 'Đang chờ tín hiệu từ mũ'
              : 'Đang chờ tín hiệu'}
          </span>
          {streamType === 'bodycam' && (
            <span className="text-[9px] leading-relaxed text-white/45">
              Mũ phải đang phát sóng ở trang Phát sóng
            </span>
          )}
        </div>
      )}
      {showSignalOffline && (
        <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center gap-2 bg-black/80 text-center px-4">
          <span className="text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground/50">Offline</span>
          <span className="text-[10px] text-muted-foreground/40">
            {streamType === 'bodycam' ? 'Chưa có tín hiệu từ mũ' : 'Chưa có tín hiệu'}
          </span>
        </div>
      )}
      <VmsDetectionProvider value={vmsFeed.active ? vmsFeed : null}>
      {showFaceOverlay && feedKey && (
        <CameraAiOverlay
          feedKey={feedKey}
          compact={compact}
          videoRef={videoRef}
          enabled={playing && overlayActive}
        />
      )}
      {showRoadOverlay && (
        <RoadAnalysisOverlay
          cameraId={cameraId}
          compact={compact}
          videoRef={videoRef}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
          enabled={playing && overlayActive}
        />
      )}
      <OverlayCycleProvider
        enabled={playing && overlayActive && showAnySafetyOverlay}
        stepMs={OVERLAY_CYCLE_DEFAULTS.stepMs}
        holdMs={OVERLAY_CYCLE_DEFAULTS.holdMs}
      >
        {showCraneOverlay && (
          <CraneProximityOverlay
            cameraId={cameraId}
            compact={compact}
            videoRef={videoRef}
            videoFit={videoFit}
            videoObjectPosition={videoObjectPosition}
            enabled={playing && overlayActive}
          />
        )}
        {showPatrolPersonRoi && (
          <PatrolPersonRoiOverlay
            cameraId={cameraId}
            frameWidth={patrolRoiFrameSize.width}
            frameHeight={patrolRoiFrameSize.height}
            videoRef={videoRef}
            compact={compact}
            videoFit={videoFit}
            videoObjectPosition={videoObjectPosition}
          />
        )}
        {showPpeOverlay && (
          <PpeOverlay
            cameraId={cameraId}
            compact={compact}
            videoRef={videoRef}
            videoFit={videoFit}
            videoObjectPosition={videoObjectPosition}
            enabled={playing && overlayActive}
          />
        )}
        {showPcccOverlay && (
          <PcccOverlay
            cameraId={cameraId}
            compact={compact}
            videoRef={videoRef}
            videoFit={videoFit}
            videoObjectPosition={videoObjectPosition}
            enabled={playing && overlayActive}
          />
        )}
        {showWahOverlay && (
          <WahOverlay
            cameraId={cameraId}
            compact={compact}
            videoRef={videoRef}
            videoFit={videoFit}
            videoObjectPosition={videoObjectPosition}
            enabled={playing && overlayActive}
          />
        )}
        {showAtgtOverlay && (
          <AtgtOverlay
            cameraId={cameraId}
            compact={compact}
            videoRef={videoRef}
            videoFit={videoFit}
            videoObjectPosition={videoObjectPosition}
            enabled={playing && overlayActive}
          />
        )}
      </OverlayCycleProvider>
      </VmsDetectionProvider>
    </div>
  )
}
