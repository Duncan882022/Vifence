import { useEffect, useRef } from 'react'
import { cn } from '@/utils/cn'
import { CameraAiOverlay } from './CameraAiOverlay'
import { CraneProximityOverlay } from '@/modules/module03-safety/components/CraneProximityOverlay'
import { PpeOverlay } from '@/modules/module03-safety/components/PpeOverlay'
import { isCraneProximityCamera } from '@/modules/module03-safety/data/craneProximityCameras'
import { isPpeCamera } from '@/modules/module03-safety/data/ppeCameras'
import { RoadAnalysisOverlay } from '@/modules/module04-housekeeping/components/RoadAnalysisOverlay'
import {
  isAiOverlayDisabledCamera,
  isRoadAnalysisOverlayCamera,
} from '@/modules/module04-housekeeping/data/roadAnalysisCameras'
import { getFeedKeyForCamera, getVideoObjectFitForCamera } from '../data/trainingCameraFeeds'

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
  const feedKey = getFeedKeyForCamera(cameraId)
  const overlayDisabled = isAiOverlayDisabledCamera(cameraId)
  const roadAnalysis = isRoadAnalysisOverlayCamera(cameraId)
  const craneProximity = isCraneProximityCamera(cameraId)
  const ppeAnalysis = isPpeCamera(cameraId)
  const videoFit = getVideoObjectFitForCamera(cameraId, streamType)
  const showFaceOverlay = Boolean(aiOverlay && feedKey && !roadAnalysis && !craneProximity && !ppeAnalysis && !overlayDisabled)
  const showRoadOverlay = Boolean(aiOverlay && roadAnalysis && !overlayDisabled)
  const showCraneOverlay = Boolean(aiOverlay && craneProximity && !overlayDisabled)
  const showPpeOverlay = Boolean(aiOverlay && ppeAnalysis && !overlayDisabled)

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
          enabled={playing && aiOverlay}
        />
      )}
      {showRoadOverlay && (
        <RoadAnalysisOverlay
          cameraId={cameraId}
          compact={compact}
          videoRef={videoRef}
          videoFit={videoFit}
          enabled={playing && aiOverlay}
        />
      )}
      {showCraneOverlay && (
        <CraneProximityOverlay
          cameraId={cameraId}
          compact={compact}
          videoRef={videoRef}
          videoFit={videoFit}
          enabled={playing && aiOverlay}
        />
      )}
      {showPpeOverlay && (
        <PpeOverlay
          cameraId={cameraId}
          compact={compact}
          videoRef={videoRef}
          videoFit={videoFit}
          enabled={playing && aiOverlay}
        />
      )}
    </div>
  )
}
