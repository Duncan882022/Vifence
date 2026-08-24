import { getPatrolManualIdentity, findPatrolIdentityByWorkerId } from '../services/patrolManualIdentity.service'
import { getPatrolSgcKeysForObject } from '../services/patrolSgcObjectLink.service'
import { isPatrolObjectId, isPatrolSgcWorkerId } from './patrolWorkforceEventLabels'
import { isVerifiedWorkerLabel } from './workforceHeatmapUi'

/** Gallery worker id (p-*, w-*, c-*, u-*) — không phải sgc/OBJ. */
export function isPatrolGalleryWorkerId(id?: string | null): boolean {
  if (!id) return false
  const t = id.trim()
  if (!t || t === 'unknown') return false
  if (isPatrolSgcWorkerId(t) || isPatrolObjectId(t)) return false
  if (/^(p-|w-|c-|u-|man-)/i.test(t)) return true
  return false
}

export function isPatrolProfileWorkerId(id?: string | null): boolean {
  if (!id) return false
  const t = id.trim()
  if (isPatrolGalleryWorkerId(t)) return true
  if (getPatrolManualIdentity(t) || findPatrolIdentityByWorkerId(t)) return true
  return isVerifiedWorkerLabel(t) && !isPatrolSgcWorkerId(t) && !isPatrolObjectId(t)
}

/** Khóa entity tab Định danh — gallery/manual workerId, không dùng sgc. */
export function resolvePatrolProfileEntityKey(event: {
  objectId?: string | null
  trackWorkerId?: string | null
  objectLabel?: string | null
}): string | null {
  for (const raw of [event.objectId, event.trackWorkerId]) {
    const key = raw?.trim() ?? ''
    if (!key) continue
    const manual = getPatrolManualIdentity(key)
    if (manual) return manual.workerId.toUpperCase()
  }
  const oid = event.objectId?.trim() ?? ''
  const track = event.trackWorkerId?.trim() ?? ''
  if (isPatrolGalleryWorkerId(oid)) return oid.toUpperCase()
  if (isPatrolGalleryWorkerId(track)) return track.toUpperCase()
  const label = event.objectLabel?.trim() ?? ''
  if (
    isVerifiedWorkerLabel(label)
    && !isPatrolSgcWorkerId(label)
    && !isPatrolObjectId(label)
    && (getPatrolManualIdentity(label) || isPatrolGalleryWorkerId(label))
  ) {
    return label
  }
  return null
}

export function resolveHeatmapEntityMasterId(rawId: string): string {
  const id = rawId.trim()
  if (!id) return id
  const manual = getPatrolManualIdentity(id) ?? findPatrolIdentityByWorkerId(id)
  if (manual) return manual.workerId.toUpperCase()
  if (isPatrolGalleryWorkerId(id)) return id.toUpperCase()
  if (/^sgc-/i.test(id)) return id.toUpperCase()
  if (/^OBJ-/i.test(id)) {
    const sgcs = getPatrolSgcKeysForObject(id)
    if (sgcs[0]) {
      const bound = getPatrolManualIdentity(sgcs[0])
      if (bound) return bound.workerId.toUpperCase()
      return sgcs[0].toUpperCase()
    }
    return id
  }
  return id
}
