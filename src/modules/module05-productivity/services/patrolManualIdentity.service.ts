/**
 * Định danh thủ công Module 05 — mã workerId ổn định + alias track/object.
 * Gặp lại cùng mã → load tên/đơn vị và gộp lịch sử dot/sự kiện.
 */
import { rekeyHeatmapPerson } from '@/services/patrolHeatmapPersonRegistry'
import { isVerifiedWorkerLabel } from '../utils/workforceHeatmapUi'
import { expandPatrolIdentityAliasKeys } from './patrolSgcObjectLink.service'

const STORAGE_KEY = 'vifence_patrol_manual_identity_v2'
const LEGACY_STORAGE_KEY = 'vifence_patrol_manual_identity_v1'

export interface PatrolManualIdentity {
  workerId: string
  workerName: string
  unitName: string
  objectKeys: string[]
  assignedAt: number
  updatedAt: number
}

interface PatrolIdentityStore {
  version: 2
  byWorkerId: Record<string, PatrolManualIdentity>
  aliasToWorkerId: Record<string, string>
}

const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach(fn => fn())
}

function emptyStore(): PatrolIdentityStore {
  return { version: 2, byWorkerId: {}, aliasToWorkerId: {} }
}

export function normalizePatrolIdentityKey(key: string): string {
  return key.trim()
}

export function normalizePatrolWorkerId(workerId: string): string {
  return workerId.trim().toUpperCase()
}

function isUsableWorkerId(workerId: string): boolean {
  const id = normalizePatrolWorkerId(workerId)
  if (!id || id === 'UNKNOWN') return false
  return true
}

function inferWorkerIdFromObjectKey(objectKey: string): string {
  const key = normalizePatrolIdentityKey(objectKey)
  if (/^sgc-/i.test(key)) return normalizePatrolWorkerId(key)
  return `MAN-${key}`
}

function readStore(): PatrolIdentityStore {
  if (typeof localStorage === 'undefined') return emptyStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PatrolIdentityStore
      if (parsed?.version === 2 && parsed.byWorkerId && parsed.aliasToWorkerId) {
        return parsed
      }
    }
    return migrateLegacyStore()
  } catch {
    return emptyStore()
  }
}

function writeStore(store: PatrolIdentityStore): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // quota
  }
}

function migrateLegacyStore(): PatrolIdentityStore {
  const store = emptyStore()
  if (typeof localStorage === 'undefined') return store
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return store
    const legacy = JSON.parse(raw) as Record<string, {
      objectKey: string
      workerName: string
      unitName: string
      assignedAt: number
    }>
    for (const row of Object.values(legacy)) {
      const objectKey = normalizePatrolIdentityKey(row.objectKey)
      if (!objectKey || !row.workerName?.trim() || !row.unitName?.trim()) continue
      const workerId = inferWorkerIdFromObjectKey(objectKey)
      let identity = store.byWorkerId[workerId]
      if (!identity) {
        identity = {
          workerId,
          workerName: row.workerName.trim(),
          unitName: row.unitName.trim(),
          objectKeys: [],
          assignedAt: row.assignedAt || Date.now(),
          updatedAt: row.assignedAt || Date.now(),
        }
        store.byWorkerId[workerId] = identity
      }
      if (!identity.objectKeys.includes(objectKey)) {
        identity.objectKeys.push(objectKey)
      }
      store.aliasToWorkerId[objectKey] = workerId
      rekeyHeatmapPerson(objectKey, workerId)
    }
  } catch {
    // ignore corrupt legacy
  }
  writeStore(store)
  return store
}

function resolveWorkerIdForObject(objectKey: string, store = readStore()): string | null {
  const key = normalizePatrolIdentityKey(objectKey)
  if (!key) return null
  return store.aliasToWorkerId[key] ?? null
}

export function findPatrolIdentityByWorkerId(workerId: string): PatrolManualIdentity | null {
  const id = normalizePatrolWorkerId(workerId)
  if (!isUsableWorkerId(id)) return null
  return readStore().byWorkerId[id] ?? null
}

