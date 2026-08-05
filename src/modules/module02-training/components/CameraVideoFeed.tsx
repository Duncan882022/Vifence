import { useEffect, useRef } from 'react'
import { cn } from '@/utils/cn'
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
import { getFeedKeyForCamera, getVideoObjectFitForCamera } from '../data/trainingCameraFeeds'
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
}

export function CameraVideoFeed({
  cameraId,
  streamType = 'fixed',
  src,
  playing = true,
  aiOverlay = false,
  compact,
}: CameraVideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [bboxVisible] = useCameraBboxVisible(cameraId)
  useCameraAiEnabledModels(cameraId)
  const overlayActive = Boolean(aiOverlay && bboxVisible)
  const feedKey = getFeedKeyForCamera(cameraId)
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

    let visible = true

    const tryPlay = () => {
      if (!playing || !visible) {
        video.pause()
        return
      }
      video.muted = true
      video.play().catch(() => {})
    }

    const observer = new IntersectionObserver(
      entries => {
        visible = entries.some(e => e.isIntersecting)
        tryPlay()
      },
      { threshold: 0.08 },
    )
    observer.observe(video)

    video.addEventListener('canplay', tryPlay)
    video.addEventListener('loadeddata', tryPlay)
    tryPlay()

    return () => {
      observer.disconnect()
      video.removeEventListener('canplay', tryPlay)
      video.removeEventListener('loadeddata', tryPlay)
      video.pause()
    }
  }, [src, playing])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload={playing ? 'auto' : 'metadata'}
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
