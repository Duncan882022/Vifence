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
import { OverlayCycleProvider } from '@/modules/module03-safety/hooks/useOverlayCycleSync'
import { OVERLAY_CYCLE_DEFAULTS } from '@/modules/module03-safety/utils/overlayScanOrder'
import { RoadAnalysisOverlay } from '@/modules/module04-housekeeping/components/RoadAnalysisOverlay'
import {
  isAiOverlayDisabledCamera,
  isAtgtCamera,
  isCraneProximityCamera,
  isFaceOverlayCamera,
  isPcccCamera,
  isPpeCamera,
  isRoadAnalysisOverlayCamera,
  isWahCamera,
} from '../data/cameraAiRuntime'
import {
  getCameraFeedPosterUrl,
  getFeedKeyForCamera,
  getVideoObjectFitForCamera,
} from '../data/trainingCameraFeeds'
import { useCameraAiEnabledModels } from '../hooks/useCameraAiConfig'
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
  const { isDesktop } = useShellLayout()
  useCameraAiEnabledModels(cameraId)
  const overlayActive = Boolean(aiOverlay && bboxVisible)
  const feedKey = getFeedKeyForCamera(cameraId)
  const posterUrl = feedKey ? getCameraFeedPosterUrl(feedKey) : undefined
  const overlayDisabled = isAiOverlayDisabledCamera(cameraId)
  const roadAnalysis = isRoadAnalysisOverlayCamera(cameraId)
  const craneProximity = isCraneProximityCamera(cameraId)
  const ppeAnalysis = isPpeCamera(cameraId)
  const pcccAnalysis = isPcccCamera(cameraId)
  const wahAnalysis = isWahCamera(cameraId)
  const atgtAnalysis = isAtgtCamera(cameraId)
  const faceDemo = isFaceOverlayCamera(cameraId)
  const videoFit = getVideoObjectFitForCamera(cameraId, streamType)
  const showFaceOverlay = Boolean(
    overlayActive && feedKey && faceDemo && !roadAnalysis && !craneProximity && !ppeAnalysis && !pcccAnalysis && !wahAnalysis && !atgtAnalysis && !overlayDisabled,
  )
  const showRoadOverlay = Boolean(overlayActive && roadAnalysis && !overlayDisabled)
  const showCraneOverlay = Boolean(overlayActive && craneProximity && !overlayDisabled)
  const showPpeOverlay = Boolean(overlayActive && ppeAnalysis && !overlayDisabled)
  const showPcccOverlay = Boolean(overlayActive && pcccAnalysis && !overlayDisabled)
  const showWahOverlay = Boolean(overlayActive && wahAnalysis && !overlayDisabled)
  const showAtgtOverlay = Boolean(overlayActive && atgtAnalysis && !overlayDisabled)
  const showAnySafetyOverlay = showCraneOverlay || showPpeOverlay || showPcccOverlay || showWahOverlay || showAtgtOverlay

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
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        video.load()
        tryPlay()
      }
    }

    const onError = () => {
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
  }, [src, playing, isDesktop, streamIndex])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl}
        autoPlay
        muted
        loop
        playsInline
        crossOrigin="anonymous"
        preload={playing ? (isDesktop ? 'auto' : 'metadata') : 'none'}
        className={cn(
          'absolute inset-0 h-full w-full',
          videoFit === 'contain' ? 'object-contain bg-black' : 'object-cover',
          'saturate-[0.82] contrast-[1.06] brightness-[0.9]',
        )}
      />
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
            enabled={playing && overlayActive}
          />
        )}
        {showPpeOverlay && (
          <PpeOverlay
            cameraId={cameraId}
            compact={compact}
            videoRef={videoRef}
            videoFit={videoFit}
            enabled={playing && overlayActive}
          />
        )}
        {showPcccOverlay && (
          <PcccOverlay
            cameraId={cameraId}
            compact={compact}
            videoRef={videoRef}
            enabled={playing && overlayActive}
          />
        )}
        {showWahOverlay && (
          <WahOverlay
            cameraId={cameraId}
            compact={compact}
            videoRef={videoRef}
            videoFit={videoFit}
            enabled={playing && overlayActive}
          />
        )}
        {showAtgtOverlay && (
          <AtgtOverlay
            cameraId={cameraId}
            compact={compact}
            videoRef={videoRef}
            videoFit={videoFit}
            enabled={playing && overlayActive}
          />
        )}
      </OverlayCycleProvider>
    </div>
  )
}
