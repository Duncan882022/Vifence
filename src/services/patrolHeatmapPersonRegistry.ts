/**
 * Dot pin patrol — 1 master ID / ngày; blink khi in_frame, inactive đến EOD.
 * Mật độ: patrolHeatGrid.ts (tách biệt — xóa/re-pin dot không ảnh hưởng heat).
 */
import type { DetectionDot } from '@/modules/module05-productivity/data/patrolDetectionData'
import {
  clampPointToSiteInterior,
  isPointInSiteBoundary,
} from '@/modules/module05-productivity/data/patrolSiteGeometry'
import { resolvePatrolHeatmapGps } from '@/modules/module05-productivity/utils/patrolHeatmapGps'
import { offsetLatLngByMeters } from '@/modules/module05-productivity/utils/patrolLivePersonDots'
import { resolveHeatmapEntityMasterId } from '@/modules/module05-productivity/utils/patrolIdentityEntity'
import { isPatrolHeatmapEligibleId } from '@/modules/module05-productivity/utils/patrolPatrolCounts'
import { appendPatrolHeatSample, patrolSessionDateLocal } from '@/services/patrolHeatGrid'

const STORAGE_KEY = 'vifence_patrol_heatmap_persons_v2'
const MAX_PERSONS = 256
const DOT_RADIUS_MIN_M = 1.0
const DOT_RADIUS_MAX_M = 4.0

export type PatrolDotPinStatus = 'in_frame' | 'inactive'

export interface PatrolHeatmapPersonRecord {
  id: string
  label: string
  position: [number, number]
  cameraId: string
  zoneId: string
  confidence: number
  firstSeenAt: number
  lastSeenAt: number
  lastInFrameAt: number
  status: PatrolDotPinStatus
  sessionDate: string
}

const registry = new Map<string, PatrolHeatmapPersonRecord>()
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach(fn => fn())
}

export function resolveHeatmapDotMasterId(rawId: string): string {
  return resolveHeatmapEntityMasterId(rawId)
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
    const today = patrolSessionDateLocal()
    const rows = [...registry.values()]
      .filter(row => row.sessionDate === today)
      .slice(0, MAX_PERSONS)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    // quota / private mode
  }
}

function purgeExpiredSessions(now = Date.now()): void {
  const today = patrolSessionDateLocal(now)
  let changed = false
  for (const [id, row] of registry.entries()) {
    if (row.sessionDate !== today) {
      registry.delete(id)
      changed = true
    }
  }
  if (changed) persist()
}

function restore(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    purgeExpiredSessions()
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const rows = JSON.parse(raw) as PatrolHeatmapPersonRecord[]
    registry.clear()
    const today = patrolSessionDateLocal()
    for (const row of rows) {
      if (!row?.id || !row.position?.length || row.sessionDate !== today) continue
      const master = resolveHeatmapDotMasterId(row.id)
      const [lat, lng] = clampPointToSiteInterior(row.position[0], row.position[1])
      registry.set(master, {
        ...row,
        id: master,
        position: [lat, lng],
        status: row.status === 'in_frame' ? 'inactive' : (row.status ?? 'inactive'),
        sessionDate: today,
        lastInFrameAt: row.lastInFrameAt ?? row.lastSeenAt ?? Date.now(),
      })
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
  return clampPointToSiteInterior(lat2, lng2)
}

function recordHeatSample(
  masterId: string,
  position: [number, number],
  confidence: number,
): void {
  appendPatrolHeatSample({
    masterId,
    lat: position[0],
    lng: position[1],
    confidence,
  })
}

export function upsertHeatmapPersons(input: {
  cameraId: string
  lat: number
  lng: number
  zoneId?: string
  persons: Array<{ personId: string; label?: string; confidence?: number }>
  inFrame?: boolean
}): void {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return
  if (input.lat === 0 && input.lng === 0) return

  purgeExpiredSessions()
  const now = Date.now()
  const today = patrolSessionDateLocal(now)
  const inFrame = input.inFrame !== false
  let changed = false

  for (const person of input.persons) {
    const masterId = resolveHeatmapDotMasterId(person.personId)
    if (!masterId || !isPatrolHeatmapEligibleId(masterId)) continue
    const position = positionForPerson(masterId, input.lat, input.lng)
    const label = person.label?.trim() || masterId
    const confidence = Number.isFinite(person.confidence) ? person.confidence! : 0.9
    const existing = registry.get(masterId)

    if (existing) {
      if (existing.sessionDate !== today) {
        registry.delete(masterId)
      } else {
        existing.position = position
        existing.lastSeenAt = now
        existing.confidence = Math.max(existing.confidence, confidence)
        if (label && label !== existing.label) existing.label = label
        existing.cameraId = input.cameraId
        if (input.zoneId) existing.zoneId = input.zoneId
        if (inFrame) {
          existing.status = 'in_frame'
          existing.lastInFrameAt = now
        }
        recordHeatSample(masterId, position, confidence)
        changed = true
        continue
      }
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
      lastInFrameAt: inFrame ? now : 0,
      status: inFrame ? 'in_frame' : 'inactive',
      sessionDate: today,
    })
    recordHeatSample(masterId, position, confidence)
    changed = true
  }

  if (!changed) return

  if (registry.size > MAX_PERSONS) {
    const sorted = [...registry.values()].sort((a, b) => a.firstSeenAt - b.firstSeenAt)
    sorted.slice(0, registry.size - MAX_PERSONS).forEach(row => registry.delete(row.id))
  }

  persist()
  notify()
}

