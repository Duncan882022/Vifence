import { getPatrolManualIdentity, getPatrolManualIdentityForTk, findPatrolIdentityByWorkerId } from '../services/patrolManualIdentity.service'
import { expandPatrolIdentityAliasKeys, getPatrolTkKeysForObject } from '../services/patrolTkObjectLink.service'
import {
  isPatrolObjectId,
  isPatrolPersId,
  isPatrolTkWorkerId,
  isPatrolAnonymousTrackId,
  isPatrolTrackWorkerId,
} from './patrolWorkforceEventLabels'
import { isVerifiedWorkerLabel } from './workforceHeatmapUi'

/** tk-* gắn với event — từ track, object hoặc alias gallery/manual. */
export function resolvePatrolEventTkKey(event: {
  objectId?: string | null
  trackWorkerId?: string | null
}): string | null {
  for (const raw of [event.trackWorkerId, event.objectId]) {
    const key = raw?.trim() ?? ''
    if (isPatrolTrackWorkerId(key)) return key.toUpperCase()
  }
  for (const raw of [event.objectId, event.trackWorkerId]) {
    const key = raw?.trim() ?? ''
    if (!key) continue
    for (const alias of expandPatrolIdentityAliasKeys(key)) {
      if (isPatrolTrackWorkerId(alias)) return alias.toUpperCase()
    }
    if (isPatrolObjectId(key)) {
      for (const tk of getPatrolTkKeysForObject(key)) {
        if (isPatrolTrackWorkerId(tk)) return tk.toUpperCase()
      }
    }
  }
  return null
}

/** @deprecated Use resolvePatrolEventTkKey */
export const resolvePatrolEventSgcKey = resolvePatrolEventTkKey

/**
 * Khóa dedup thống nhất — một người là một entity dù mang nhiều tk/OBJ/tên.
 *
 * Mã hồ sơ (gallery / gán tay) phải thắng tk. Một người có thể được cấp nhiều
 * tk trong ca — mỗi lần bị che khuất hay camera lia đủ mạnh là tracker đứt và
 * cấp mã mới. Lấy tk làm khoá thì cùng một người đã định danh vẫn tách thành
 * nhiều dòng trong tab Định danh: dòng còn tk và dòng đã mang mã gallery.
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
  const tk = resolvePatrolEventTkKey(event)
  if (tk) return tk
  const objectId = event.objectId?.trim() ?? ''
  const trackWorkerId = event.trackWorkerId?.trim() ?? ''
  if (isPatrolPersId(objectId)) return objectId.toLowerCase()
  if (isPatrolPersId(trackWorkerId)) return trackWorkerId.toLowerCase()
  if (isPatrolTrackWorkerId(trackWorkerId)) return trackWorkerId.toUpperCase()
  if (isPatrolTrackWorkerId(objectId)) return objectId.toUpperCase()
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

/** Gallery worker id (p-*, w-*, c-*, u-*) — không phải tk/OBJ. */
export function isPatrolGalleryWorkerId(id?: string | null): boolean {
  if (!id) return false
  const t = id.trim()
  if (!t || t === 'unknown') return false
  if (isPatrolTrackWorkerId(t) || isPatrolObjectId(t)) return false
  if (/^(p-|w-|c-|u-|man-)/i.test(t)) return true
  return false
}

export function isPatrolProfileWorkerId(id?: string | null): boolean {
  if (!id) return false
  const t = id.trim()
  if (isPatrolGalleryWorkerId(t)) return true
  if (getPatrolManualIdentity(t) || findPatrolIdentityByWorkerId(t)) return true
  return isVerifiedWorkerLabel(t) && !isPatrolTrackWorkerId(t) && !isPatrolObjectId(t)
}

/** Khóa entity tab Định danh — gallery/manual workerId, không dùng tk. */
export function resolvePatrolProfileEntityKey(event: {
  objectId?: string | null
  trackWorkerId?: string | null
  objectLabel?: string | null
}): string | null {
  const tk = resolvePatrolEventTkKey(event)
  if (tk) {
    const direct = getPatrolManualIdentityForTk(tk)
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
    && !isPatrolTrackWorkerId(label)
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

function isAnonymousTrackIdForGallery(id: string): boolean {
  return isPatrolTkWorkerId(id) || isPatrolAnonymousTrackId(id)
}

function resolveGalleryIdFromEmployeeCode(code: string): string | null {
  const trimmed = code.trim()
  if (!trimmed) return null
  if (isPatrolGalleryWorkerId(trimmed)) return normalizeGalleryWorkerId(trimmed)
  if (isPatrolPersId(trimmed) || isPatrolObjectId(trimmed) || isAnonymousTrackIdForGallery(trimmed)) {
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
  if (/^(tk-|sgc-)/i.test(id)) return id.toUpperCase()
  if (/^OBJ-/i.test(id)) {
    const tks = getPatrolTkKeysForObject(id)
    if (tks[0]) {
      const bound = getPatrolManualIdentity(tks[0])
      if (bound) return bound.workerId.toUpperCase()
      return tks[0].toUpperCase()
    }
    return id
  }
  return id
}
