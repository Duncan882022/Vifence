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
 * Dấu thăng hạng trên nhãn ROI.
 *
 * Một thẻ Người có thể mang ảnh chụp badge "Đối tượng" vì lượt gặp bắt đầu khi
 * chưa thấy mặt. Không có dấu này thì người xem không phân biệt được đó là hệ
 * quả của thăng hạng hay nhận dạng sai. Dùng mũi tên chứ không dùng chữ vì
 * nhãn ROI nằm trên khung video, chỗ rất hẹp.
 */
const PROMOTED_ROI_SUFFIX = ' ↑'

function withPromotedMark(label: string, track: PersonRoiDisplay): string {
  if (!track.promotedFromObject) return label
  if (!label || label === '—') return label
  return `${label}${PROMOTED_ROI_SUFFIX}`
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
  if (manual?.workerName) return withPromotedMark(manual.workerName, track)

  if (track.tier === 'identity') {
    const bound = findPatrolIdentityByWorkerId(wid)
    if (bound?.workerName) return withPromotedMark(bound.workerName, track)

    const raw = track.workerName?.trim()
    if (raw && !isTechnicalPatrolWorkerLabel(raw)) return withPromotedMark(raw, track)

    if (isPatrolGalleryWorkerId(wid)) {
      const fromKey = resolvePatrolObjectLabel(wid, raw ?? '')
      if (fromKey && !isTechnicalPatrolWorkerLabel(fromKey)) {
        return withPromotedMark(fromKey, track)
      }
    }

    return '—'
  }

  if (track.tier === 'person') {
    const raw = track.workerName?.trim() ?? wid
    if (isPatrolTkWorkerId(wid) || isPatrolAnonymousTrackId(wid)) {
      return withPromotedMark(raw || wid, track)
    }
  }

  return withPromotedMark(
    formatPersonOverlayLabel(track.workerName, {
      workerId: track.workerId,
      workerName: track.workerName,
      manualDisplayName: manual?.workerName,
    }),
    track,
  )
}
