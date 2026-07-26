import type { SafetyGroupId, SafetyViolationRecord } from '../types/safety.types'
import { getEventSubjectType } from '../utils/eventSubject'

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/')

/** Snapshot AI tại thời điểm phát hiện — theo nhóm / kịch bản */
const SCENARIO_SNAPSHOTS: Record<string, string> = {
  'PPE-001': `${BASE}avatars/clip-w-att01.jpg`,
  'PPE-002': `${BASE}avatars/clip-w-att02.jpg`,
  'PPE-003': `${BASE}avatars/clip-w-att03.jpg`,
  'WAH-001': `${BASE}avatars/clip-w-010.jpg`,
  'WAH-002': `${BASE}avatars/clip-w-011.jpg`,
  'WAH-003': `${BASE}avatars/clip-w-012.jpg`,
  'DZ-001': `${BASE}housekeeping/clutter-violation.jpg`,
  'DZ-002': `${BASE}housekeeping/materials-violation.jpg`,
  'ATGT-001': `${BASE}avatars/clip-e-vhmn-2.jpg`,
  'ATGT-002': `${BASE}avatars/clip-e-vhmn-3.jpg`,
  'ATGT-003': `${BASE}housekeeping/thumb-san-tap-a.jpg`,
  'ATGT-004': `${BASE}housekeeping/thumb-san-thuc-hanh-b1.jpg`,
  'BPTC-001': `${BASE}avatars/clip-w-c01.jpg`,
  'BPTC-002': `${BASE}avatars/clip-w-c02.jpg`,
  'BPTC-003': `${BASE}avatars/clip-w-c03.jpg`,
  'BPTC-004': `${BASE}avatars/clip-w-c04.jpg`,
  'BPTC-005': `${BASE}avatars/clip-w-c05.jpg`,
  'BPTC-006': `${BASE}avatars/clip-w-c06.jpg`,
  'PCCC-001': `${BASE}avatars/clip-w-015.jpg`,
}

const GROUP_FALLBACK: Record<SafetyGroupId, string> = {
  PPE: `${BASE}avatars/clip-w-att01.jpg`,
  WAH: `${BASE}avatars/clip-w-010.jpg`,
  DZ: `${BASE}housekeeping/clutter-violation.jpg`,
  ATGT: `${BASE}avatars/clip-e-vhmn-1.jpg`,
  BPTC: `${BASE}avatars/clip-w-c01.jpg`,
  PCCC: `${BASE}avatars/clip-w-015.jpg`,
}

const SUBJECT_FALLBACK: Record<string, string> = {
  PERSON: `${BASE}avatars/clip-w-001.jpg`,
  VEHICLE: `${BASE}avatars/clip-e-vhmn-1.jpg`,
  SITE_CONDITION: `${BASE}housekeeping/materials-violation.jpg`,
  CONSTRUCTION_ACTIVITY: `${BASE}avatars/clip-w-c01.jpg`,
  MANAGEMENT: `${BASE}housekeeping/thumb-kho-vat-tu.jpg`,
}

const WORKER_CLIPS = [
  'clip-w-001', 'clip-w-002', 'clip-w-003', 'clip-w-004', 'clip-w-005',
  'clip-w-006', 'clip-w-007', 'clip-w-008', 'clip-w-016', 'clip-w-018',
]

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % 9973
  return h
}

export function resolveViolationSnapshotUrl(record: SafetyViolationRecord): string {
  if (record.snapshotUrl) return record.snapshotUrl

  const byScenario = SCENARIO_SNAPSHOTS[record.scenarioId]
  if (byScenario) return byScenario

  const subject = getEventSubjectType(record)
  if (subject === 'PERSON' && record.subject?.workerId) {
    const clip = WORKER_CLIPS[hashId(record.subject.workerId) % WORKER_CLIPS.length]
    return `${BASE}avatars/${clip}.jpg`
  }

  return SUBJECT_FALLBACK[subject] ?? GROUP_FALLBACK[record.groupId] ?? `${BASE}avatars/clip-w-001.jpg`
}

export function assignSnapshotUrl(record: SafetyViolationRecord): SafetyViolationRecord {
  return { ...record, snapshotUrl: resolveViolationSnapshotUrl(record) }
}
