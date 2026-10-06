import { describe, expect, it } from 'vitest'
import { ASSETS, INSPECTORS } from '../../data/workflow/hnqnProject'
import { SEED_SESSIONS } from '../../data/workflow/seedHistory'
import type { InspectionSession } from '../../workflow.types'
import { inspectionOpenPlan, matrixCell } from './componentMatrix'
import { flowPaths, legacyFlowRedirect } from './flowNav'

const S002 = ASSETS[0]

function session(patch: Partial<InspectionSession> = {}): InspectionSession {
  return {
    id: 'INS-S002-G02-0001',
    assetId: S002.id,
    stage: 'GD02',
    attempt: 1,
    inspector: { ...INSPECTORS.inspector },
    helmetId: 'HC-01',
    simulatedH1: true,
    status: 'in_progress',
    qr: { value: 'SH-S002', method: 'manual', verifiedAt: '' },
    revisions: { afc: 'Rev.C', bim: 'IFC-2026.09', checklist: 'CL-DH-GD02 v2.0', itp: 'Rev.A', bptc: 'Rev.B', lockedAt: '' },
    startedAt: '2026-09-30T01:00:00.000Z',
    pauses: [],
    results: {},
    sync: 'pending',
    syncProgress: 0,
    reviews: {},
    ...patch,
  }
}

describe('component matrix', () => {
  it('marks GĐ01 components as passed from seed', () => {
    const cell = matrixCell(SEED_SESSIONS, S002.id, 'GD01', 'bottom')
    expect(cell.kind).toBe('pass')
    expect(inspectionOpenPlan(S002, 'GD01', 'bottom', SEED_SESSIONS, []).action).toBe('sign')
  })

  it('unlocks GĐ02 after GĐ01 pass and locks GĐ03', () => {
    expect(matrixCell(SEED_SESSIONS, S002.id, 'GD02', 'web-left').kind).toBe('waiting')
    expect(matrixCell(SEED_SESSIONS, S002.id, 'GD03', 'bottom').kind).toBe('locked')
    expect(matrixCell(SEED_SESSIONS, S002.id, 'GD01', 'cable-bottom').kind).toBe('na')
  })

  it('resumes an in-progress session and starts a new one when ready', () => {
    const live = session()
    const all = [...SEED_SESSIONS, live]
    expect(inspectionOpenPlan(S002, 'GD02', 'web-left', all, [])).toEqual({ action: 'resume', sessionId: live.id })
    expect(inspectionOpenPlan(S002, 'GD02', 'web-left', SEED_SESSIONS, [])).toEqual({ action: 'start', scope: 'full' })
  })

  it('shows fail count while inspecting a component', () => {
    const live = session({
      results: {
        'GD02-2.06': { status: 'fail', updatedAt: '', comment: 'thiếu' },
        'GD02-2.07': { status: 'pass', updatedAt: '' },
      },
    })
    const cell = matrixCell([...SEED_SESSIONS, live], S002.id, 'GD02', 'web-left')
    expect(cell.kind).toBe('fail')
    expect(cell.fail).toBe(1)
    expect(cell.checked).toBe(2)
  })
})

describe('flow BIM routes', () => {
  it('opens the dedicated BIM page for an asset and stage', () => {
    expect(flowPaths.bim('s002')).toBe('/inspection/asset/s002/bim')
    expect(flowPaths.bim('s002', 'GD02', 'web-left')).toBe('/inspection/asset/s002/bim?stage=GD02&c=web-left')
  })

  it('rewrites the old BIM workspace URL onto the BIM page', () => {
    expect(legacyFlowRedirect('sgc-dsct')).toBe('/inspection/asset/s002/bim')
    expect(legacyFlowRedirect('unknown')).toBeNull()
  })
})
