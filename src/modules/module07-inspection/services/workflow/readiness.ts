import { criteriaForStage } from '../../data/workflow/criteria'
import { STAGES } from '../../data/workflow/hnqnProject'
import type {
  AssetRecord,
  InspectionDocument,
  InspectionSession,
  Issue,
  ReadinessCheck,
  ReadinessRule,
  StageCode,
} from '../../workflow.types'
import { isStagePassed, latestSession, openIssues } from './sessionLogic'

export interface ReadinessResult {
  checks: ReadinessCheck[]
  blocked: boolean
  warnings: number
}

interface Input {
  asset: AssetRecord
  stage: StageCode
  sessions: InspectionSession[]
  issues: Issue[]
  documents: InspectionDocument[]
}

function docRule(rule: ReadinessRule, documents: InspectionDocument[]): ReadinessCheck {
  const doc = documents.find(d => d.id === rule.documentId)
  const ok = doc?.status === 'approved'
  return {
    id: rule.id,
    label: rule.label,
    state: ok ? 'ok' : rule.mode,
    detail: doc ? `${doc.code} · ${doc.status === 'approved' ? 'đã duyệt' : doc.status === 'pending' ? 'chờ duyệt' : 'chưa có'}` : 'Không tìm thấy chứng từ',
  }
}

/** §2 Inspection Readiness — chặn hoặc cảnh báo theo cấu hình giai đoạn. */
export function computeReadiness({ asset, stage, sessions, issues, documents }: Input): ReadinessResult {
  const def = STAGES[stage]
  const checks: ReadinessCheck[] = []

  checks.push({
    id: 'asset-stage',
    label: 'Đúng hạng mục & giai đoạn',
    state: asset.stages.includes(stage) ? 'ok' : 'block',
    detail: `${asset.code} · ${def.code} ${def.label}`,
  })

  if (def.dependsOn) {
    const prev = STAGES[def.dependsOn]
    const passed = isStagePassed(sessions, asset.id, def.dependsOn)
    checks.push({
      id: 'dependency',
      label: `Giai đoạn trước ${prev.code} ${prev.label} đã PASS`,
      state: passed ? 'ok' : 'block',
      detail: passed ? 'Đã ký nghiệm thu' : 'Chưa ký PASS — không được nghiệm thu vượt giai đoạn',
    })
  }

  for (const hp of def.holdPoints) {
    if (hp.documentId) {
      checks.push(docRule(hp, documents))
    } else {
      const ok = !def.dependsOn || isStagePassed(sessions, asset.id, def.dependsOn)
      checks.push({ id: hp.id, label: hp.label, state: ok ? 'ok' : hp.mode, detail: ok ? 'Đã đáp ứng' : 'Chưa đáp ứng' })
    }
  }

  const afc = documents.find(d => d.kind === 'AFC')
  const bim = documents.find(d => d.kind === 'BIM')
  checks.push({
    id: 'afc-bim',
    label: 'AFC / BIM đúng revision hiện hành',
    state: afc?.status === 'approved' && afc.revision === asset.afc.revision && bim?.status === 'approved' ? 'ok' : 'block',
    detail: `AFC ${asset.afc.revision} · BIM ${asset.bim.revision}`,
  })

  const criteria = criteriaForStage(stage)
  const tpl = documents.find(d => d.kind === 'TEMPLATE' && d.stage === stage)
  checks.push({
    id: 'checklist',
    label: 'Checklist đã tải',
    state: criteria.length > 0 && tpl?.status === 'approved' ? 'ok' : 'block',
    detail: `${def.checklistRevision} · ${criteria.length} tiêu chí`,
  })

  for (const rule of def.requiredDocs) checks.push(docRule(rule, documents))

  const measured = criteria.filter(c => c.method === 'measurement' || c.method === 'test')
  checks.push({
    id: 'measurement',
    label: 'Đo đạc / thí nghiệm yêu cầu',
    state: 'ok',
    detail: measured.length ? `${measured.length} tiêu chí cần nhập số đo / kết quả thí nghiệm trong phiên` : 'Không yêu cầu',
  })

  const last = latestSession(sessions, asset.id, stage)
  if (last && (last.status === 'in_progress' || last.status === 'paused')) {
    checks.push({ id: 'open-session', label: 'Không có phiên đang mở', state: 'block', detail: `${last.id} chưa kết thúc` })
  }
  if (last?.signOff?.result === 'pass') {
    checks.push({ id: 'already-pass', label: 'Giai đoạn chưa nghiệm thu', state: 'block', detail: `${last.id} đã PASS` })
  }
  const pending = openIssues(issues, asset.id, stage)
  if (pending.length) {
    const notReady = pending.filter(i => i.status !== 'waiting_reinspection')
    checks.push({
      id: 'issues',
      label: 'Tồn tại đã khắc phục',
      state: notReady.length ? 'warn' : 'ok',
      detail: notReady.length
        ? `${notReady.length} issue chưa ở trạng thái WAITING RE-INSPECTION`
        : `${pending.length} issue chờ nghiệm thu lại`,
    })
  }

  return {
    checks,
    blocked: checks.some(c => c.state === 'block'),
    warnings: checks.filter(c => c.state === 'warn').length,
  }
}
