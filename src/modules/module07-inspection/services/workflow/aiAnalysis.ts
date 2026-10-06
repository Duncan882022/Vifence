import type { AiFinding, CriterionDef, Evidence, InspectionSession } from '../../workflow.types'
import { sessionElapsedSec } from './sessionLogic'

const CLIP_SEC = 27

interface Scenario {
  verdict: AiFinding['verdict']
  observed: string
  summary: string
  count?: number
  confidence: number
}

/**
 * POC: kết quả AI dựng sẵn theo kịch bản demo (§19–20), không chạy model thật.
 * AI chỉ đề xuất — không bao giờ tự ra PASS/FAIL.
 */
function scenarioFor(c: CriterionDef, attempt: number): Scenario {
  const reinspection = attempt > 1
  if (c.group === 'quantity' && c.designValue != null) {
    if (c.id === 'GD02-2.01' && !reinspection) {
      const missing = 3
      return {
        verdict: 'not_confirmed',
        observed: `${c.designValue - missing} ${c.unit} xác nhận`,
        summary: `${c.designValue - missing}/${c.designValue} thanh xác nhận trên video · ${missing} NOT CONFIRMED (khuất tầm nhìn hoặc ngoài khung hình)`,
        count: missing,
        confidence: 0.86,
      }
    }
    return {
      verdict: 'pass_candidate',
      observed: `${c.designValue} ${c.unit} xác nhận`,
      summary: `${c.designValue}/${c.designValue} xác nhận trên video`,
      confidence: 0.91,
    }
  }
  if (c.id === 'GD02-2.04' && !reinspection) {
    return {
      verdict: 'review',
      observed: '148–176 mm',
      summary: '2 AREAS REQUIRE REVIEW · khoảng cách 172 mm và 176 mm vượt 150 ± 10 mm',
      count: 2,
      confidence: 0.74,
    }
  }
  if (c.id === 'GD02-2.04') {
    return { verdict: 'pass_candidate', observed: '146–158 mm', summary: 'Khoảng cách trong dung sai sau khắc phục', confidence: 0.88 }
  }
  return { verdict: 'pass_candidate', observed: c.design, summary: 'Không phát hiện sai lệch', confidence: 0.83 }
}

export function runMockAiAnalysis(
  session: InspectionSession,
  criteria: CriterionDef[],
  evidence: Evidence[],
): AiFinding[] {
  const capable = criteria.filter(c => c.aiCapable && !session.results[c.id]?.carriedFrom)
  const duration = Math.max(sessionElapsedSec(session), capable.length * CLIP_SEC)
  const span = duration / Math.max(capable.length, 1)
  return capable.map((c, idx) => {
    const marked = session.results[c.id]?.videoTs
      ?? evidence.find(e => e.ctx.sessionId === session.id && e.ctx.criterionId === c.id)?.ctx.videoTs
    const from = Math.max(0, Math.min(marked ?? idx * span, duration - CLIP_SEC))
    const s = scenarioFor(c, session.attempt)
    return {
      id: `ai-${session.id}-${c.code}`,
      criterionId: c.id,
      component: c.component,
      group: c.group,
      verdict: s.verdict,
      design: c.design,
      observed: s.observed,
      summary: s.summary,
      confidence: s.confidence,
      count: s.count,
      videoFrom: Math.round(from),
      videoTo: Math.round(from + CLIP_SEC),
    }
  })
}