/**
 * Sau mỗi frame live — entity không còn trong frame → inactive (giữ pin đến EOD).
 */
export function syncHeatmapFramePresence(
  cameraId: string,
  activePersonIds: string[],
): void {
  purgeExpiredSessions()
  const activeMasters = new Set(
    activePersonIds.map(id => resolveHeatmapDotMasterId(id)).filter(Boolean),
  )
  const today = patrolSessionDateLocal()
  let changed = false

  for (const row of registry.values()) {
    if (row.cameraId !== cameraId || row.sessionDate !== today) continue
    const master = resolveHeatmapDotMasterId(row.id)
    if (activeMasters.has(master)) continue
    if (row.status === 'in_frame') {
      row.status = 'inactive'
      changed = true
    }
  }

  if (changed) {
    persist()
    notify()
  }
}

/** @deprecated Dùng syncHeatmapFramePresence — không xóa dot inactive. */
export function pruneHeatmapActivePersons(
  cameraId: string,
  activePersonIds: string[],
): void {
  syncHeatmapFramePresence(cameraId, activePersonIds)
}

export function rekeyHeatmapPerson(fromId: string, toId: string): void {
  const src = resolveHeatmapDotMasterId(fromId)
  const dst = resolveHeatmapDotMasterId(toId)
  if (!src || !dst || src === dst) return

  const existingSrc = registry.get(src)
  const existingDst = registry.get(dst)
  if (!existingSrc && !existingDst) return

  if (existingSrc && existingDst) {
    existingDst.lastSeenAt = Math.max(existingSrc.lastSeenAt, existingDst.lastSeenAt)
    existingDst.lastInFrameAt = Math.max(existingSrc.lastInFrameAt, existingDst.lastInFrameAt)
    existingDst.confidence = Math.max(existingSrc.confidence, existingDst.confidence)
    if (existingSrc.status === 'in_frame') existingDst.status = 'in_frame'
    registry.delete(src)
  } else if (existingSrc) {
    registry.set(dst, {
      ...existingSrc,
      id: dst,
      label: dst.startsWith('SGC-') ? dst : existingSrc.label,
    })
    registry.delete(src)
  }

  persist()
  notify()
}

export function getHeatmapPersonRecords(cameraId?: string): PatrolHeatmapPersonRecord[] {
  purgeExpiredSessions()
  const today = patrolSessionDateLocal()
  const rows = [...registry.values()].filter(row => row.sessionDate === today)
  if (!cameraId) return rows.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
  return rows
    .filter(row => row.cameraId === cameraId)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

/** Master IDs pin trong ca — dùng KPI global multi-mũ. */
export function getHeatmapSessionMasterIds(cameraId?: string): string[] {
  return getHeatmapPersonRecords(cameraId).map(row => resolveHeatmapDotMasterId(row.id))
}

export function getHeatmapPersonDots(cameraId?: string): DetectionDot[] {
  purgeExpiredSessions()
  const today = patrolSessionDateLocal()
  const byMaster = new Map<string, PatrolHeatmapPersonRecord>()

  for (const row of getHeatmapPersonRecords(cameraId)) {
    if (row.sessionDate !== today) continue
    const master = resolveHeatmapDotMasterId(row.id)
    const prev = byMaster.get(master)
    if (!prev || row.lastSeenAt > prev.lastSeenAt) {
      byMaster.set(master, { ...row, id: master })
    }
  }

  return [...byMaster.values()]
    .filter(row => isPointInSiteBoundary(row.position[0], row.position[1]))
    .map(row => {
      const [lat, lng] = clampPointToSiteInterior(row.position[0], row.position[1])
      const inCameraView = row.status === 'in_frame'
      return {
        id: `pin-${row.id}`,
        type: 'person' as const,
        position: [lat, lng] as [number, number],
        zoneId: row.zoneId,
        cameraId: row.cameraId,
        confidence: row.confidence,
        label: row.label,
        lastSeenAt: row.lastSeenAt,
        objectId: row.id,
        inCameraView,
        opacity: inCameraView ? 0.92 : 0.28,
      }
    })
}

export function getHeatmapPersonCount(cameraId?: string): number {
  return getHeatmapPersonDots(cameraId).length
}

export function getHeatmapInFrameCount(cameraId?: string): number {
  return getHeatmapPersonDots(cameraId).filter(d => d.inCameraView).length
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
    if (event.type !== 'PERSON_DETECTED' && event.type !== 'IDENTITY_VERIFIED') continue
    const track = event.trackWorkerId?.trim() ?? ''
    const oid = event.objectId?.trim() ?? ''
    if (!isPatrolHeatmapEligibleId(track) && !isPatrolHeatmapEligibleId(oid)) continue
    const { lat, lng } = resolveEventGps(event)
    const rawId = event.trackWorkerId?.trim()
      || event.objectId?.trim()
      || event.id
    const personId = resolveHeatmapDotMasterId(rawId)
    upsertHeatmapPersons({
      cameraId: event.cameraId,
      lat,
      lng,
      zoneId: event.zoneId,
      inFrame: false,
      persons: [{
        personId,
        label: event.objectLabel?.trim() || personId,
        confidence: event.confidence,
      }],
    })
  }
}
