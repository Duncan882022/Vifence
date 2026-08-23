import { useEffect, useRef } from 'react'
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
import { isVmsLiveCamera } from '@/modules/module03-safety/services/vmsDetections.service'
import { OverlayCycleProvider } from '@/modules/module03-safety/hooks/useOverlayCycleSync'
import { OVERLAY_CYCLE_DEFAULTS } from '@/modules/module03-safety/utils/overlayScanOrder'
import { RoadAnalysisOverlay } from '@/modules/module04-housekeeping/components/RoadAnalysisOverlay'
import { isHlsStreamUrl, useHlsVideoSource } from '../hooks/useHlsVideoSource'
import {
  isAiOverlayDisabledCamera,
  isPatrolHelmetAiCamera,
  isPatrolPersonCamera,
} from '../data/cameraAiRuntime'
import { syncLivePatrolPersonDetectionsToHeatmap } from '@/modules/module05-productivity/utils/patrolHeatmapLiveSync'
import { PatrolPersonRoiOverlay } from '@/modules/module05-productivity/personRoi'
import { isPatrolHelmetCameraId } from '@/modules/module05-productivity/data/patrolHelmetScope'
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
    playing && aiOverlay && isPatrolHelmetAiCamera(cameraId) && isVmsLiveCamera(cameraId),
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
  const showPatrolPersonRoi = Boolean(runPatrolHeatmapAnalyze && overlayActive && isPatrolHelmetCameraId(cameraId))
  const showPpeOverlay = Boolean(
    overlayActive && (ppeAnalysis || patrolPersonAnalysis) && !overlayDisabled && !runPatrolHeatmapAnalyze,
  )
  const showPcccOverlay = Boolean(overlayActive && pcccAnalysis && !overlayDisabled)
  const showWahOverlay = Boolean(overlayActive && wahAnalysis && !overlayDisabled)
  const showAtgtOverlay = Boolean(overlayActive && atgtAnalysis && !overlayDisabled)
  const showAnySafetyOverlay = showCraneOverlay || showPpeOverlay || showPatrolPersonRoi || showPcccOverlay || showWahOverlay || showAtgtOverlay
  const isHls = isHlsStreamUrl(src)
  const vmsFeed = useVmsDetectionFeed(
    cameraId,
    Boolean((overlayActive || runPatrolAnalyze) && isVmsLiveCamera(cameraId)),
  )

  useEffect(() => {
    if (!runPatrolHeatmapAnalyze || !vmsFeed.snapshot) return
    syncLivePatrolPersonDetectionsToHeatmap(
      cameraId,
      vmsFeed.snapshot.detections.map(d => ({
        behavior: d.behavior,
        label: d.label ?? d.behavior,
        confidence: d.confidence,
        bbox: d.bbox,
        worker_id: d.worker_id,
        worker_name: d.worker_name,
      })),
    )
  }, [runPatrolHeatmapAnalyze, cameraId, vmsFeed.snapshot?.updated_at])

  useHlsVideoSource(videoRef, src, playing)

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

    const onStalled = () => {
      if (isHls) return
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        video.load()
        tryPlay()
      }
    }

    const onError = () => {
      if (isHls) return
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
            frameWidth={vmsFeed.snapshot?.width ?? 0}
            frameHeight={vmsFeed.snapshot?.height ?? 0}
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
