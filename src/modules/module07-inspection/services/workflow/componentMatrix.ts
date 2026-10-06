import { criteriaForComponent } from '../../data/workflow/criteria'
import { STAGES } from '../../data/workflow/hnqnProject'
import type {
  AssetRecord,
  ComponentId,
  InspectionSession,
  Issue,
  SessionScope,
  StageCode,
} from '../../workflow.types'
import { canReinspectFailedOnly } from './reinspection'
import { latestSession, stageProgress } from './sessionLogic'

export type MatrixCellKind = 'na' | 'locked' | 'waiting' | 'in_progress' | 'pass' | 'fail'

export interface MatrixCell {
  kind: MatrixCellKind
  checked: number
  total: number
  fail: number
  sessionId?: string
  hint: string
}

export type InspectionOpenPlan =
  | { action: 'blocked'; hint: string }
  | { action: 'resume'; sessionId: string }
  | { action: 'sign'; sessionId: string }
  | { action: 'start'; scope: SessionScope }

function componentResults(session: InspectionSession | undefined, stage: StageCode, component: ComponentId) {
  const list = criteriaForComponent(stage, component)
  const results = session?.results ?? {}
  const inspect = list.filter(c => !results[c.id]?.carriedFrom)
  const checked = inspect.filter(c => (results[c.id]?.status ?? 'not_checked') !== 'not_checked')
  const fail = inspect.filter(c => results[c.id]?.status === 'fail')
  return { list, inspect, checked, fail }
}

export function matrixCell(
  sessions: InspectionSession[],
  assetId: string,
  stage: StageCode,
  component: ComponentId,
): MatrixCell {
  const def = STAGES[stage]
  if (!def.components.includes(component)) {
    return { kind: 'na', checked: 0, total: 0, fail: 0, hint: 'Không thuộc giai đoạn này' }
  }

  const total = criteriaForComponent(stage, component).length
  const last = latestSession(sessions, assetId, stage)
  const progress = stageProgress(sessions, assetId, stage, def.dependsOn)

  if (progress === 'pending') {
    const prev = def.dependsOn ? STAGES[def.dependsOn] : null
    return {
      kind: 'locked',
      checked: 0,
      total,
      fail: 0,
      hint: prev ? `Chờ ${prev.label} đạt` : 'Chưa tới giai đoạn này',
    }
  }

  if (!last) {
    return { kind: 'waiting', checked: 0, total, fail: 0, hint: 'Chưa nghiệm thu' }
  }

  const { inspect, checked, fail } = componentResults(last, stage, component)
  const base = { checked: checked.length, total: inspect.length || total, fail: fail.length, sessionId: last.id }

  if (last.signOff?.result === 'pass') {
    return { ...base, checked: total, total, fail: 0, kind: 'pass', hint: 'Đã ký đạt' }
  }

  if (fail.length > 0) {
    return { ...base, kind: 'fail', hint: `${fail.length} tiêu chí không đạt` }
  }

  if (last.status === 'in_progress' || last.status === 'paused') {
    if (checked.length === 0) return { ...base, kind: 'waiting', hint: 'Chưa chấm' }
    if (checked.length >= inspect.length && inspect.length > 0) {
      return { ...base, kind: 'pass', hint: 'Cấu phần đã chấm xong' }
    }
    return { ...base, kind: 'in_progress', hint: `${checked.length}/${inspect.length} tiêu chí` }
  }

  if (last.signOff) {
    return inspect.length === 0 || checked.length >= inspect.length
      ? { ...base, kind: 'pass', hint: 'Đạt (phiên trước)' }
      : { ...base, kind: 'waiting', hint: 'Chờ nghiệm thu lại' }
  }

  if (checked.length >= inspect.length && inspect.length > 0) {
    return { ...base, kind: 'pass', hint: 'Chờ ký' }
  }
  return { ...base, kind: 'waiting', hint: 'Chưa chấm đủ' }
}

export function inspectionOpenPlan(
  asset: AssetRecord,
  stage: StageCode,
  component: ComponentId,
  sessions: InspectionSession[],
  _issues: Issue[],
): InspectionOpenPlan {
  const cell = matrixCell(sessions, asset.id, stage, component)
  if (cell.kind === 'na') return { action: 'blocked', hint: 'Cấu phần không thuộc giai đoạn này' }
  if (cell.kind === 'locked') return { action: 'blocked', hint: cell.hint }

  const last = latestSession(sessions, asset.id, stage)
  if (last && (last.status === 'in_progress' || last.status === 'paused')) {
    return { action: 'resume', sessionId: last.id }
  }
  if (last && !last.signOff) {
    return { action: 'sign', sessionId: last.id }
  }
  if (cell.kind === 'pass' && last?.signOff?.result === 'pass') {
    return { action: 'sign', sessionId: last.id }
  }
  return { action: 'start', scope: canReinspectFailedOnly(last) ? 'failed_only' : 'full' }
}

export function matrixSummary(sessions: InspectionSession[], issues: Issue[], assetId: string, stages: StageCode[]) {
  let waiting = 0
  let failing = 0
  let signing = 0
  for (const stage of stages) {
    const last = latestSession(sessions, assetId, stage)
    if (last && !last.signOff && last.status !== 'in_progress' && last.status !== 'paused') signing += 1
    const progress = stageProgress(sessions, assetId, stage, STAGES[stage].dependsOn)
    if (progress === 'require_rectification' || progress === 'reinspection') failing += 1
    if (progress === 'ready') waiting += 1
  }
  const openIssues = issues.filter(i => i.assetId === assetId && i.status !== 'closed').length
  return { waiting, failing, signing, openIssues }
}
