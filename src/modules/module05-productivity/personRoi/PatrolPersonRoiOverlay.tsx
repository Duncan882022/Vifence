/**
 * Patrol Person ROI overlay — Kalman + ByteTrack-lite (Module 05).
 * Không dùng ATLĐ bboxTrackLock / ROI cycle / sticky violation.
 */
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapBackendBboxToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import { passesOverlayConfidence } from '@/modules/module03-safety/utils/overlayCoverage'
import { PATROL_TIER_RANK, patrolTierToken } from '../utils/patrolTierTokens'
import { PATROL_PERSON_ROI_CONFIG } from './patrolPersonRoi.config'
import {
  formatPersonOverlayBadge,
  formatPersonOverlayLabel,
} from '@/modules/module03-safety/utils/personOverlayLabel'
import { resolvePatrolObjectLabel, getPatrolManualIdentity, findPatrolIdentityByWorkerId } from '../services/patrolManualIdentity.service'
import { isPatrolGalleryWorkerId } from '../utils/patrolIdentityEntity'
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
}: {
  track: PersonRoiDisplay
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
}) {
  const justPromoted = useTierPromotionFlash(track.tier)

  const video = videoRef.current
  if (!video?.videoWidth || !video.videoHeight || frameWidth <= 0 || frameHeight <= 0) {
    return null
  }
  // HC-* person YOLO 0.35–0.65 — không dùng OVERLAY_MIN_CONFIDENCE (0.70) của PPE/vi phạm.
  if (!passesOverlayConfidence(track.confidence, PATROL_PERSON_ROI_CONFIG.birthMinConfidence)) {
    return null
  }

  // Patrol ROI — Kalman + EMA trên bbox YOLO gốc (subject_bbox). Không cắt chân/PPE.
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
  const identityKey = track.workerId?.trim() || track.personId
  const manual = getPatrolManualIdentity(identityKey)
  const wid = track.workerId?.trim() ?? ''
  const profileName = isPatrolGalleryWorkerId(wid)
    ? (
        track.workerName?.trim() && track.workerName.trim().toLowerCase() !== 'unknown'
          ? track.workerName.trim()
          : findPatrolIdentityByWorkerId(wid)?.workerName
      )
    : undefined
  const displayLabel = manual?.workerName
    ?? profileName
    ?? resolvePatrolObjectLabel(identityKey, formatPersonOverlayLabel(track.workerName, {
      workerId: track.workerId,
      workerName: profileName ?? track.workerName,
      manualDisplayName: manual?.workerName,
    }))
  const badge = formatPersonOverlayBadge(displayLabel, track.confidence, '', {
    workerId: track.workerId,
    workerName: displayLabel,
  })
  const opacity = track.displayOpacity ?? (track.state === 'lost' ? 0.72 : 1)

  return (
    <div
      className="absolute pointer-events-none will-change-[left,top,width,height,opacity]"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: 8,
        opacity,
        transition: 'opacity 120ms linear',
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

  if (tracks.length === 0 || frameWidth <= 0 || frameHeight <= 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[9]">
      {tracks.map(track => (
        <PersonRoiBox
          key={track.trackId}
          track={track}
          frameWidth={frameWidth}
          frameHeight={frameHeight}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
        />
      ))}
    </div>
  )
}
