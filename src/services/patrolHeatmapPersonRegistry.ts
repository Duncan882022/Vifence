/**
 * Lịch sử chấm người trên heatmap — 1 master ID = 1 dot, quanh mũ HC-*.
 */
import type { DetectionDot } from '@/modules/module05-productivity/data/patrolDetectionData'
import {
  clampPointToSiteBoundary,
  isPointInSiteBoundary,
} from '@/modules/module05-productivity/data/patrolSiteGeometry'
import { resolvePatrolHeatmapGps } from '@/modules/module05-productivity/utils/patrolHeatmapGps'
import { offsetLatLngByMeters } from '@/modules/module05-productivity/utils/patrolLivePersonDots'
import {
  getPatrolSgcKeysForObject,
} from '@/modules/module05-productivity/services/patrolSgcObjectLink.service'

const STORAGE_KEY = 'vifence_patrol_heatmap_persons_v1'
const MAX_PERSONS = 48
/** Góc nhìn mũ ~2–3 m — người trước mũ cách vài mét, không 25 m. */
const DOT_RADIUS_MIN_M = 1.0
const DOT_RADIUS_MAX_M = 4.0
const LIVE_DOT_MS = 3_500
const HISTORY_DOT_MS = 90_000

export interface PatrolHeatmapPersonRecord {
  id: string
  label: string
  position: [number, number]
  cameraId: string
  zoneId: string
  confidence: number
  firstSeenAt: number
  lastSeenAt: number
}

const registry = new Map<string, PatrolHeatmapPersonRecord>()
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach(fn => fn())
}

/** Gộp PTR / OBJ / sgc cùng một người → một dot. */
export function resolveHeatmapDotMasterId(rawId: string): string {
  const id = rawId.trim()
  if (!id) return id
  if (/^sgc-/i.test(id)) return id.toUpperCase()
  if (/^OBJ-/i.test(id)) {
    const sgcs = getPatrolSgcKeysForObject(id)
    if (sgcs[0]) return sgcs[0].toUpperCase()
    return id
  }
  return id
}

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

function persist(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const rows = [...registry.values()].slice(0, MAX_PERSONS)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    // quota / private mode
  }
}

function restore(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const rows = JSON.parse(raw) as PatrolHeatmapPersonRecord[]
    registry.clear()
    for (const row of rows) {
      if (!row?.id || !row.position?.length) continue
      const master = resolveHeatmapDotMasterId(row.id)
      registry.set(master, { ...row, id: master })
    }
  } catch {
    registry.clear()
  }
}

restore()

function positionForPerson(
  personId: string,
  lat: number,
  lng: number,
): [number, number] {
  const [eastM, northM] = hashOffset(personId)
  const [lat2, lng2] = offsetLatLngByMeters(lat, lng, eastM, northM)
  return clampPointToSiteBoundary(lat2, lng2)
}

