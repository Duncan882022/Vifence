import { getPatrolManualIdentity, getPatrolManualIdentityForTk, findPatrolIdentityByWorkerId, resolvePatrolObjectLabel } from '../services/patrolManualIdentity.service'
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

/**
 * Nhãn ROI live — tier `identity` luôn ưu tiên tên người, không mã tk/p-*.
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
      if (fromKey && !isTechnicalPatrolWorkerLabel(fromKey)) return fromKey
    }

    return '—'
  }

  if (track.tier === 'person') {
    const raw = track.workerName?.trim() ?? wid
    if (isPatrolTkWorkerId(wid) || isPatrolAnonymousTrackId(wid)) return raw || wid
  }

  return formatPersonOverlayLabel(track.workerName, {
    workerId: track.workerId,
    workerName: track.workerName,
    manualDisplayName: manual?.workerName,
  })
}
