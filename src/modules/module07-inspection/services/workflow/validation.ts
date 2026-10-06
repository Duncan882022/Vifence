import type { CriterionDef, Evidence, InspectionSession } from '../../workflow.types'

export type ValidationKind =
  | 'not_checked'
  | 'mandatory_incomplete'
  | 'missing_evidence'
  | 'unresolved_review'
  | 'fail_without_support'
  | 'missing_measurement'

export interface ValidationProblem {
  kind: ValidationKind
  criterionId: string
  message: string
}

export interface ValidationResult {
  total: number
  completed: number
  problems: ValidationProblem[]
  ok: boolean
}

export const VALIDATION_LABEL: Record<ValidationKind, string> = {
  not_checked: 'Chưa kiểm tra',
  mandatory_incomplete: 'Bắt buộc chưa hoàn thành',
  missing_evidence: 'Thiếu bằng chứng',
  unresolved_review: 'REVIEW chưa xử lý',
  fail_without_support: 'FAIL thiếu comment/bằng chứng',
  missing_measurement: 'Thiếu số đo / thí nghiệm',
}

/** §17 Pre-Finish Validation. */
export function validateBeforeFinish(
  session: InspectionSession,
  criteria: CriterionDef[],
  evidence: Evidence[],
): ValidationResult {
  const problems: ValidationProblem[] = []
  let completed = 0
  const bySession = evidence.filter(e => e.ctx.sessionId === session.id)

  for (const c of criteria) {
    const r = session.results[c.id]
    const status = r?.status ?? 'not_checked'
    const ev = bySession.filter(e => e.ctx.criterionId === c.id)
    if (status !== 'not_checked') completed += 1
    if (r?.carriedFrom) continue

    if (status === 'not_checked') {
      problems.push({ kind: c.mandatory ? 'mandatory_incomplete' : 'not_checked', criterionId: c.id, message: `${c.code} ${c.title}` })
      continue
    }
    if (status === 'na') continue
    if (status === 'review') {
      problems.push({ kind: 'unresolved_review', criterionId: c.id, message: `${c.code} đang REVIEW` })
    }
    if (status === 'fail' && (!r?.comment?.trim() || ev.length === 0)) {
      problems.push({ kind: 'fail_without_support', criterionId: c.id, message: `${c.code} FAIL cần comment + bằng chứng` })
    }
    if ((c.method === 'measurement' || c.method === 'test') && !ev.some(e => e.type === 'measurement' || e.type === 'test')) {
      problems.push({ kind: 'missing_measurement', criterionId: c.id, message: `${c.code} chưa nhập ${c.method === 'test' ? 'kết quả thí nghiệm' : 'số đo'}` })
    } else if (c.evidenceRequired && c.method === 'camera' && ev.length === 0) {
      problems.push({ kind: 'missing_evidence', criterionId: c.id, message: `${c.code} chưa có snapshot / ghi âm` })
    }
  }

  return { total: criteria.length, completed, problems, ok: problems.length === 0 }
}