export function upsertHeatmapPersons(input: {
  cameraId: string
  lat: number
  lng: number
  zoneId?: string
  persons: Array<{ personId: string; label?: string; confidence?: number }>
}): void {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return
  if (input.lat === 0 && input.lng === 0) return

  const now = Date.now()
  let changed = false

  for (const person of input.persons) {
    const masterId = resolveHeatmapDotMasterId(person.personId)
    if (!masterId) continue
    const position = positionForPerson(masterId, input.lat, input.lng)
    const label = person.label?.trim() || masterId
    const confidence = Number.isFinite(person.confidence) ? person.confidence! : 0.9
    const existing = registry.get(masterId)

    if (existing) {
      existing.position = position
      existing.lastSeenAt = now
      existing.confidence = Math.max(existing.confidence, confidence)
      if (label && label !== existing.label) existing.label = label
      changed = true
      continue
    }

    registry.set(masterId, {
      id: masterId,
      label,
      position,
      cameraId: input.cameraId,
      zoneId: input.zoneId ?? 'LIVE',
      confidence,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    changed = true
  }

  if (!changed) return

  if (registry.size > MAX_PERSONS) {
    const sorted = [...registry.values()].sort((a, b) => a.firstSeenAt - b.firstSeenAt)
    const drop = sorted.slice(0, registry.size - MAX_PERSONS)
    drop.forEach(row => registry.delete(row.id))
  }

  persist()
  notify()
}

/** Live frame — xóa dot cũ (PTR/OBJ orphan) không còn trong frame. */
export function pruneHeatmapActivePersons(
  cameraId: string,
  activePersonIds: string[],
): void {
  const activeMasters = new Set(
    activePersonIds.map(id => resolveHeatmapDotMasterId(id)).filter(Boolean),
  )
  if (activeMasters.size === 0) return

  let changed = false
  const now = Date.now()
  for (const [id, row] of registry.entries()) {
    if (row.cameraId !== cameraId) continue
    const master = resolveHeatmapDotMasterId(id)
    if (activeMasters.has(master)) continue
    if (now - row.lastSeenAt > 4_000) {
      registry.delete(id)
      changed = true
    }
  }
  if (changed) {
    persist()
    notify()
  }
}

/** Gộp track tạm → ID gallery / sgc khi backend gán danh tính. */
export function rekeyHeatmapPerson(fromId: string, toId: string): void {
  const src = resolveHeatmapDotMasterId(fromId)
  const dst = resolveHeatmapDotMasterId(toId)
  if (!src || !dst || src === dst) return

  const existingSrc = registry.get(src)
  const existingDst = registry.get(dst)
  if (!existingSrc && !existingDst) return

  if (existingSrc && existingDst) {
    existingDst.lastSeenAt = Math.max(existingSrc.lastSeenAt, existingDst.lastSeenAt)
    existingDst.confidence = Math.max(existingSrc.confidence, existingDst.confidence)
    registry.delete(src)
  } else if (existingSrc) {
    registry.set(dst, { ...existingSrc, id: dst, label: dst.startsWith('SGC-') ? dst : existingSrc.label })
    registry.delete(src)
  }

  persist()
  notify()
}

export function getHeatmapPersonRecords(cameraId?: string): PatrolHeatmapPersonRecord[] {
  const rows = [...registry.values()]
  if (!cameraId) return rows.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
  return rows
    .filter(row => row.cameraId === cameraId)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

export function getHeatmapPersonDots(cameraId?: string): DetectionDot[] {
  const now = Date.now()
  const byMaster = new Map<string, PatrolHeatmapPersonRecord>()

  for (const row of getHeatmapPersonRecords(cameraId)) {
    const master = resolveHeatmapDotMasterId(row.id)
    const prev = byMaster.get(master)
    if (!prev || row.lastSeenAt > prev.lastSeenAt) {
      byMaster.set(master, { ...row, id: master })
    }
  }

  return [...byMaster.values()]
    .filter(row => now - row.lastSeenAt < HISTORY_DOT_MS)
    .filter(row => isPointInSiteBoundary(row.position[0], row.position[1]))
    .map(row => {
      const inCameraView = now - row.lastSeenAt < LIVE_DOT_MS
      return {
        id: `hist-${row.id}`,
        type: 'person' as const,
        position: row.position,
        zoneId: row.zoneId,
        cameraId: row.cameraId,
        confidence: row.confidence,
        label: row.label,
        lastSeenAt: row.lastSeenAt,
        objectId: row.id,
        inCameraView,
        opacity: inCameraView ? 0.92 : 0.22,
      }
    })
}

export function getHeatmapPersonCount(cameraId?: string): number {
  return getHeatmapPersonDots(cameraId).length
}

export function clearHeatmapPersonRegistry(cameraId?: string): void {
  if (!cameraId) {
    registry.clear()
  } else {
    for (const [id, row] of registry.entries()) {
      if (row.cameraId === cameraId) registry.delete(id)
    }
  }
  persist()
  notify()
}

export function subscribeHeatmapPersonRegistry(listener: () => void): () => void {
  listeners.add(listener)
  listener()
  return () => listeners.delete(listener)
}

function resolveEventGps(
  event: { cameraId: string; gps?: { lat: number; lng: number } },
): { lat: number; lng: number } {
  const lat = event.gps?.lat
  const lng = event.gps?.lng
  if (
    typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
  ) {
    return { lat, lng }
  }
  return resolvePatrolHeatmapGps(event.cameraId)
}

/** 1 sự kiện PERS = 1 dot master — OBJ gộp vào sgc khi có. */
export function syncPatrolPersonEventsToHeatmap(
  events: Array<{
    type: string
    id: string
    cameraId: string
    zoneId?: string
    objectId?: string
    objectLabel?: string
    trackWorkerId?: string
    confidence?: number
    gps?: { lat: number; lng: number }
  }>,
): void {
  for (const event of events) {
    if (event.type !== 'PERSON_DETECTED') continue
    const resolved = resolveEventGps(event)
    const { lat, lng } = resolved
    const rawId = event.trackWorkerId?.trim()
      || event.objectId?.trim()
      || event.id
    const personId = resolveHeatmapDotMasterId(rawId)
    upsertHeatmapPersons({
      cameraId: event.cameraId,
      lat,
      lng,
      zoneId: event.zoneId,
      persons: [{
        personId,
        label: event.objectLabel?.trim() || personId,
        confidence: event.confidence,
      }],
    })
  }
}
