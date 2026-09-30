import { describe, expect, it } from 'vitest'
import { CRITERIA, criteriaForStage } from '../../data/workflow/criteria'
import { ASSETS, COMPONENTS, DOCUMENTS, INSPECTORS, STAGES } from '../../data/workflow/hnqnProject'
import { SEED_SESSIONS } from '../../data/workflow/seedHistory'
import type { BimObject } from '../../types'
import type { Evidence, InspectionSession, Issue } from '../../workflow.types'
import { runMockAiAnalysis } from './aiAnalysis'
import { componentObjectSets } from './componentBim'
import { findAssetByQr } from './flowNav'
import { formatClock, issueIdFor, sessionIdFor } from './ids'
import { computeReadiness } from './readiness'
import { finalStatus, signOffGate, statusFromVerdict } from './reviewLogic'
import { cameraDisplayState, sessionElapsedSec, stageProgress } from './sessionLogic'
import { validateBeforeFinish } from './validation'

const S002 = ASSETS[0]

function session(patch: Partial<InspectionSession> = {}): InspectionSession {
  return {
    id: 'INS-S002-G02-0001',
    assetId: S002.id,
    stage: 'GD02',
    attempt: 1,
    inspector: { ...INSPECTORS.inspector },
    helmetId: 'HC-01',
    simulatedH1: false,
    status: 'in_progress',
    qr: { value: 'SH-S002', method: 'camera', verifiedAt: '2026-09-30T01:00:00.000Z' },
    revisions: { afc: 'Rev.C', bim: 'IFC-2026.09', checklist: 'CL-DH-GD02 v2.0', itp: 'Rev.A', bptc: 'Rev.B', lockedAt: '2026-09-30T01:00:00.000Z' },
    startedAt: '2026-09-30T01:00:00.000Z',
    pauses: [],
    results: {},
    sync: 'pending',
    syncProgress: 0,
    reviews: {},
    ...patch,
  }
}

describe('ids', () => {
  it('formats session / issue ids per spec', () => {
    expect(sessionIdFor('S002', 'GD02', 1)).toBe('INS-S002-G02-0001')
    expect(issueIdFor('S002', 23)).toBe('ISSUE-S002-023')
    expect(formatClock(861)).toBe('00:14:21')
  })
})

describe('data', () => {
  it('uses IFC counts for GĐ02 quantities and marks non-IFC values MOCK', () => {
    const d16 = CRITERIA.find(c => c.id === 'GD02-2.01')
    expect(d16?.designValue).toBe(414)
    expect(d16?.source.kind).toBe('IFC')
    expect(CRITERIA.find(c => c.id === 'GD02-2.04')?.source.kind).toBe('MOCK')
    for (const st of Object.values(STAGES)) {
      const list = criteriaForStage(st.id)
      expect(list.length).toBeGreaterThan(0)
      expect(list.every(c => st.components.includes(c.component))).toBe(true)
    }
  })

  it('resolves QR to asset only', () => {
    expect(findAssetByQr('sh-s002')?.id).toBe('s002')
    expect(findAssetByQr('SH-S003')).toBeUndefined()
  })
})

describe('session logic', () => {
  it('excludes paused time from elapsed', () => {
    const s = session({ pauses: [{ from: '2026-09-30T01:05:00.000Z', to: '2026-09-30T01:07:00.000Z' }] })
    expect(sessionElapsedSec(s, Date.parse('2026-09-30T01:10:00.000Z'))).toBe(480)
  })

  it('treats live lost as not losing recording', () => {
    expect(cameraDisplayState('lost', 'local')).toBe('LIVE LOST / RECORDING LOCAL')
    expect(cameraDisplayState('live', 'recording')).toBe('LIVE + RECORDING')
    expect(cameraDisplayState('connecting', 'off')).toBe('CONNECTING')
    expect(cameraDisplayState('lost', 'off')).toBe('DISCONNECTED')
  })

  it('derives stage progress from dependency + sign-off', () => {
    expect(stageProgress(SEED_SESSIONS, S002.id, 'GD01', null)).toBe('pass')
    expect(stageProgress(SEED_SESSIONS, S002.id, 'GD02', 'GD01')).toBe('ready')
    expect(stageProgress(SEED_SESSIONS, S002.id, 'GD03', 'GD02')).toBe('pending')
  })
})

