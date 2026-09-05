import { getPatrolManualIdentity, getPatrolManualIdentityForTk, findPatrolIdentityByWorkerId, resolvePatrolObjectLabel } from '../services/patrolManualIdentity.service'
import { getPatrolObjectIdForTk } from '../services/patrolTkObjectLink.service'
import { isPatrolGalleryWorkerId } from '../utils/patrolIdentityEntity'
import { isPatrolTkWorkerId, isPatrolAnonymousTrackId } from '../utils/patrolWorkforceEventLabels'
import { formatPersonOverlayLabel } from '@/modules/module03-safety/utils/personOverlayLabel'
import type { PersonRoiDisplay } from './types'

/** Mã kỹ thuật — không hiển thị làm nhãn khi đã lên tầng Định danh. */
export function isTechnicalPatrolWorkerLabel(label?: string | null): boolean {
  const s = (label ?? '').trim()
  if (!s || s.toLowerCase() === 'unknown') return true
  return /^(tk-|p-|pers-|iden-|obj-|ptk)/i.test(s)
}

function isGenericPersonLabel(label?: string | null): boolean {
  const s = (label ?? '').trim().toLowerCase()
  return !s || s === 'người' || s === 'cn' || s === 'person' || s === 'unknown'
}

/** Mã obj-* gốc — ưu tiên BE, fallback liên kết tk↔obj trên FE. */
export function resolvePatrolRoiObjectCode(track: Pick<PersonRoiDisplay, 'promotedFrom' | 'workerId'>): string | null {
  const fromPayload = track.promotedFrom?.map(id => id.trim()).find(id => /^obj-/i.test(id))
  if (fromPayload) return fromPayload
  const wid = track.workerId?.trim() ?? ''
  if (!wid) return null
  return getPatrolObjectIdForTk(wid)
}

/**
 * Nhãn ROI live — tier `identity` ưu tiên tên; tier `person` hiện mã tk-*;
 * chỉ tier `object` mới hiện mã obj-* (thẻ sự kiện vẫn giữ obj gốc qua promotedFrom).
 */
export function resolvePatrolRoiDisplayLabel(track: PersonRoiDisplay): string {
  if (track.peakGroup && track.peakGroupIndex) {
    const sizeHint = track.peakGroupSize ? ` · Nhóm ${track.peakGroupSize}` : ''
    return `#${track.peakGroupIndex}${sizeHint}`
  }

  const wid = track.workerId?.trim() ?? ''
  const manual = getPatrolManualIdentity(wid) ?? getPatrolManualIdentityForTk(wid)
  if (manual?.workerName) return manual.workerName

  if (track.tier === 'identity') {
    const bound = findPatrolIdentityByWorkerId(wid)
    if (bound?.workerName) return bound.workerName

    const raw = track.workerName?.trim()
    if (raw && !isTechnicalPatrolWorkerLabel(raw)) return raw

    if (isPatrolGalleryWorkerId(wid)) {
      const fromKey = resolvePatrolObjectLabel(wid, raw ?? '')
      if (fromKey && !isTechnicalPatrolWorkerLabel(fromKey)) {
        return fromKey
      }
    }

    return '—'
  }

  if (track.tier === 'object') {
    const objectCode = resolvePatrolRoiObjectCode(track)
    if (objectCode) return objectCode
  }

  if (track.tier === 'person') {
    const raw = track.workerName?.trim() ?? wid
    if (isPatrolTkWorkerId(wid) || isPatrolAnonymousTrackId(wid)) {
      if (!isGenericPersonLabel(raw)) return raw
      return wid || raw
    }
  }

  return formatPersonOverlayLabel(track.workerName, {
    workerId: track.workerId,
    workerName: track.workerName,
    manualDisplayName: manual?.workerName,
  })
}
