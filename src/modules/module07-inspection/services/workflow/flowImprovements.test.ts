import { describe, expect, it } from 'vitest'
import { CRITERIA, criteriaForStage, findCriterion } from '../../data/workflow/criteria'
import { ASSETS, INSPECTORS } from '../../data/workflow/hnqnProject'
import type { CriterionDef, InspectionSession } from '../../workflow.types'
import { runMockAiAnalysis } from './aiAnalysis'
import { evaluateMeasurement, parseMeasuredValues, toleranceRange } from './measurementEval'
import { canReinspectFailedOnly, carryOverResults, criteriaToInspect } from './reinspection'
import { signOffGate, signerBlockReason } from './reviewLogic'
import { validateBeforeFinish } from './validation'

const crit = (id: string): CriterionDef => {
  const c = findCriterion(id)
  if (!c) throw new Error(`missing ${id}`)
  return c
}

function session(patch: Partial<InspectionSession> = {}): InspectionSession {
  return {
    id: 'INS-S002-G02-0001',
    assetId: ASSETS[0].id,
    stage: 'GD02',
    attempt: 1,
    inspector: { ...INSPECTORS.inspector },
    helmetId: 'HC-01',
    simulatedH1: false,
    status: 'in_review',
    qr: { value: 'SH-S002', method: 'camera', verifiedAt: '' },
    revisions: { afc: 'Rev.C', bim: 'IFC-2026.09', checklist: 'CL-DH-GD02 v2.0', itp: 'Rev.A', bptc: 'Rev.B', lockedAt: '' },
    startedAt: '2026-09-30T01:00:00.000Z',
    finishedAt: '2026-09-30T01:30:00.000Z',
    pauses: [],
    results: {},
    sync: 'synced',
    syncProgress: 100,
    reviews: {},
    ...patch,
  }
}

describe('measurement auto-evaluation', () => {
  it('parses separators and decimal commas', () => {
    expect(parseMeasuredValues('148; 176')).toEqual([148, 176])
    expect(parseMeasuredValues('148, 176')).toEqual([148, 176])
    expect(parseMeasuredValues('18,5')).toEqual([18.5])
  })

  it('handles symmetric, asymmetric, min, max and unit-converted tolerances', () => {
    expect(toleranceRange(crit('GD02-2.04'))).toEqual({ min: 140, max: 160 })
    expect(toleranceRange(crit('GD02-2.13'))?.min).toBe(480)
    expect(toleranceRange(crit('GD01-1.05'))?.max).toBe(6)
    const cover = toleranceRange(crit('GD02-2.05'))
    expect(cover?.max! - cover?.min!).toBe(10)
    const len = toleranceRange(crit('GD01-1.01'))
    expect(len?.max).toBeCloseTo(32.61, 6)
  })

  it('passes within tolerance and fails with the worst deviation', () => {
    expect(evaluateMeasurement(crit('GD02-2.04'), '148, 155')?.status).toBe('pass')
    const v = evaluateMeasurement(crit('GD02-2.04'), '148; 172; 176')
    expect(v?.status).toBe('fail')
    expect(v?.worstDeviation).toBe(16)
    expect(v?.summary).toContain('2/3')
    expect(evaluateMeasurement(crit('GD01-1.01'), '32.61')?.status).toBe('pass')
    expect(evaluateMeasurement(crit('GD02-2.13'), '470')?.status).toBe('fail')
  })

  it('declines to judge when tolerance is not numeric or units differ', () => {
    expect(evaluateMeasurement(crit('GD04-4.04'), '120')).toBeNull()
    expect(evaluateMeasurement(crit('GD02-2.04'), '15', 'cm')).toBeNull()
    expect(evaluateMeasurement(crit('GD02-2.04'), 'abc')).toBeNull()
  })

  it('every numeric measurement criterion is auto-evaluable', () => {
    const numeric = CRITERIA.filter(c => c.method === 'measurement' && c.designValue != null)
    expect(numeric.length).toBeGreaterThan(5)
    expect(numeric.every(c => toleranceRange(c) != null)).toBe(true)
  })
})

describe('partial re-inspection', () => {
  const criteria = criteriaForStage('GD02')
  const failed = session({
    status: 'signed',
    results: Object.fromEntries(criteria.map(c => [c.id, { status: c.id === 'GD02-2.01' ? 'fail' as const : 'pass' as const, updatedAt: '' }])),
    signOff: { result: 'require_rectification', inspector: { ...INSPECTORS.senior }, at: '', signatureDataUrl: '', revision: '', note: '', sessionId: 'INS-S002-G02-0001' },
  })

  it('only allows failed-only scope after a non-PASS sign-off', () => {
    expect(canReinspectFailedOnly(failed)).toBe(true)
    expect(canReinspectFailedOnly(undefined)).toBe(false)
    expect(canReinspectFailedOnly({ ...failed, signOff: { ...failed.signOff!, result: 'pass' } })).toBe(false)
  })

  it('carries PASS results and leaves failed criteria to inspect', () => {
    const carried = carryOverResults(failed, criteria, 'now')
    expect(carried['GD02-2.01']).toBeUndefined()
    expect(carried['GD02-2.04']?.carriedFrom).toBe(failed.id)
    const next = session({ id: 'INS-S002-G02-0002', attempt: 2, status: 'in_progress', results: carried })
    expect(criteriaToInspect(next, criteria).map(c => c.id)).toEqual(['GD02-2.01'])
  })

  it('does not ask evidence for carried criteria and skips them in AI', () => {
    const next = session({ id: 'INS-S002-G02-0002', attempt: 2, status: 'in_progress', results: carryOverResults(failed, criteria, 'now') })
    const v = validateBeforeFinish(next, criteria, [])
    expect(v.problems.every(p => p.criterionId === 'GD02-2.01')).toBe(true)
    expect(runMockAiAnalysis(next, criteria, []).map(f => f.criterionId)).toEqual(['GD02-2.01'])
  })
})

describe('two-person sign-off', () => {
  const criteria = criteriaForStage('GD02')
  const s = session({ results: Object.fromEntries(criteria.map(c => [c.id, { status: 'pass' as const, updatedAt: '' }])), ai: { status: 'done', findings: [] } })

  it('blocks non-senior signers and self-sign', () => {
    expect(signerBlockReason(s, INSPECTORS.inspector)).toMatch(/Trưởng TVGS/)
    expect(signerBlockReason({ ...s, inspector: { ...INSPECTORS.senior } }, INSPECTORS.senior)).toMatch(/tự ký/)
    expect(signerBlockReason(s, INSPECTORS.senior)).toBeNull()
  })

  it('folds the signer rule into canSign', () => {
    expect(signOffGate(s, criteria, [], INSPECTORS.inspector).canSign).toBe(false)
    expect(signOffGate(s, criteria, [], INSPECTORS.senior).canSign).toBe(true)
  })
})