describe('readiness', () => {
  it('allows GĐ02 after GĐ01 PASS and blocks GĐ03 / GĐ04', () => {
    const base = { asset: S002, sessions: SEED_SESSIONS, issues: [] as Issue[], documents: DOCUMENTS }
    expect(computeReadiness({ ...base, stage: 'GD02' }).blocked).toBe(false)
    expect(computeReadiness({ ...base, stage: 'GD03' }).blocked).toBe(true)
    const gd4 = computeReadiness({ ...base, stage: 'GD04' })
    expect(gd4.checks.find(c => c.id === 'hp-gd04-strength')?.state).toBe('block')
  })

  it('blocks re-running a stage that already passed', () => {
    const r = computeReadiness({ asset: S002, stage: 'GD01', sessions: SEED_SESSIONS, issues: [], documents: DOCUMENTS })
    expect(r.checks.find(c => c.id === 'already-pass')?.state).toBe('block')
  })
})

describe('pre-finish validation', () => {
  it('reports not-checked, FAIL without support and missing measurement', () => {
    const criteria = criteriaForStage('GD02')
    const s = session({
      results: {
        'GD02-2.01': { status: 'fail', updatedAt: '' },
        'GD02-2.05': { status: 'pass', updatedAt: '' },
      },
    })
    const v = validateBeforeFinish(s, criteria, [])
    expect(v.completed).toBe(2)
    expect(v.total).toBe(criteria.length)
    const kinds = new Set(v.problems.map(p => p.kind))
    expect(kinds.has('mandatory_incomplete')).toBe(true)
    expect(kinds.has('fail_without_support')).toBe(true)
    expect(v.problems.some(p => p.kind === 'missing_measurement' && p.criterionId === 'GD02-2.05')).toBe(true)
    expect(v.ok).toBe(false)
  })
})

