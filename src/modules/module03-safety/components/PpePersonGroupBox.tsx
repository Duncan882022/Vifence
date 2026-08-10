import { memo, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapBackendBboxToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import type { PpeDetection } from '../services/ppeBackend.service'
import { formatRoiOverlayBadge, formatRoiOverlayCode } from '../utils/roiOverlayCode'
import { getOverlayBoxStyle } from '../utils/roiBoxRole'
import {
  bboxToRelativeInner,
  derivePpeSlotBbox,
  groupHasViolation,
  resolvePpeSlotBbox,
  slotDetection,
  type PpeBodySlot,
  type PpePersonGroup,
} from '../utils/ppeDetectionGroups'
import { mapRelativeInnerToOverlay, type MappedOverlayBox } from '../utils/roiGroupOverlay'
import { shouldShowOverlayBox } from '../utils/overlayCoverage'

const BODY_SLOTS: PpeBodySlot[] = ['head', 'torso', 'feet']

interface PpePersonGroupBoxProps {
  group: PpePersonGroup
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
}

function mapOuterBox(
  bbox: PpeDetection['bbox'],
  frameWidth: number,
  frameHeight: number,
  videoRef: RefObject<HTMLVideoElement | null>,
  videoFit: 'cover' | 'contain',
  videoObjectPosition: 'center' | 'bottom',
): MappedOverlayBox | null {
  const video = videoRef.current
  if (!video?.videoWidth || !video.videoHeight || frameWidth <= 0 || frameHeight <= 0) {
    return null
  }
  const box = mapBackendBboxToOverlay(
    bbox,
    frameWidth,
    frameHeight,
    video,
    videoFit,
    videoObjectPosition,
  )
  if (box.w <= 0.5 || box.h <= 0.5) return null
  return box
}

const SlotBox = memo(function SlotBox({
  det,
  relative,
  outer,
  compact,
}: {
  det: PpeDetection
  relative: { x: number; y: number; w: number; h: number }
  outer: MappedOverlayBox
  compact?: boolean
}) {
  const inner = mapRelativeInnerToOverlay(relative, outer)
  const style = getOverlayBoxStyle('ppe', det.behavior)
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${inner.x}%`,
        top: `${inner.y}%`,
        width: `${inner.w}%`,
        height: `${inner.h}%`,
      }}
    >
      <div className={cn('absolute inset-0 rounded-sm', style.border, style.fill)} />
      <span
        className={cn(
          'absolute -top-2.5 left-0 px-0.5 py-px font-mono whitespace-nowrap rounded-sm',
          style.bg,
          style.label,
          compact ? 'text-[5px]' : 'text-[6px]',
        )}
      >
        {formatRoiOverlayBadge(
          formatRoiOverlayCode(det.behavior, det.scenario_id),
          det.confidence,
        )}
      </span>
    </div>
  )
})

export const PpePersonGroupBox = memo(function PpePersonGroupBox({
  group,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit,
  videoObjectPosition = 'center',
}: PpePersonGroupBoxProps) {
  if (!shouldShowOverlayBox(group.person.confidence, group.person.bbox)) {
    return null
  }

  const outer = mapOuterBox(
    group.person.bbox,
    frameWidth,
    frameHeight,
    videoRef,
    videoFit,
    videoObjectPosition,
  )
  if (!outer) return null

  const hasViolation = groupHasViolation(group)
  const outerStyle = getOverlayBoxStyle(
    'ppe',
    hasViolation ? 'no_helmet' : 'person',
  )

  const visibleSlots: Array<{
    key: string
    det: PpeDetection
    relative: { x: number; y: number; w: number; h: number }
  }> = []

  for (const slot of BODY_SLOTS) {
    if (slot === 'feet') {
      group.slots.feet.forEach((footDet, footIndex) => {
        const expected = derivePpeSlotBbox(group.person.bbox, 'feet')
        if (!shouldShowOverlayBox(footDet.confidence, footDet.bbox, expected)) return
        const slotBbox = resolvePpeSlotBbox(group, 'feet', footIndex)
        visibleSlots.push({
          key: `feet-${footIndex}`,
          det: footDet,
          relative: bboxToRelativeInner(slotBbox, group.person.bbox),
        })
      })
      continue
    }

    const det = slotDetection(group, slot)
    if (!det) continue
    const expected = derivePpeSlotBbox(group.person.bbox, slot)
    if (!shouldShowOverlayBox(det.confidence, det.bbox, expected)) continue
    const slotBbox = resolvePpeSlotBbox(group, slot)
    visibleSlots.push({
      key: slot,
      det,
      relative: bboxToRelativeInner(slotBbox, group.person.bbox),
    })
  }

  if (!hasViolation && visibleSlots.length === 0) {
    return null
  }

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${outer.x}%`,
        top: `${outer.y}%`,
        width: `${outer.w}%`,
        height: `${outer.h}%`,
        zIndex: hasViolation ? 8 : 6,
      }}
    >
      <div className={cn('absolute inset-0 rounded-sm', outerStyle.border, outerStyle.fill)} />
      {visibleSlots.map(slot => (
        <SlotBox
          key={slot.key}
          det={slot.det}
          relative={slot.relative}
          outer={{ x: 0, y: 0, w: 100, h: 100 }}
          compact={compact}
        />
      ))}
      {hasViolation && visibleSlots.length === 0 && (
        <span
          className={cn(
            'absolute -top-3 left-0 px-0.5 py-px font-mono whitespace-nowrap rounded-sm',
            outerStyle.bg,
            outerStyle.label,
            compact ? 'text-[5px]' : 'text-[7px]',
          )}
        >
          PPE
        </span>
      )}
    </div>
  )
})
