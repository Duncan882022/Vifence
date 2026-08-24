/**
 * Patrol Person ROI overlay — Kalman + ByteTrack-lite (Module 05).
 * Không dùng ATLĐ bboxTrackLock / ROI cycle / sticky violation.
 */
import { memo, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapBackendBboxToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import { getOverlayBoxStyle } from '@/modules/module03-safety/utils/roiBoxRole'
import { passesOverlayConfidence } from '@/modules/module03-safety/utils/overlayCoverage'
import { PATROL_PERSON_ROI_CONFIG } from './patrolPersonRoi.config'
import {
  formatPersonOverlayBadge,
  formatPersonOverlayLabel,
  tightenPersonOverlayBbox,
} from '@/modules/module03-safety/utils/personOverlayLabel'
import { resolvePatrolObjectLabel, getPatrolManualIdentity } from '../services/patrolManualIdentity.service'
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
  const video = videoRef.current
  if (!video?.videoWidth || !video.videoHeight || frameWidth <= 0 || frameHeight <= 0) {
    return null
  }
  // HC-* person YOLO 0.35–0.65 — không dùng OVERLAY_MIN_CONFIDENCE (0.70) của PPE/vi phạm.
  if (!passesOverlayConfidence(track.confidence, PATROL_PERSON_ROI_CONFIG.birthMinConfidence)) {
    return null
  }

  const tightBbox = tightenPersonOverlayBbox(track.bbox, track.subjectBbox)
  const box = mapBackendBboxToOverlay(
    tightBbox,
    frameWidth,
    frameHeight,
    video,
    videoFit,
    videoObjectPosition,
  )
  if (box.w <= 0.5 || box.h <= 0.5) return null

  const style = getOverlayBoxStyle('ppe', 'person')
  const identityKey = track.workerId?.trim() || track.personId
  const manualName = getPatrolManualIdentity(identityKey)?.workerName
  const baseLabel = formatPersonOverlayLabel(track.workerName, {
    workerId: track.workerId,
    workerName: track.workerName,
    manualDisplayName: manualName,
  })
  const displayLabel = manualName ?? resolvePatrolObjectLabel(identityKey, baseLabel)
  const badge = formatPersonOverlayBadge(displayLabel, track.confidence, '', {
    workerId: track.workerId,
    workerName: displayLabel,
  })
  const opacity = track.state === 'lost' ? 0.72 : 1

  return (
    <div
      className="absolute pointer-events-none will-change-[left,top,width,height]"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: 8,
        opacity,
      }}
      data-track-id={track.trackId}
      data-person-id={track.personId}
    >
      <div className={cn('absolute inset-0 rounded-sm', style.border)} />
      <span
        className={cn(
          'absolute -top-3 left-0 px-1 py-px font-mono whitespace-nowrap rounded-sm',
          style.bg,
          style.label,
          compact ? 'text-[5px]' : 'text-[7px]',
        )}
      >
        {badge}
      </span>
    </div>
  )
})

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
