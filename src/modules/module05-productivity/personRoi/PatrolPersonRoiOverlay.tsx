/**
 * Patrol Person ROI overlay — Kalman + ByteTrack-lite (Module 05).
 * Không dùng ATLĐ bboxTrackLock / ROI cycle / sticky violation.
 */
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapBackendBboxToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import { useOverlayLayoutTick } from '@/modules/module03-safety/hooks/useOverlayLayoutTick'
import { passesOverlayConfidence } from '@/modules/module03-safety/utils/overlayCoverage'
import { PATROL_TIER_RANK, patrolTierToken } from '../utils/patrolTierTokens'
import { PATROL_PERSON_ROI_CONFIG } from './patrolPersonRoi.config'
import { resolvePatrolRoiDisplayLabel } from './resolvePatrolRoiDisplayLabel'
import { usePatrolPersonRoiTracks } from './usePatrolPersonRoiTracks'
import type { PersonRoiDisplay } from './types'

interface PatrolPersonRoiOverlayProps {
  cameraId: string
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit?: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
}

const PersonRoiBox = memo(function PersonRoiBox({
  track,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit = 'cover',
  videoObjectPosition = 'center',
  layoutTick,
}: {
  track: PersonRoiDisplay
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  layoutTick: number
}) {
  const justPromoted = useTierPromotionFlash(track.tier)

  const video = videoRef.current
  // layoutTick buộc tính lại khi video load metadata / resize / object-fit đổi.
  void layoutTick
  if (!video?.videoWidth || !video.videoHeight || frameWidth <= 0 || frameHeight <= 0) {
    return null
  }
  // HC-* person YOLO 0.35–0.65 — không dùng OVERLAY_MIN_CONFIDENCE (0.70) của PPE/vi phạm.
  if (!passesOverlayConfidence(track.confidence, PATROL_PERSON_ROI_CONFIG.birthMinConfidence)) {
    return null
  }

  // Patrol ROI — Kalman + EMA trên bbox display từ BE (YOLO gốc + mở rộng nếu cần).
  const box = mapBackendBboxToOverlay(
    track.bbox,
    frameWidth,
    frameHeight,
    video,
    videoFit,
    videoObjectPosition,
  )
  if (box.w <= 0.5 || box.h <= 0.5) return null

  const tierToken = patrolTierToken(track.tier)
  const displayLabel = resolvePatrolRoiDisplayLabel(track)
  const badge = `${displayLabel}${track.confidence > 0 ? ` ${Math.round(track.confidence * 100)}%` : ''}`
  const opacity = track.displayOpacity ?? (track.state === 'lost' ? 0.72 : 1)

  return (
    <div
      className="absolute pointer-events-none will-change-transform"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: 8,
        opacity,
        transform: 'translateZ(0)',
      }}
      data-track-id={track.trackId}
      data-person-id={track.personId}
      data-tier={track.tier}
    >
      <div
        className={cn(
          'absolute inset-0 rounded-sm transition-colors duration-300',
          tierToken.roiBorder,
          // Vừa thăng tầng — quầng sáng ngắn để người trực nhìn thấy đúng lúc
          // một Đối tượng vừa thành Người / vừa được định danh.
          justPromoted && 'ring-2 ring-white/70 ring-offset-0',
        )}
      />
      <span
        className={cn(
          'absolute -top-3 left-0 px-1 py-px font-mono whitespace-nowrap rounded-sm',
          'transition-colors duration-300',
          tierToken.roiLabelBg,
          tierToken.roiLabelText,
          compact ? 'text-[5px]' : 'text-[7px]',
        )}
      >
        {badge}
      </span>
    </div>
  )
})

/** Bật cờ trong ~1.2s ngay sau khi track lên tầng cao hơn. */
function useTierPromotionFlash(tier: PersonRoiDisplay['tier']): boolean {
  const previousTier = useRef(tier)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const before = previousTier.current
    previousTier.current = tier
    if (before === tier) return
    if (PATROL_TIER_RANK[tier] <= PATROL_TIER_RANK[before]) return

    setFlash(true)
    const timer = window.setTimeout(() => setFlash(false), 1200)
    return () => window.clearTimeout(timer)
  }, [tier])

  return flash
}

export function PatrolPersonRoiOverlay({
  cameraId,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit = 'cover',
  videoObjectPosition = 'center',
}: PatrolPersonRoiOverlayProps) {
  const tracks = usePatrolPersonRoiTracks(cameraId)
  const layoutTick = useOverlayLayoutTick(videoRef)
  const overlayFrameSize = useMemo(() => {
    if (frameWidth > 0 && frameHeight > 0) {
      return { width: frameWidth, height: frameHeight }
    }
    const video = videoRef.current
    if (video?.videoWidth && video.videoHeight) {
      return { width: video.videoWidth, height: video.videoHeight }
    }
    return { width: 0, height: 0 }
  }, [frameWidth, frameHeight, videoRef, layoutTick])

  if (tracks.length === 0 || overlayFrameSize.width <= 0 || overlayFrameSize.height <= 0) {
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[9]">
      {tracks.map(track => (
        <PersonRoiBox
          key={`${track.trackId}-${layoutTick}`}
          track={track}
          frameWidth={overlayFrameSize.width}
          frameHeight={overlayFrameSize.height}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
          layoutTick={layoutTick}
        />
      ))}
    </div>
  )
}
