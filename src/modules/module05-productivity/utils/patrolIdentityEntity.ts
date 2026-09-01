import { getPatrolManualIdentity, getPatrolManualIdentityForSgc, findPatrolIdentityByWorkerId } from '../services/patrolManualIdentity.service'
import { expandPatrolIdentityAliasKeys, getPatrolSgcKeysForObject } from '../services/patrolSgcObjectLink.service'
import { isPatrolObjectId, isPatrolPersId, isPatrolSgcWorkerId } from './patrolWorkforceEventLabels'
import { isVerifiedWorkerLabel } from './workforceHeatmapUi'

/** sgc-* gắn với event — từ track, object hoặc alias gallery/manual. */
export function resolvePatrolEventSgcKey(event: {
  objectId?: string | null
  trackWorkerId?: string | null
}): string | null {
  for (const raw of [event.trackWorkerId, event.objectId]) {
    const key = raw?.trim() ?? ''
    if (isPatrolSgcWorkerId(key)) return key.toUpperCase()
  }
  for (const raw of [event.objectId, event.trackWorkerId]) {
    const key = raw?.trim() ?? ''
    if (!key) continue
    for (const alias of expandPatrolIdentityAliasKeys(key)) {
      if (isPatrolSgcWorkerId(alias)) return alias.toUpperCase()
    }
    if (isPatrolObjectId(key)) {
      for (const sgc of getPatrolSgcKeysForObject(key)) {
        if (isPatrolSgcWorkerId(sgc)) return sgc.toUpperCase()
      }
    }
  }
  return null
}

/**
 * Khóa dedup thống nhất — một người là một entity dù mang nhiều sgc/OBJ/tên.
 *
 * Mã hồ sơ (gallery / gán tay) phải thắng sgc. Một người có thể được cấp nhiều
 * sgc trong ca — mỗi lần bị che khuất hay camera lia đủ mạnh là tracker đứt và
 * cấp mã mới. Lấy sgc làm khoá thì cùng một người đã định danh vẫn tách thành
 * nhiều dòng trong tab Định danh: dòng còn sgc và dòng đã mang mã gallery.
 *
 * Cùng thứ tự ưu tiên với `resolveHeatmapEntityMasterId` để bảng sự kiện và
 * bản đồ nhiệt không đếm ra hai con số khác nhau.
 */
export function resolvePatrolCanonicalEntityKey(event: {
  objectId?: string | null
  trackWorkerId?: string | null
  objectLabel?: string | null
}): string {
  const profileKey = resolvePatrolProfileEntityKey(event)
  if (profileKey) return profileKey.toUpperCase()
  const sgc = resolvePatrolEventSgcKey(event)
  if (sgc) return sgc
  const objectId = event.objectId?.trim() ?? ''
  const trackWorkerId = event.trackWorkerId?.trim() ?? ''
  if (isPatrolPersId(objectId)) return objectId.toLowerCase()
  if (isPatrolPersId(trackWorkerId)) return trackWorkerId.toLowerCase()
  if (isPatrolSgcWorkerId(trackWorkerId)) return trackWorkerId.toUpperCase()
  if (isPatrolSgcWorkerId(objectId)) return objectId.toUpperCase()
  if (isPatrolGalleryWorkerId(objectId)) return objectId.toUpperCase()
  if (isPatrolGalleryWorkerId(trackWorkerId)) return trackWorkerId.toUpperCase()
  if (isPatrolObjectId(objectId)) return objectId.toUpperCase()
  return objectId.toUpperCase() || trackWorkerId || 'UNKNOWN'
}

/** Mã gallery p-* từ mã nhân sự — khớp backend patrol_gallery_worker_id. */
export function patrolGalleryWorkerIdFromEmployeeCode(code: string): string {
  const safe = code.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
  return safe ? `p-${safe}` : 'p-unknown'
}

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
  const sgc = resolvePatrolEventSgcKey(event)
  if (sgc) {
    const direct = getPatrolManualIdentityForSgc(sgc)
    if (direct) return direct.workerId.toUpperCase()
  }
  for (const raw of [event.objectId, event.trackWorkerId]) {
    const key = raw?.trim() ?? ''
    if (!key) continue
    const manual = getPatrolManualIdentity(key)
    if (manual) return manual.workerId.toUpperCase()
  }
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

/** Giữ đúng hoa/thường — BE + file gallery phân biệt `p-SGC-6688` vs `P-SGC-6688`. */
function normalizeGalleryWorkerId(id: string): string {
  const t = id.trim()
  if (!t) return t
  if (/^p-/i.test(t)) {
    return `p-${t.slice(2)}`
  }
  return t
}

/** Mã track ẩn danh sgc-* — khác mã nhân sự SGC-* (phân biệt hoa/thường). */
function isPatrolAnonymousTrackId(id: string): boolean {
  return /^sgc-/.test(id.trim())
}

function resolveGalleryIdFromEmployeeCode(code: string): string | null {
  const trimmed = code.trim()
  if (!trimmed) return null
  if (isPatrolGalleryWorkerId(trimmed)) return normalizeGalleryWorkerId(trimmed)
  if (isPatrolPersId(trimmed) || isPatrolObjectId(trimmed) || isPatrolAnonymousTrackId(trimmed)) {
    return null
  }
  return patrolGalleryWorkerIdFromEmployeeCode(trimmed)
}

/** Mã gallery worker để load ảnh quét mặt — ưu tiên p-* từ sự kiện đã khớp AI. */
export function resolveEventGalleryWorkerId(event: {
  objectId?: string | null
  trackWorkerId?: string | null
  objectLabel?: string | null
  employeeCode?: string | null
}, fallbackWorkerId?: string | null): string | null {
  const profileKey = resolvePatrolProfileEntityKey(event)
  if (profileKey && isPatrolGalleryWorkerId(profileKey)) {
    return normalizeGalleryWorkerId(profileKey)
  }
  for (const raw of [event.objectId, event.trackWorkerId, fallbackWorkerId]) {
    const key = raw?.trim() ?? ''
    if (isPatrolGalleryWorkerId(key)) return normalizeGalleryWorkerId(key)
  }
  for (const raw of [event.employeeCode, fallbackWorkerId]) {
    const galleryId = resolveGalleryIdFromEmployeeCode(raw ?? '')
    if (galleryId) return galleryId
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
