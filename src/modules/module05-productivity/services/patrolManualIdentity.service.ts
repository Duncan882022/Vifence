/**
 * Định danh thủ công Module 05 — mã workerId ổn định + alias track/object.
 * Gặp lại cùng mã → load tên/đơn vị và gộp lịch sử dot/sự kiện.
 * Gán qua BE enroll gallery khi có snapshot.
 */
import { rekeyHeatmapPerson } from '@/services/patrolHeatmapPersonRegistry'
import { isVerifiedWorkerLabel } from '../utils/workforceHeatmapUi'
import { expandPatrolIdentityAliasKeys } from './patrolSgcObjectLink.service'
import {
  assignPatrolIdentityOnBackend,
  fetchPatrolIdentityBindings,
  type PatrolIdentityAssignResult,
} from './patrolIdentityAssign.service'

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
let _memoryStore: PatrolIdentityStore = emptyStore()

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

function readStore(): PatrolIdentityStore {
  return _memoryStore
}

function writeStore(store: PatrolIdentityStore): void {
  _memoryStore = store
  notify()
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
  const key = normalizePatrolIdentityKey(objectKey)
  if (!key) return null
  const workerId = resolveWorkerIdForObject(key)
  if (workerId) return readStore().byWorkerId[workerId] ?? null
  return findPatrolIdentityByWorkerId(key)
}

/** Chỉ áp dụng định danh đã gán trực tiếp lên sgc — không kéo từ OBJ dùng chung. */
export function getPatrolManualIdentityForSgc(sgcKey: string): PatrolManualIdentity | null {
  const key = normalizePatrolIdentityKey(sgcKey)
  if (!key || !/^sgc-/i.test(key)) return null
  const workerId = resolveWorkerIdForObject(key)
  if (!workerId) return null
  const identity = readStore().byWorkerId[workerId]
  if (!identity) return null
  const hasDirectAlias = identity.objectKeys.some(
    alias => normalizePatrolIdentityKey(alias).toLowerCase() === key.toLowerCase(),
  )
  return hasDirectAlias ? identity : null
}

function hasDirectPatrolManualAlias(identity: PatrolManualIdentity, key: string): boolean {
  const norm = normalizePatrolIdentityKey(key).toLowerCase()
  if (!norm) return false
  return identity.objectKeys.some(
    alias => normalizePatrolIdentityKey(alias).toLowerCase() === norm,
  )
}

function getPatrolManualIdentityForDirectAlias(key: string): PatrolManualIdentity | null {
  const trimmed = normalizePatrolIdentityKey(key)
  if (!trimmed) return null
  const manual = getPatrolManualIdentity(trimmed)
  if (!manual) return null
  return hasDirectPatrolManualAlias(manual, trimmed) ? manual : null
}

export function getPatrolManualIdentityForPatrolEvent(event: {
  id: string
  objectId?: string | null
  trackWorkerId?: string | null
}): PatrolManualIdentity | null {
  const dayPers = event.id.match(/^pers:(.+)$/i)?.[1]?.trim()
  if (dayPers) return getPatrolManualIdentityForDirectAlias(dayPers)

  const dayObj = event.id.match(/^obj:(.+)$/i)?.[1]?.trim()
  if (dayObj) {
    const direct = getPatrolManualIdentityForDirectAlias(dayObj)
    if (direct) return direct
    const track = event.trackWorkerId?.trim() ?? ''
    if (track && /^sgc-/i.test(track)) {
      return getPatrolManualIdentityForSgc(track)
    }
    return null
  }

  const track = event.trackWorkerId?.trim() ?? ''
  if (track && /^sgc-/i.test(track)) {
    return getPatrolManualIdentityForSgc(track)
  }

  for (const key of [event.objectId?.trim(), track].filter(Boolean) as string[]) {
    if (/^(pers-|obj-)/i.test(key)) {
      const bound = getPatrolManualIdentityForDirectAlias(key)
      if (bound) return bound
      continue
    }
    const manual = getPatrolManualIdentity(key)
    if (manual) return manual
  }
  return null
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

/** Gán định danh — enroll mặt BE + lưu alias local. */
export async function assignPatrolManualIdentityWithBackend(input: {
  objectKey: string
  workerId: string
  workerName: string
  unitName: string
  snapshotUrl?: string | null
  cameraId?: string | null
  trackId?: string | null
}): Promise<{ identity: PatrolManualIdentity | null; backend: PatrolIdentityAssignResult }> {
  const employeeCode = normalizePatrolWorkerId(input.workerId)
  const backend = await assignPatrolIdentityOnBackend({
    objectKey: input.objectKey,
    workerName: input.workerName,
    employeeCode,
    contractorName: input.unitName,
    snapshotUrl: input.snapshotUrl,
    cameraId: input.cameraId,
    trackId: input.trackId,
  })

  const galleryWorkerId = backend.ok && backend.gallery_worker_id
    ? normalizePatrolWorkerId(backend.gallery_worker_id)
    : employeeCode

  const identity = assignPatrolManualIdentity({
    objectKey: input.objectKey,
    workerId: galleryWorkerId,
    workerName: input.workerName,
    unitName: input.unitName,
  })

  return { identity, backend }
}

/**
 * Đồng bộ định danh từ server. **Server là nguồn sự thật** — bản local phải
 * khớp hoàn toàn, kể cả việc xoá.
 *
 * Trước đây hàm này chỉ thêm, không bao giờ xoá. Sau khi xoá dữ liệu trên
 * server, bộ đếm `sgc-*` bắt đầu lại từ 1 và alias cũ còn kẹt trong trình duyệt
 * dán tên của người cũ lên **đối tượng hoàn toàn khác** vừa được cấp lại đúng
 * mã đó — thẻ nhảy sang tab Định danh với một cái tên chẳng liên quan.
 */
export async function syncPatrolIdentityBindingsFromBackend(): Promise<number> {
  const bindings = await fetchPatrolIdentityBindings()

  const next = emptyStore()
  let count = 0
  for (const row of bindings) {
    const workerId = normalizePatrolWorkerId(row.gallery_worker_id)
    const workerName = (row.worker_name ?? '').trim()
    const unitName = (row.contractor_name ?? '').trim()
    if (!workerId || !workerName) continue

    const aliases = (row.aliases ?? [])
      .map(a => normalizePatrolIdentityKey(a))
      .filter(Boolean)
    if (aliases.length === 0) continue

    const now = Date.now()
    next.byWorkerId[workerId] = {
      workerId,
      workerName,
      unitName,
      objectKeys: aliases,
      assignedAt: now,
      updatedAt: now,
    }
    for (const alias of aliases) {
      next.aliasToWorkerId[alias] = workerId
      count += 1
    }
  }

  const before = JSON.stringify(readStore())
  writeStore(next)
  if (JSON.stringify(next) !== before) notify()
  return count
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
