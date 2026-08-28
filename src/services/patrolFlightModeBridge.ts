/** Bridge flight_mode flycam từ VMS overlay → Module 05 events/heatmap. */

import type { PatrolFlightMode } from '@/modules/module05-productivity/utils/patrolFlightMode'

const FLIGHT_MODE_TTL_MS = 45_000

interface FlightModeEntry {
  mode: PatrolFlightMode
  updatedAt: number
}

const byCamera = new Map<string, FlightModeEntry>()
const listeners = new Set<(cameraId: string, mode: PatrolFlightMode | null) => void>()

function normalizeMode(raw: string | null | undefined): PatrolFlightMode | null {
  if (raw === 'proximity' || raw === 'aerial') return raw
  return null
}

export function setPatrolFlightMode(cameraId: string, mode: string | null | undefined): void {
  if (!cameraId.startsWith('DR-')) return
  const normalized = normalizeMode(mode) ?? 'aerial'
  byCamera.set(cameraId, { mode: normalized, updatedAt: Date.now() })
  listeners.forEach(fn => fn(cameraId, normalized))
}

export function getPatrolFlightMode(cameraId: string): PatrolFlightMode | null {
  const row = byCamera.get(cameraId)
  if (!row) return null
  if (Date.now() - row.updatedAt > FLIGHT_MODE_TTL_MS) return null
  return row.mode
}

export function subscribePatrolFlightMode(
  listener: (cameraId: string, mode: PatrolFlightMode | null) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
