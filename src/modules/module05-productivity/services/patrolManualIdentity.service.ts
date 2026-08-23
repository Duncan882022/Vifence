/**
 * Định danh thủ công Module 05 — lưu Tên + Đơn vị cho object/event chưa VERIFIED.
 */
import { isVerifiedWorkerLabel } from '../utils/workforceHeatmapUi'

const STORAGE_KEY = 'vifence_patrol_manual_identity_v1'

export interface PatrolManualIdentity {
  objectKey: string
  workerName: string
  unitName: string
  assignedAt: number
}

const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach(fn => fn())
}

function readAll(): Record<string, PatrolManualIdentity> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, PatrolManualIdentity>
  } catch {
    return {}
  }
}

function writeAll(rows: Record<string, PatrolManualIdentity>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    // quota
  }
}

export function normalizePatrolIdentityKey(key: string): string {
  return key.trim()
}

export function getPatrolManualIdentity(objectKey: string): PatrolManualIdentity | null {
  const key = normalizePatrolIdentityKey(objectKey)
  if (!key) return null
  return readAll()[key] ?? null
}

export function isPatrolManuallyIdentified(objectKey: string): boolean {
  return Boolean(getPatrolManualIdentity(objectKey))
}

export function assignPatrolManualIdentity(input: {
  objectKey: string
  workerName: string
  unitName: string
}): PatrolManualIdentity | null {
  const objectKey = normalizePatrolIdentityKey(input.objectKey)
  const workerName = input.workerName.trim()
  const unitName = input.unitName.trim()
  if (!objectKey || !workerName || !unitName) return null

  const row: PatrolManualIdentity = {
    objectKey,
    workerName,
    unitName,
    assignedAt: Date.now(),
  }
  const all = readAll()
  all[objectKey] = row
  writeAll(all)
  notify()
  return row
}

export function resolvePatrolObjectLabel(objectKey: string, fallback: string): string {
  const manual = getPatrolManualIdentity(objectKey)
  if (manual?.workerName) return manual.workerName
  return fallback
}

export function resolvePatrolObjectUnit(objectKey: string): string | null {
  return getPatrolManualIdentity(objectKey)?.unitName ?? null
}

/** Cần nút Định danh khi chưa gallery-verified và chưa gán thủ công. */
export function needsPatrolManualIdentity(objectKey: string, fallbackLabel: string): boolean {
  if (isPatrolManuallyIdentified(objectKey)) return false
  if (isVerifiedWorkerLabel(fallbackLabel)) return false
  const t = fallbackLabel.trim().toLowerCase()
  if (t.includes('người chưa xác định') || t.includes('chưa xác định')) return true
  if (t.startsWith('sgc-') || t.startsWith('obj-') || t.startsWith('trk-')) return true
  if (t === 'person' || t === 'unknown') return true
  return !isVerifiedWorkerLabel(fallbackLabel)
}

export function subscribePatrolManualIdentity(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