export function getPatrolManualIdentity(objectKey: string): PatrolManualIdentity | null {
  const workerId = resolveWorkerIdForObject(objectKey)
  if (!workerId) return null
  return readStore().byWorkerId[workerId] ?? null
}

export function isPatrolManuallyIdentified(objectKey: string): boolean {
  return Boolean(getPatrolManualIdentity(objectKey))
}

export function assignPatrolManualIdentity(input: {
  objectKey: string
  workerId: string
  workerName: string
  unitName: string
}): PatrolManualIdentity | null {
  const objectKey = normalizePatrolIdentityKey(input.objectKey)
  const workerId = normalizePatrolWorkerId(input.workerId)
  const workerName = input.workerName.trim()
  const unitName = input.unitName.trim()
  if (!objectKey || !isUsableWorkerId(workerId) || !workerName || !unitName) return null

  const aliasKeys = expandPatrolIdentityAliasKeys(objectKey)
  const store = readStore()
  const prevWorkerId = store.aliasToWorkerId[objectKey]
  const existing = store.byWorkerId[workerId]
  const now = Date.now()

  const mergedObjectKeys = new Set<string>([
    ...(existing?.objectKeys ?? []),
    objectKey,
    ...aliasKeys,
  ])

  const identity: PatrolManualIdentity = existing
    ? {
        ...existing,
        workerName,
        unitName,
        updatedAt: now,
        objectKeys: [...mergedObjectKeys],
      }
    : {
        workerId,
        workerName,
        unitName,
        objectKeys: [...mergedObjectKeys],
        assignedAt: now,
        updatedAt: now,
      }

  store.byWorkerId[workerId] = identity
  store.aliasToWorkerId[objectKey] = workerId

  if (prevWorkerId && prevWorkerId !== workerId) {
    const prev = store.byWorkerId[prevWorkerId]
    if (prev) {
      prev.objectKeys = prev.objectKeys.filter(k => k !== objectKey)
      if (prev.objectKeys.length === 0) {
        delete store.byWorkerId[prevWorkerId]
      } else {
        store.byWorkerId[prevWorkerId] = prev
      }
    }
  }

  for (const alias of identity.objectKeys) {
    store.aliasToWorkerId[alias] = workerId
    rekeyHeatmapPerson(alias, workerId)
  }

  writeStore(store)
  notify()
  return identity
}

export function resolvePatrolObjectLabel(objectKey: string, fallback: string): string {
  const manual = getPatrolManualIdentity(objectKey)
  if (manual?.workerName) return manual.workerName
  const byWorkerId = findPatrolIdentityByWorkerId(fallback)
  if (byWorkerId?.workerName) return byWorkerId.workerName
  return fallback
}

export function resolvePatrolObjectUnit(objectKey: string): string | null {
  return getPatrolManualIdentity(objectKey)?.unitName ?? null
}

export function resolvePatrolWorkerId(objectKey: string, fallbackWorkerId?: string | null): string | null {
  const manual = getPatrolManualIdentity(objectKey)
  if (manual?.workerId) return manual.workerId
  if (fallbackWorkerId && isUsableWorkerId(fallbackWorkerId)) {
    return normalizePatrolWorkerId(fallbackWorkerId)
  }
  return null
}

/** Gợi ý mã khi mở panel — ưu tiên gallery id, rồi định danh cũ, rồi track hiện tại. */
export function suggestPatrolWorkerId(
  objectKey: string,
  fallbackWorkerId?: string | null,
): string {
  const existing = getPatrolManualIdentity(objectKey)
  if (existing?.workerId) return existing.workerId
  if (fallbackWorkerId && isUsableWorkerId(fallbackWorkerId)) {
    return normalizePatrolWorkerId(fallbackWorkerId)
  }
  const key = normalizePatrolIdentityKey(objectKey)
  if (/^sgc-/i.test(key)) return normalizePatrolWorkerId(key)
  return ''
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
