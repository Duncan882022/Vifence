import { getPatrolManualIdentity, getPatrolManualIdentityForSgc, findPatrolIdentityByWorkerId, resolvePatrolObjectLabel } from '../services/patrolManualIdentity.service'
import { isPatrolGalleryWorkerId } from '../utils/patrolIdentityEntity'
import { formatPersonOverlayLabel } from '@/modules/module03-safety/utils/personOverlayLabel'
import type { PersonRoiDisplay } from './types'

/** Mã kỹ thuật — không hiển thị làm nhãn khi đã lên tầng Định danh. */
export function isTechnicalPatrolWorkerLabel(label?: string | null): boolean {
  const s = (label ?? '').trim()
  if (!s || s.toLowerCase() === 'unknown') return true
  return /^(sgc-|p-|pers-|iden-|obj-|ptk)/i.test(s)
}

/**
 * Nhãn ROI live — tier `identity` luôn ưu tiên tên người, không mã sgc/p-*.
 */
export function resolvePatrolRoiDisplayLabel(track: PersonRoiDisplay): string {
  const wid = track.workerId?.trim() ?? ''
  const manual = getPatrolManualIdentity(wid) ?? getPatrolManualIdentityForSgc(wid)
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

  return formatPersonOverlayLabel(track.workerName, {
    workerId: track.workerId,
    workerName: track.workerName,
    manualDisplayName: manual?.workerName,
  })
}
