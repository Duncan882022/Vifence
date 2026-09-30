import { STAGES } from '../../data/workflow/hnqnProject'
import type { InspectionSession, Issue, StageCode } from '../../workflow.types'
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
    return { label: `Nghiệm thu ${def.code}`, to: flowPaths.prepare(assetId, stage), hint: 'Readiness → Lưu ý → QR → H1 → Start', primary: true }
  }
  if (last && (progress === 'in_progress' || progress === 'in_review')) {
    const step = sessionResumeStep(last)
    const label = step === 'live' ? 'Tiếp tục phiên' : step === 'finish' ? 'Đồng bộ video' : 'Xem xét kết quả'
    const to = step === 'live' ? flowPaths.live(last.id) : step === 'finish' ? flowPaths.finish(last.id) : flowPaths.review(last.id)
    return { label, to, hint: last.id, primary: true }
  }
  if (progress === 'pass' && last) {
    return { label: 'Xem báo cáo', to: flowPaths.report(last.id), hint: `${last.id} · PASS`, primary: false }
  }
  const pending = openIssues(issues, assetId, stage)
  const blocking = pending.filter(i => i.status !== 'waiting_reinspection')
  if (blocking.length) {
    return { label: 'Xử lý issue', to: flowPaths.asset(assetId, 'issues'), hint: `${blocking.length} issue chưa khắc phục xong`, primary: true }
  }
  return { label: 'Nghiệm thu lại', to: flowPaths.prepare(assetId, stage), hint: `Tạo phiên lần ${(last?.attempt ?? 0) + 1}`, primary: true }
}
