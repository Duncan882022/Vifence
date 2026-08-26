/**
 * Chấm bản đồ tuần tra — đọc từ thẻ SQLite trong ngày (pers-* / iden-*).
 * Không dùng session registry sgc-* (tích lũy track đứt → dot thừa).
 */
import type { DetectionDot } from '../data/patrolDetectionData'
import type { PatrolEvent } from '../data/patrolMockData'
import { clampPointToSiteInterior } from '../data/patrolSiteGeometry'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'
import { offsetLatLngByMeters } from './patrolLivePersonDots'
import { isPatrolHeatmapEligibleEvent } from './patrolPatrolCounts'
import {
  resolvePatrolAppearanceSubjectId,
  resolvePatrolPersonStage,
} from './patrolWorkforceEventLabels'

/** Coi là "đang quan sát" nếu lastSeen trong khoảng này (ms). */
export const PATROL_LIVE_RECENT_MS = 120_000

const DOT_RADIUS_MIN_M = 1.0
const DOT_RADIUS_MAX_M = 4.0

function hashOffset(personId: string): [number, number] {
  let h = 2166136261
  for (let i = 0; i < personId.length; i++) {
    h ^= personId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const angle = ((h >>> 0) % 360) * (Math.PI / 180)
  const ring = ((h >>> 8) % 100) / 100
  const r = DOT_RADIUS_MIN_M + ring * (DOT_RADIUS_MAX_M - DOT_RADIUS_MIN_M)
  return [Math.cos(angle) * r, Math.sin(angle) * r]
}

function dotPosition(personId: string): [number, number] {
  const [eastM, northM] = hashOffset(personId)
  const [lat, lng] = offsetLatLngByMeters(
    PATROL_SITE_CENTER[0],
    PATROL_SITE_CENTER[1],
    eastM,
    northM,
  )
  return clampPointToSiteInterior(lat, lng)
}

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

function isCameraOnlineForHeatmap(
  cameraId: string,
  onlineById?: Record<string, boolean>,
): boolean {
  if (!cameraId) return false
  return Boolean(onlineById?.[cameraId])
}

/** Một chấm / pers-* (hoặc iden-* qua resolvePatrolAppearanceSubjectId). */
export function buildPatrolDayHeatmapDots(
  events: PatrolEvent[],
  opts?: {
    liveOnly?: boolean
    now?: number
    /** Chấm nhấp nháy chỉ khi camera nguồn đang online. */
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
    const master = subjectId.toLowerCase()
    const prev = byMaster.get(master)
    if (prev && (prev.lastSeenAt ?? 0) >= lastSeen) continue

    byMaster.set(master, {
      id: `day-${master}`,
      type: 'person',
      position: dotPosition(master),
      zoneId: event.zoneId || 'ZONE_SITE',
      cameraId: event.cameraId || '',
      confidence: event.confidence,
      label: event.objectLabel?.trim() || event.violationLabel?.trim() || master,
      lastSeenAt: lastSeen,
      objectId: master,
      verified: stage === 'profile',
      inCameraView,
      opacity: inCameraView ? 0.92 : 0.45,
    })
  }

  return [...byMaster.values()]
}
