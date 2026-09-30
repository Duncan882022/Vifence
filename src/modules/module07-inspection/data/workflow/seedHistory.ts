import type { AuditEvent, CriterionResult, InspectionSession } from '../../workflow.types'
import { criteriaForStage } from './criteria'
import { ASSETS, H1_HELMET_ID, INSPECTORS } from './hnqnProject'

const S002 = ASSETS[0]

const GD01_START = '2026-09-26T01:10:00.000Z'
const GD01_END = '2026-09-26T01:52:00.000Z'

function passResults(): Record<string, CriterionResult> {
  const out: Record<string, CriterionResult> = {}
  criteriaForStage('GD01').forEach((c, i) => {
    out[c.id] = { status: 'pass', observed: c.design, updatedAt: GD01_START, videoTs: 120 + i * 240 }
  })
  return out
}

/** Lịch sử có sẵn cho demo: GĐ01 Ván khuôn đã PASS (§29). */
export const SEED_SESSIONS: InspectionSession[] = [
  {
    id: 'INS-S002-G01-0001',
    assetId: S002.id,
    stage: 'GD01',
    attempt: 1,
    inspector: { ...INSPECTORS.inspector },
    helmetId: H1_HELMET_ID,
    simulatedH1: false,
    status: 'signed',
    qr: { value: S002.qrId, method: 'camera', verifiedAt: GD01_START },
    revisions: { afc: 'Rev.C', bim: 'IFC-2026.09', checklist: 'CL-DH-GD01 v1.2', itp: 'Rev.A', bptc: 'Rev.B', lockedAt: GD01_START },
    startedAt: GD01_START,
    finishedAt: GD01_END,
    pauses: [],
    results: passResults(),
    sync: 'synced',
    syncProgress: 100,
    video: { source: 'none', durationSec: 42 * 60 },
    ai: { status: 'done', findings: [], finishedAt: GD01_END },
    reviews: {},
    signOff: {
      result: 'pass',
      inspector: { ...INSPECTORS.inspector },
      at: '2026-09-26T02:05:00.000Z',
      signatureDataUrl: '',
      revision: 'AFC Rev.C · CL-DH-GD01 v1.2',
      note: 'Ván khuôn đạt yêu cầu, cho phép lắp dựng cốt thép.',
      sessionId: 'INS-S002-G01-0001',
    },
    seeded: true,
  },
]

export const SEED_AUDIT: AuditEvent[] = [
  { id: 'seed-a1', at: GD01_START, by: INSPECTORS.inspector.name, assetId: S002.id, sessionId: 'INS-S002-G01-0001', action: 'session.start', detail: 'Bắt đầu GĐ01 Ván khuôn · QR SH-S002' },
  { id: 'seed-a2', at: GD01_END, by: INSPECTORS.inspector.name, assetId: S002.id, sessionId: 'INS-S002-G01-0001', action: 'session.finish', detail: '9/9 tiêu chí hoàn thành' },
  { id: 'seed-a3', at: '2026-09-26T02:05:00.000Z', by: INSPECTORS.inspector.name, assetId: S002.id, sessionId: 'INS-S002-G01-0001', action: 'signoff', detail: 'PASS · AFC Rev.C' },
]
