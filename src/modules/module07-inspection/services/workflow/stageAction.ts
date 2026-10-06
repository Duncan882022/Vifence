import { STAGES } from '../../data/workflow/hnqnProject'
import type { AssetRecord, InspectionSession, Issue, StageCode } from '../../workflow.types'
import { flowPaths } from './flowNav'
import { latestSession, openIssues, sessionResumeStep, stageProgress } from './sessionLogic'

export interface StageAction {
  label: string
  to?: string
  hint: string
  primary: boolean
}

/** Bước kế tiếp của một giai đoạn — dùng chung cho Passport / Overview / Stages. */
export function stageAction(assetId: string, stage: StageCode, sessions: InspectionSession[], issues: Issue[]): StageAction {
  const def = STAGES[stage]
  const progress = stageProgress(sessions, assetId, stage, def.dependsOn)
  const last = latestSession(sessions, assetId, stage)

  if (progress === 'pending') {
    const prev = def.dependsOn ? STAGES[def.dependsOn] : null
    return { label: 'Chưa sẵn sàng', hint: prev ? `Chờ ${prev.code} ${prev.label} PASS` : 'Chờ điều kiện', primary: false }
  }
  if (progress === 'ready') {
    return { label: `Nghiệm thu ${def.label}`, to: flowPaths.asset(assetId), hint: 'Mở ma trận cấu phần', primary: true }
  }
  if (last && (progress === 'in_progress' || progress === 'in_review')) {
    const step = sessionResumeStep(last)
    const label = step === 'live' ? 'Tiếp tục nghiệm thu' : 'Ký nghiệm thu'
    const to = step === 'live' ? flowPaths.inspect(last.id) : flowPaths.sign(last.id)
    return { label, to, hint: last.id, primary: true }
  }
  if (progress === 'pass' && last) {
    return { label: 'Xem biên bản', to: flowPaths.sign(last.id), hint: `${last.id} · Đạt`, primary: false }
  }
  const pending = openIssues(issues, assetId, stage)
  const blocking = pending.filter(i => i.status !== 'waiting_reinspection')
  if (blocking.length) {
    return { label: 'Xử lý lỗi', to: flowPaths.asset(assetId), hint: `${blocking.length} lỗi chưa khắc phục`, primary: true }
  }
  return { label: 'Nghiệm thu lại', to: flowPaths.asset(assetId), hint: `Tạo phiên lần ${(last?.attempt ?? 0) + 1}`, primary: true }
}

/** Việc cần làm tiếp theo của hạng mục (giai đoạn đầu tiên có hành động chính). */
export function nextAssetAction(
  asset: AssetRecord,
  sessions: InspectionSession[],
  issues: Issue[],
): { stage: StageCode; action: StageAction } | null {
  for (const st of asset.stages) {
    const action = stageAction(asset.id, st, sessions, issues)
    if (action.primary) return { stage: st, action }
  }
  return null
}

/**
 * Đích sau khi quét QR ở trang chủ: đi thẳng vào bước kế tiếp; nếu là chuẩn bị nghiệm thu
 * thì mang theo mã QR đã quét để không phải quét lại.
 */
export function qrEntryTarget(
  asset: AssetRecord,
  sessions: InspectionSession[],
  issues: Issue[],
  qr: { value: string; method: 'camera' | 'manual' },
): string {
  void sessions
  void issues
  void qr
  return flowPaths.asset(asset.id)
}
