import type { AiVerdict, CriterionDef, CriterionStatus, InspectionSession, Inspector, Issue, SignOffResult } from '../../workflow.types'

/** Accept = đồng ý với AI. AI không tự PASS/FAIL — người duyệt quyết định. */
export function statusFromVerdict(verdict: AiVerdict): CriterionStatus {
  if (verdict === 'pass_candidate') return 'pass'
  if (verdict === 'review') return 'review'
  return 'fail'
}

/** Khoá quyết định: id phát hiện AI, hoặc `crit-<id>` cho tiêu chí chỉ kiểm thủ công. */
export function decisionKey(session: InspectionSession, criterionId: string): string {
  return session.ai?.findings.find(f => f.criterionId === criterionId)?.id ?? `crit-${criterionId}`
}

export function finalStatus(session: InspectionSession, criterionId: string): CriterionStatus {
  const decision = session.reviews[decisionKey(session, criterionId)]
  return decision?.finalStatus ?? session.results[criterionId]?.status ?? 'not_checked'
}

export interface SignOffGate {
  undecided: number
  unresolvedReview: string[]
  fails: string[]
  failsWithoutIssue: string[]
  uncheckedMandatory: string[]
  allowed: SignOffResult[]
  /** Lý do người đang thao tác không được ký (null = được ký). */
  signerBlock: string | null
  canSign: boolean
}

/** Nguyên tắc 2 người: chỉ Trưởng TVGS ký, và không ký phiên do chính mình thực hiện. */
export function signerBlockReason(session: InspectionSession, signer: Inspector | undefined): string | null {
  if (!signer) return null
  if (signer.role !== 'senior_inspector') return 'Chỉ Trưởng TVGS được ký nghiệm thu'
  if (signer.id === session.inspector.id) return 'Người thực hiện phiên không được tự ký — cần người duyệt khác'
  return null
}

/**
 * §24: chỉ ký khi mọi phát hiện AI đã có quyết định, không còn REVIEW, FAIL phải có issue.
 * PASS chỉ khi không còn tiêu chí bắt buộc NOT CHECKED.
 */
export function signOffGate(session: InspectionSession, criteria: CriterionDef[], issues: Issue[], signer?: Inspector): SignOffGate {
  const findings = session.ai?.findings ?? []
  const undecided = findings.filter(f => !session.reviews[f.id]).length
  const statuses = criteria.map(c => ({ id: c.id, mandatory: c.mandatory, status: finalStatus(session, c.id) }))
  const unresolvedReview = statuses.filter(s => s.status === 'review').map(s => s.id)
  const fails = statuses.filter(s => s.status === 'fail').map(s => s.id)
  const uncheckedMandatory = statuses.filter(s => s.mandatory && s.status === 'not_checked').map(s => s.id)
  const sessionIssues = issues.filter(i => i.sessionId === session.id)
  const failsWithoutIssue = fails.filter(id => !sessionIssues.some(i => i.criterionId === id))
  const allowed: SignOffResult[] = fails.length > 0
    ? ['require_rectification', 'reinspection']
    : uncheckedMandatory.length > 0 ? ['reinspection'] : ['pass', 'reinspection']
  const signerBlock = signerBlockReason(session, signer)
  return {
    undecided,
    unresolvedReview,
    fails,
    failsWithoutIssue,
    uncheckedMandatory,
    allowed,
    signerBlock,
    canSign: undecided === 0 && unresolvedReview.length === 0 && failsWithoutIssue.length === 0 && !session.signOff && !signerBlock,
  }
}
