/**
 * Lịch sử chấm người trên heatmap — mỗi ID một dot, giữ vị trí cho đến khi gặp lại.
 */
import type { DetectionDot } from '@/modules/module05-productivity/data/patrolDetectionData'
import { resolvePatrolHeatmapGps } from '@/modules/module05-productivity/utils/patrolHeatmapGps'
import { offsetLatLngByMeters } from '@/modules/module05-productivity/utils/patrolLivePersonDots'

const STORAGE_KEY = 'vifence_patrol_heatmap_persons_v1'
const MAX_PERSONS = 120
const DOT_RADIUS_M = 1.8

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

function hashOffset(personId: string): [number, number] {
  let h = 2166136261
  for (let i = 0; i < personId.length; i++) {
    h ^= personId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const angle = ((h >>> 0) % 360) * (Math.PI / 180)
  const ring = 0.45 + ((h >>> 8) % 100) / 100 * 0.55
  const r = DOT_RADIUS_M * ring
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
      registry.set(row.id, row)
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
  return offsetLatLngByMeters(lat, lng, eastM, northM)
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
    const id = person.personId.trim()
    if (!id) continue
    const position = positionForPerson(id, input.lat, input.lng)
    const label = person.label?.trim() || id
    const confidence = Number.isFinite(person.confidence) ? person.confidence! : 0.9
    const existing = registry.get(id)

    if (existing) {
      existing.position = position
      existing.lastSeenAt = now
      existing.confidence = Math.max(existing.confidence, confidence)
      if (label && label !== existing.label) existing.label = label
      changed = true
      continue
    }

    registry.set(id, {
      id,
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

/** Gộp track tạm → ID gallery / sgc khi backend gán danh tính. */
export function rekeyHeatmapPerson(fromId: string, toId: string): void {
  const src = fromId.trim()
  const dst = toId.trim()
  if (!src || !dst || src === dst) return

  const existingSrc = registry.get(src)
  const existingDst = registry.get(dst)
  if (!existingSrc && !existingDst) return

  if (existingSrc && existingDst) {
    existingDst.lastSeenAt = Math.max(existingSrc.lastSeenAt, existingDst.lastSeenAt)
    existingDst.confidence = Math.max(existingSrc.confidence, existingDst.confidence)
    registry.delete(src)
  } else if (existingSrc) {
    registry.set(dst, { ...existingSrc, id: dst, label: dst.startsWith('sgc-') ? dst : existingSrc.label })
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
  return getHeatmapPersonRecords(cameraId).map(row => {
    const inCameraView = now - row.lastSeenAt < 8000
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
      opacity: inCameraView ? 0.92 : 0.28,
    }
  })
}

export function getHeatmapPersonCount(cameraId?: string): number {
  return getHeatmapPersonRecords(cameraId).length
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

/** 1 sự kiện PERS = 1 dot — gặp lại cùng worker_id thì cập nhật vị trí dot. */
export function syncPatrolPersonEventsToHeatmap(
  events: Array<{
    type: string
    id: string
    cameraId: string
    zoneId?: string
    objectId?: string
    objectLabel?: string
    confidence?: number
    gps?: { lat: number; lng: number }
  }>,
): void {
  for (const event of events) {
    if (event.type !== 'PERSON_DETECTED') continue
    const resolved = resolveEventGps(event)
    const { lat, lng } = resolved
    const personId = event.objectId?.trim() || event.id
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
