/**
 * Chấm bản đồ tuần tra — 1 chấm / định danh (entity), gộp nhiều lượt L# cùng người.
 * Ba tầng: Đối tượng (obj-*) · Người · Định danh — cần includeUnassigned cho obj.
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
import { resolveDetectionDotTier } from './patrolDetectionDotUi'
import { isPatrolHeatmapEligibleEvent } from './patrolPatrolCounts'
import {
  resolvePatrolCanonicalEntityKey,
  resolvePatrolProfileEntityKey,
} from './patrolIdentityEntity'
import { higherPatrolTier } from './patrolTierTokens'
import {
  getPatrolManualIdentityForSgc,
  isPatrolManuallyIdentified,
} from '../services/patrolManualIdentity.service'
import {
  resolvePatrolAppearanceSubjectId,
  resolvePatrolPersonStage,
} from './patrolWorkforceEventLabels'

/** Coi là "đang quan sát" nếu endedAt trong khoảng này (ms). */
export const PATROL_LIVE_RECENT_MS = 120_000

function isValidGps(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function resolvePresenceGps(presence: PatrolDayPresence): { lat: number | null; lng: number | null } {
  const endLat = presence.gpsLatEnd
  const endLng = presence.gpsLngEnd
  if (isValidGps(endLat, endLng)) {
    return { lat: endLat!, lng: endLng! }
  }
  return { lat: presence.gpsLat, lng: presence.gpsLng }
}

function presencePosition(
  presence: PatrolDayPresence,
  helmetPositions?: Record<string, [number, number]>,
  helmetHeadings?: Record<string, number | null | undefined>,
): [number, number] {
  const { lat, lng } = resolvePresenceGps(presence)
  const { cameraId, id: presenceId } = presence
  const offsetSeed = `presence-${presenceId}`
  const primaryCam = cameraId || presence.sourceCameras[0] || ''
  const helmetPos = primaryCam ? helmetPositions?.[primaryCam] : undefined
  const heading = primaryCam ? helmetHeadings?.[primaryCam] : undefined

  if (isValidGps(lat, lng)) {
    return resolvePatrolDetectionMapPosition(
      lat!,
      lng!,
      offsetSeed,
      helmetPos,
      heading,
    )
  }

  if (helmetPos) {
    return resolvePatrolDetectionMapPosition(
      helmetPos[0],
      helmetPos[1],
      offsetSeed,
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

function tierEligibleStandard(tier: PatrolDayPresence['tier']): boolean {
  return tier === 'person' || tier === 'identity'
}

function isObjectTierPresence(presence: PatrolDayPresence): boolean {
  return presence.tier === 'object'
}

/** Đối tượng (obj-*) — không lọc live/count như người; đồng bộ KPI unassigned. */
function scopePresencesForHeatmap(
  presences: PatrolDayPresence[],
  opts: {
    liveOnly?: boolean
    countedOnly?: boolean
    includeUnassigned?: boolean
    now: number
  },
): PatrolDayPresence[] {
  let scoped = presences

  if (opts.liveOnly) {
    if (opts.includeUnassigned) {
      scoped = presences.filter(
        p => isObjectTierPresence(p) || filterRecentPresences([p], opts.now).length > 0,
      )
    } else {
      scoped = filterRecentPresences(presences, opts.now)
    }
  }

  scoped = collapsePresencesBySession(scoped)

  if (opts.countedOnly) {
    scoped = scoped.filter(p => p.counted === true)
  }

  if (!opts.includeUnassigned) {
    scoped = scoped.filter(p => tierEligibleStandard(p.tier))
  }

  return scoped
}

/** Đồng bộ màu chấm với tab sự kiện — gồm định danh thủ công/gallery. */
function resolvePresenceHeatmapTier(
  presence: PatrolDayPresence,
  cameraId: string,
  flightMode?: PatrolFlightMode | string | null,
): Pick<DetectionDot, 'tier' | 'verified'> {
  const helmetLike = isPatrolHelmetLikeCamera(cameraId, flightMode)
  const subjectId = presence.subjectId?.trim() ?? ''
  const displayName = presence.displayName?.trim() ?? ''

  if (presence.tier === 'object') {
    return { tier: 'object', verified: false }
  }

  const profileKey = resolvePatrolProfileEntityKey({
    objectId: subjectId,
    objectLabel: displayName,
  })
  const manualIdentity = isPatrolManuallyIdentified(subjectId)
    || Boolean(getPatrolManualIdentityForSgc(subjectId))

  if (profileKey || manualIdentity || presence.tier === 'identity') {
    return { tier: 'identity', verified: helmetLike }
  }

  return { tier: 'person', verified: false }
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

/** Gộp nhiều row cùng session_id — giữ lượt mới nhất (anti-duplicate aggregator). */
export function collapsePresencesBySession(
  presences: PatrolDayPresence[],
): PatrolDayPresence[] {
  const bySession = new Map<string, PatrolDayPresence>()
  const passthrough: PatrolDayPresence[] = []
  for (const presence of presences) {
    const sid = presence.sessionId?.trim()
    if (!sid) {
      passthrough.push(presence)
      continue
    }
    const prev = bySession.get(sid)
    if (!prev || presence.endedAt >= prev.endedAt) {
      bySession.set(sid, presence)
    }
  }
  return [...bySession.values(), ...passthrough]
}

function stripPatrolHeatmapDotLabel(label?: string | null): string | undefined {
  const t = label?.trim()
  if (!t) return undefined
  const idx = t.lastIndexOf(' · L#')
  return idx > 0 ? t.slice(0, idx).trim() : t
}

/** pers-* → gallery/iden canonical — từ bundle events, không cần chờ sync alias local. */
export function buildPatrolPersEntityLookup(
  events: PatrolEvent[],
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const event of events) {
    const persMatch = event.id.match(/^pers:(.+)$/i)
    if (!persMatch) continue
    const persId = persMatch[1].trim().toLowerCase()
    if (!persId) continue
    const canonical = resolvePatrolCanonicalEntityKey(event).toLowerCase()
    if (canonical && canonical !== persId) {
      map[persId] = canonical
    }
  }
  return map
}

function resolvePresenceEntityKey(
  presence: PatrolDayPresence,
  persEntityLookup?: Record<string, string>,
): string {
  const subject = presence.subjectId.trim()
  const mapped = persEntityLookup?.[subject.toLowerCase()]
  if (mapped) return mapped
  return resolvePatrolCanonicalEntityKey({
    objectId: subject,
    objectLabel: presence.displayName,
  }).toLowerCase()
}

function shouldReplacePresenceDot(prev: DetectionDot, next: DetectionDot): boolean {
  const prevSeen = prev.lastSeenAt ?? 0
  const nextSeen = next.lastSeenAt ?? 0
  if (nextSeen > prevSeen) return true
  if (nextSeen < prevSeen) return false
  const prevTier = resolveDetectionDotTier(prev)
  const nextTier = resolveDetectionDotTier(next)
  return higherPatrolTier(nextTier, prevTier) !== prevTier
}

/** Một chấm / định danh (entity) — gộp nhiều lượt L# cùng người, GPS lượt mới nhất. */
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
    /** pers-* → gallery từ bundle — gộp presence với registry trước khi alias local sync. */
    persEntityLookup?: Record<string, string>
    /** Chỉ hiển thị lượt đã qua tripwire (counted=1) — đồng bộ KPI encounters_standard. */
    countedOnly?: boolean
  },
): DetectionDot[] {
  const now = opts?.now ?? Date.now()
  const scoped = scopePresencesForHeatmap(presences, {
    liveOnly: opts?.liveOnly,
    countedOnly: opts?.countedOnly,
    includeUnassigned: opts?.includeUnassigned,
    now,
  })

  const byEntity = new Map<string, DetectionDot>()

  for (const presence of scoped) {
    const lastSeen = presence.endedAt * 1000
    const recent = now - lastSeen <= PATROL_LIVE_RECENT_MS
    const primaryCam = presence.cameraId || presence.sourceCameras[0] || ''
    const cameraOnline = isCameraOnlineForHeatmap(primaryCam, opts?.cameraOnlineById)
    const inCameraView = recent && cameraOnline
    const [lat, lng] = presencePosition(
      presence,
      opts?.helmetPositionsById,
      opts?.helmetHeadingsById,
    )
    const { tier, verified } = resolvePresenceHeatmapTier(
      presence,
      primaryCam,
      opts?.flightModeByCamera?.[primaryCam],
    )
    const entityKey = resolvePresenceEntityKey(presence, opts?.persEntityLookup)

    const dot: DetectionDot = {
      id: `entity-${entityKey}`,
      type: 'person',
      position: [lat, lng],
      zoneId: presence.zoneId || 'ZONE_SITE',
      cameraId: primaryCam,
      confidence: 1,
      label: `${presence.displayName} · L#${presence.presenceSeq}`,
      lastSeenAt: lastSeen,
      objectId: entityKey,
      tier,
      verified,
      inCameraView,
      opacity: tier === 'object'
        ? (inCameraView ? 0.55 : 0.35)
        : (inCameraView ? 0.92 : 0.45),
      presenceId: presence.id,
      presenceSeq: presence.presenceSeq,
    }

    const prev = byEntity.get(entityKey)
    if (prev && !shouldReplacePresenceDot(prev, dot)) continue
    byEntity.set(entityKey, dot)
  }

  return [...byEntity.values()]
}

export interface PatrolHeatmapDeviceLayers {
  helmet: boolean
  flycam: boolean
}

/** Khóa gộp chấm — cùng logic dedup presence/registry (gallery thắng sgc/pers). */
function resolveHeatmapDotMergeKey(
  dot: DetectionDot,
  persEntityLookup?: Record<string, string>,
): string {
  const oid = dot.objectId?.trim()
  const label = stripPatrolHeatmapDotLabel(dot.label)
  if (oid) {
    const mapped = persEntityLookup?.[oid.toLowerCase()]
    if (mapped) return mapped
    return resolvePatrolCanonicalEntityKey({ objectId: oid, objectLabel: label }).toLowerCase()
  }
  const entityId = dot.id.match(/^entity-(.+)$/i)?.[1]
  if (entityId) return entityId.toLowerCase()
  const pinId = dot.id.match(/^pin-(.+)$/i)?.[1]
  if (pinId) {
    const mapped = persEntityLookup?.[pinId.toLowerCase()]
    if (mapped) return mapped
    return resolvePatrolCanonicalEntityKey({ objectId: pinId, objectLabel: label }).toLowerCase()
  }
  return dot.id.toLowerCase()
}

/** Gộp nhiều nguồn chấm — ưu tiên inCameraView rồi lastSeenAt mới hơn. */
export function mergePatrolHeatmapDetectionDots(
  groups: DetectionDot[][],
  opts?: { persEntityLookup?: Record<string, string> },
): DetectionDot[] {
  const byKey = new Map<string, DetectionDot>()
  for (const group of groups) {
    for (const dot of group) {
      const key = resolveHeatmapDotMergeKey(dot, opts?.persEntityLookup)
      const prev = byKey.get(key)
      if (!prev) {
        byKey.set(key, dot)
        continue
      }
      const prevTs = prev.lastSeenAt ?? 0
      const nextTs = dot.lastSeenAt ?? 0
      const preferNext = (dot.inCameraView && !prev.inCameraView)
        || (Boolean(dot.inCameraView) === Boolean(prev.inCameraView) && nextTs >= prevTs)
      if (preferNext) byKey.set(key, dot)
    }
  }
  return [...byKey.values()]
}

/** Chấm người theo thiết bị — khi cả hai tắt vẫn giữ chấm (layer Mật độ điều khiển hiển thị). */
export function filterPatrolHeatmapDotsByDevice(
  dots: DetectionDot[],
  layers: PatrolHeatmapDeviceLayers,
): DetectionDot[] {
  if (!layers.helmet && !layers.flycam) return dots
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
