/**
 * Chấm bản đồ tuần tra — 1 chấm / qualified presence tại GPS thật.
 */
import type { DetectionDot } from '../data/patrolDetectionData'
import type { PatrolEvent } from '../data/patrolTypes'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'
import { isPatrolHelmetCameraId } from '../data/patrolHelmetScope'
import type { PatrolFlightMode } from './patrolFlightMode'
import { isPatrolHelmetLikeCamera } from './patrolFlightMode'
import { isPatrolDroneCameraId } from '../data/patrolDrones'
import { clampPointToSiteInterior } from '../data/patrolSiteGeometry'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'
import { resolvePatrolDetectionMapPosition } from './patrolDetectionMapOffset'
import { isPatrolHeatmapEligibleEvent } from './patrolPatrolCounts'
import {
  resolvePatrolAppearanceSubjectId,
  resolvePatrolPersonStage,
} from './patrolWorkforceEventLabels'

/** Coi là "đang quan sát" nếu endedAt trong khoảng này (ms). */
export const PATROL_LIVE_RECENT_MS = 120_000

function isValidGps(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function presencePosition(
  presence: PatrolDayPresence,
  helmetPositions?: Record<string, [number, number]>,
  helmetHeadings?: Record<string, number | null | undefined>,
): [number, number] {
  const { gpsLat, gpsLng, subjectId, cameraId } = presence
  const primaryCam = cameraId || presence.sourceCameras[0] || ''
  const helmetPos = primaryCam ? helmetPositions?.[primaryCam] : undefined
  const heading = primaryCam ? helmetHeadings?.[primaryCam] : undefined

  if (isValidGps(gpsLat, gpsLng)) {
    return resolvePatrolDetectionMapPosition(
      gpsLat!,
      gpsLng!,
      subjectId,
      helmetPos,
      heading,
    )
  }

  if (helmetPos) {
    return resolvePatrolDetectionMapPosition(
      helmetPos[0],
      helmetPos[1],
      subjectId,
      helmetPos,
      heading,
    )
  }

  return clampPointToSiteInterior(PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1])
}

function isCameraOnlineForHeatmap(
  cameraId: string,
  onlineById?: Record<string, boolean>,
): boolean {
  return Boolean(cameraId && onlineById?.[cameraId])
}

function tierVerified(tier: PatrolDayPresence['tier']): boolean {
  return tier === 'identity'
}

function tierEligibleStandard(tier: PatrolDayPresence['tier']): boolean {
  return tier === 'person' || tier === 'identity'
}

export function filterRecentPresences(
  presences: PatrolDayPresence[],
  now = Date.now(),
  windowMs = PATROL_LIVE_RECENT_MS,
): PatrolDayPresence[] {
  return presences.filter(p => {
    const ts = p.endedAt * 1000
    if (!Number.isFinite(ts)) return false
    return now - ts <= windowMs
  })
}

/** Một chấm / qualified presence — GPS trong polygon công trường. */
export function buildPatrolPresenceHeatmapDots(
  presences: PatrolDayPresence[],
  opts?: {
    liveOnly?: boolean
    now?: number
    includeUnassigned?: boolean
    cameraOnlineById?: Record<string, boolean>
    helmetPositionsById?: Record<string, [number, number]>
    helmetHeadingsById?: Record<string, number | null | undefined>
    flightModeByCamera?: Record<string, PatrolFlightMode | string | null | undefined>
  },
): DetectionDot[] {
  const now = opts?.now ?? Date.now()
  let scoped = opts?.liveOnly ? filterRecentPresences(presences, now) : presences

  if (!opts?.includeUnassigned) {
    scoped = scoped.filter(p => tierEligibleStandard(p.tier))
  }

  return scoped.map(presence => {
    const lastSeen = presence.endedAt * 1000
    const recent = now - lastSeen <= PATROL_LIVE_RECENT_MS
    const primaryCam = presence.cameraId || presence.sourceCameras[0] || ''
    const cameraOnline = isCameraOnlineForHeatmap(primaryCam, opts?.cameraOnlineById)
    const inCameraView = recent && cameraOnline
    const helmetLike = isPatrolHelmetLikeCamera(
      primaryCam,
      opts?.flightModeByCamera?.[primaryCam],
    )
    const [lat, lng] = presencePosition(
      presence,
      opts?.helmetPositionsById,
      opts?.helmetHeadingsById,
    )

    return {
      id: `presence-${presence.id}`,
      type: 'person',
      position: [lat, lng],
      zoneId: presence.zoneId || 'ZONE_SITE',
      cameraId: primaryCam,
      confidence: 1,
      label: `${presence.displayName} · L#${presence.presenceSeq}`,
      lastSeenAt: lastSeen,
      objectId: presence.subjectId,
      tier: presence.tier,
      verified: helmetLike ? tierVerified(presence.tier) : false,
      inCameraView,
      opacity: presence.tier === 'object'
        ? (inCameraView ? 0.55 : 0.35)
        : (inCameraView ? 0.92 : 0.45),
    }
  })
}

