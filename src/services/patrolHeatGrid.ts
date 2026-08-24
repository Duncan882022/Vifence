/**
 * Mật độ patrol — lưới GPS tích lũy, tách khỏi dot pin UI.
 * spec §7.3: max 1 sample / entity / 3s; dot xóa/re-pin không ảnh hưởng heat.
 */
import { isPointInSiteBoundary } from '@/modules/module05-productivity/data/patrolSiteGeometry'
import { isPatrolHeatmapEligibleId } from '@/modules/module05-productivity/utils/patrolPatrolCounts'
import { resolveHeatmapEntityMasterId } from '@/modules/module05-productivity/utils/patrolIdentityEntity'

const STORAGE_KEY = 'vifence_patrol_heat_grid_v1'
const GRID_CELL_M = 8
const SAMPLE_MIN_INTERVAL_MS = 3_000
const MAX_CELLS = 2_048
const DEFAULT_WINDOW_MS = 8 * 60 * 60_000

export interface PatrolHeatGridCell {
  key: string
  lat: number
  lng: number
  weight: number
  lastSampleAt: number
  sessionDate: string
}

export interface PatrolHeatSource {
  lat: number
  lng: number
  intensity: number
  radius: number
}

const cells = new Map<string, PatrolHeatGridCell>()
const lastSampleByMaster = new Map<string, number>()
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach(fn => fn())
}

export function patrolSessionDateLocal(now = Date.now()): string {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function cellForLatLng(lat: number, lng: number): { key: string; lat: number; lng: number } {
  const latStep = GRID_CELL_M / 111_320
  const lngStep = GRID_CELL_M / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
  const ci = Math.round(lat / latStep)
  const cj = Math.round(lng / lngStep)
  return {
    key: `${ci}:${cj}`,
    lat: ci * latStep,
    lng: cj * lngStep,
  }
}

function persist(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const rows = [...cells.values()]
      .sort((a, b) => b.lastSampleAt - a.lastSampleAt)
      .slice(0, MAX_CELLS)
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
    const rows = JSON.parse(raw) as PatrolHeatGridCell[]
    cells.clear()
    const today = patrolSessionDateLocal()
    for (const row of rows) {
      if (!row?.key || row.sessionDate !== today) continue
      cells.set(row.key, row)
    }
  } catch {
    cells.clear()
  }
}

restore()

function trimCells(): void {
  if (cells.size <= MAX_CELLS) return
  const sorted = [...cells.values()].sort((a, b) => a.lastSampleAt - b.lastSampleAt)
  const drop = sorted.slice(0, cells.size - MAX_CELLS)
  drop.forEach(row => cells.delete(row.key))
}

/** Ghi sample mật độ — không gọi khi xóa/re-pin dot UI. */
export function appendPatrolHeatSample(input: {
  masterId: string
  lat: number
  lng: number
  confidence?: number
}): void {
  const masterId = resolveHeatmapEntityMasterId(input.masterId)
  if (!masterId || !isPatrolHeatmapEligibleId(masterId)) return
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return
  if (input.lat === 0 && input.lng === 0) return
  if (!isPointInSiteBoundary(input.lat, input.lng)) return

  const now = Date.now()
  const prev = lastSampleByMaster.get(masterId) ?? 0
  if (now - prev < SAMPLE_MIN_INTERVAL_MS) return
  lastSampleByMaster.set(masterId, now)

  const { key, lat, lng } = cellForLatLng(input.lat, input.lng)
  const sessionDate = patrolSessionDateLocal(now)
  const boost = Number.isFinite(input.confidence)
    ? 0.55 + Math.min(0.45, input.confidence! * 0.45)
    : 0.72
  const existing = cells.get(key)

  if (existing && existing.sessionDate === sessionDate) {
    existing.weight = Math.min(24, existing.weight + boost)
    existing.lastSampleAt = now
    existing.lat = lat
    existing.lng = lng
  } else {
    cells.set(key, {
      key,
      lat,
      lng,
      weight: boost,
      lastSampleAt: now,
      sessionDate,
    })
  }

  trimCells()
  persist()
  notify()
}

export function getPatrolHeatGridCells(sessionDate = patrolSessionDateLocal()): PatrolHeatGridCell[] {
  return [...cells.values()].filter(row => row.sessionDate === sessionDate)
}

export function getPatrolHeatSources(
  windowMs: number = DEFAULT_WINDOW_MS,
  zoom = 16,
): PatrolHeatSource[] {
  const now = Date.now()
  const today = patrolSessionDateLocal(now)
  const rows = getPatrolHeatGridCells(today).filter(
    row => now - row.lastSampleAt <= windowMs,
  )
  if (rows.length === 0) return []

  const maxWeight = Math.max(...rows.map(r => r.weight), 1)
  const baseR = 22 * 1.28 ** (zoom - 16)

  return rows.map(row => {
    const ageMs = now - row.lastSampleAt
    const decay = Math.max(0.22, 1 - ageMs / Math.max(windowMs, 60_000))
    const t = (row.weight / maxWeight) * decay
    return {
      lat: row.lat,
      lng: row.lng,
      intensity: 0.16 + t * 0.62,
      radius: baseR * (0.72 + t * 0.55),
    }
  })
}

export function clearPatrolHeatGrid(cameraId?: string): void {
  void cameraId
  cells.clear()
  lastSampleByMaster.clear()
  persist()
  notify()
}

export function subscribePatrolHeatGrid(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
