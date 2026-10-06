import type { CriterionDef, CriterionResult, InspectionSession } from '../../workflow.types'
import { finalStatus } from './reviewLogic'

/** Phiên trước đã ký nhưng chưa PASS → được nghiệm thu lại chỉ phần chưa đạt. */
export function canReinspectFailedOnly(previous: InspectionSession | undefined): previous is InspectionSession {
  return Boolean(previous?.signOff && previous.signOff.result !== 'pass')
}

/** Kết quả PASS / NA đã được người duyệt chốt ở phiên trước — mang sang phiên mới, không phải kiểm lại. */
export function carryOverResults(
  previous: InspectionSession,
  criteria: CriterionDef[],
  at: string,
): Record<string, CriterionResult> {
  const out: Record<string, CriterionResult> = {}
  for (const c of criteria) {
    const status = finalStatus(previous, c.id)
    if (status !== 'pass' && status !== 'na') continue
    const prev = previous.results[c.id]
    out[c.id] = { status, observed: prev?.observed, comment: prev?.comment, updatedAt: at, carriedFrom: previous.id }
  }
  return out
}

/** Tiêu chí phải kiểm trong phiên (bỏ qua mục kế thừa). */
export function criteriaToInspect(session: InspectionSession, criteria: CriterionDef[]): CriterionDef[] {
  return criteria.filter(c => !session.results[c.id]?.carriedFrom)
}