export interface PatrolHeatmapDeviceLayers {
  helmet: boolean
  flycam: boolean
}

/** Chấm người theo thiết bị — không còn layer "Người" tách rời trên bản đồ. */
export function filterPatrolHeatmapDotsByDevice(
  dots: DetectionDot[],
  layers: PatrolHeatmapDeviceLayers,
): DetectionDot[] {
  if (!layers.helmet && !layers.flycam) return []
  return dots.filter(dot => {
    const cam = (dot.cameraId || '').trim()
    if (layers.flycam && isPatrolDroneCameraId(cam)) return true
    if (layers.helmet && (isPatrolHelmetCameraId(cam) || !cam)) return true
    return false
  })
}

/** Legacy — lọc events theo lastSeen (panel live window). */
export function filterRecentPatrolWorkerEvents(
  events: PatrolEvent[],
  now = Date.now(),
  windowMs = PATROL_LIVE_RECENT_MS,
): PatrolEvent[] {
  return events.filter(event => {
    const ts = Date.parse(event.lockedAt)
    if (!Number.isFinite(ts)) return false
    return now - ts <= windowMs
  })
}

/**
 * @deprecated Hash dots — chỉ fallback khi chưa có presences API.
 * Ưu tiên buildPatrolPresenceHeatmapDots.
 */
export function buildPatrolDayHeatmapDots(
  events: PatrolEvent[],
  opts?: {
    liveOnly?: boolean
    now?: number
    cameraOnlineById?: Record<string, boolean>
  },
): DetectionDot[] {
  const now = opts?.now ?? Date.now()
  const scoped = opts?.liveOnly
    ? filterRecentPatrolWorkerEvents(events, now)
    : events

  const byMaster = new Map<string, DetectionDot>()

  for (const event of scoped) {
    if (!isPatrolHeatmapEligibleEvent(event)) continue
    const subjectId = resolvePatrolAppearanceSubjectId(event)
    if (!subjectId) continue

    const lastSeen = Date.parse(event.lockedAt) || now
    const recent = now - lastSeen <= PATROL_LIVE_RECENT_MS
    const cameraOnline = isCameraOnlineForHeatmap(event.cameraId || '', opts?.cameraOnlineById)
    const inCameraView = recent && cameraOnline
    const stage = resolvePatrolPersonStage(event)
    const tier: PatrolDayPresence['tier'] = stage === 'profile'
      ? 'identity'
      : stage === 'person'
        ? 'person'
        : 'object'
    const master = subjectId.toLowerCase()
    const prev = byMaster.get(master)
    if (prev && (prev.lastSeenAt ?? 0) >= lastSeen) continue

    const [lat, lng] = clampPointToSiteInterior(PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1])
    byMaster.set(master, {
      id: `day-${master}`,
      type: 'person',
      position: [lat, lng],
      zoneId: event.zoneId || 'ZONE_SITE',
      cameraId: event.cameraId || '',
      confidence: event.confidence,
      label: event.objectLabel?.trim() || event.violationLabel?.trim() || master,
      lastSeenAt: lastSeen,
      objectId: master,
      tier,
      verified: stage === 'profile',
      inCameraView,
      opacity: inCameraView ? 0.92 : 0.45,
    })
  }

  return [...byMaster.values()]
}