describe('AI mock + review', () => {
  const criteria = criteriaForStage('GD02')
  const evidence: Evidence[] = []

  it('reports NOT CONFIRMED (never missing) and REVIEW areas on first attempt only', () => {
    const f1 = runMockAiAnalysis(session({ finishedAt: '2026-09-30T01:30:00.000Z' }), criteria, evidence)
    const d16 = f1.find(f => f.criterionId === 'GD02-2.01')
    expect(d16?.verdict).toBe('not_confirmed')
    expect(d16?.count).toBe(3)
    expect(d16?.summary).not.toMatch(/missing/i)
    expect(f1.find(f => f.criterionId === 'GD02-2.04')?.verdict).toBe('review')
    const f2 = runMockAiAnalysis(session({ attempt: 2, finishedAt: '2026-09-30T01:30:00.000Z' }), criteria, evidence)
    expect(f2.every(f => f.verdict === 'pass_candidate')).toBe(true)
  })

  it('gates sign-off on decisions, REVIEW and FAIL issues', () => {
    const findings = runMockAiAnalysis(session({ finishedAt: '2026-09-30T01:30:00.000Z' }), criteria, evidence)
    const results = Object.fromEntries(criteria.map(c => [c.id, { status: 'pass' as const, updatedAt: '' }]))
    let s = session({ status: 'in_review', results, ai: { status: 'done', findings } })
    expect(signOffGate(s, criteria, []).canSign).toBe(false)

    const reviews = Object.fromEntries(findings.map(f => [f.id, {
      findingId: f.id, action: 'accept' as const, finalStatus: statusFromVerdict(f.verdict), comment: '', by: 'x', at: '',
    }]))
    s = { ...s, reviews }
    const gate = signOffGate(s, criteria, [])
    expect(gate.unresolvedReview).toContain('GD02-2.04')
    expect(finalStatus(s, 'GD02-2.01')).toBe('fail')
    expect(gate.failsWithoutIssue).toContain('GD02-2.01')

    const d4 = findings.find(f => f.criterionId === 'GD02-2.04')
    if (!d4) throw new Error('missing finding')
    s = { ...s, reviews: { ...reviews, [d4.id]: { ...reviews[d4.id], action: 'override', finalStatus: 'fail' } } }
    const issues: Issue[] = ['GD02-2.01', 'GD02-2.04'].map((criterionId, i) => ({
      id: `ISSUE-S002-00${i + 1}`, assetId: S002.id, stage: 'GD02', component: 'bottom', criterionId, sessionId: s.id,
      design: '', observed: '', videoTs: 0, comment: '', responsible: '', status: 'open', history: [],
    }))
    const ready = signOffGate(s, criteria, issues)
    expect(ready.canSign).toBe(true)
    expect(ready.allowed).toEqual(['require_rectification', 'reinspection'])
  })

  it('blocks PASS while a mandatory criterion is NOT CHECKED', () => {
    const findings = runMockAiAnalysis(session({ attempt: 2, finishedAt: '2026-09-30T01:30:00.000Z' }), criteria, evidence)
    const reviews = Object.fromEntries(findings.map(f => [f.id, {
      findingId: f.id, action: 'accept' as const, finalStatus: statusFromVerdict(f.verdict), comment: '', by: 'x', at: '',
    }]))
    const manual = criteria.find(c => c.mandatory && !findings.some(f => f.criterionId === c.id))
    if (!manual) throw new Error('expected a manual-only mandatory criterion')
    const s = session({ attempt: 2, status: 'in_review', ai: { status: 'done', findings }, reviews })
    const gate = signOffGate(s, criteria, [])
    expect(gate.uncheckedMandatory).toContain(manual.id)
    expect(gate.allowed).toEqual(['reinspection'])

    const overridden = { ...s, reviews: { ...reviews, [`crit-${manual.id}`]: { findingId: `crit-${manual.id}`, action: 'override' as const, finalStatus: 'pass' as const, comment: 'đo lại', by: 'x', at: '' } } }
    const others = criteria.filter(c => c.mandatory && c.id !== manual.id && !findings.some(f => f.criterionId === c.id))
    const all = others.reduce((acc, c) => ({ ...acc, reviews: { ...acc.reviews, [`crit-${c.id}`]: { findingId: `crit-${c.id}`, action: 'override' as const, finalStatus: 'pass' as const, comment: '', by: 'x', at: '' } } }), overridden)
    expect(signOffGate(all, criteria, []).allowed).toContain('pass')
  })
})

describe('component BIM isolation', () => {
  const obj = (id: string, kind: BimObject['kind'], tags: string[], bars = 0): BimObject => ({
    id, ifcGuid: id, ifcClass: 'x', name: id, kind, stage: 'gd1', assetId: 'dam-hop', parentId: null,
    provenance: 'extracted', source: 'suon', tags, properties: bars ? [{ key: 'bars', label: 'Số thanh', value: String(bars), provenance: 'extracted' }] : [],
  })
  const objects = [
    obj('r1', 'rebar', ['rebar', 'zone-bottom'], 414),
    obj('r2', 'rebar', ['rebar', 'zone-bottom', 'rebar-anchor-zone'], 106),
    obj('r3', 'rebar', ['rebar', 'zone-web-left'], 754),
    obj('c1', 'concrete', ['concrete', 'zone-bottom']),
  ]

  it('isolates the component and keeps same-zone concrete as context', () => {
    const bottom = componentObjectSets(objects, COMPONENTS.bottom, ['rebar'])
    expect(bottom.focusIds).toEqual(['r1'])
    expect(bottom.contextIds).toEqual(['c1'])
    expect(bottom.barCount).toBe(414)
    expect(componentObjectSets(objects, COMPONENTS.diaphragm, ['rebar']).focusIds).toEqual(['r2'])
  })
})
