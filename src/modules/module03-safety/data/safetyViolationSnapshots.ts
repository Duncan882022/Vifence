import type { SafetyGroupId, SafetyViolationRecord } from '../types/safety.types'
import { getEventSubjectType } from '../utils/eventSubject'

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/')

/** Snapshot demo — chỉ kịch bản đã triển khai AI */
const SCENARIO_SNAPSHOTS: Record<string, string> = {
  'PPE-001': `${BASE}avatars/clip-w-att01.jpg`,
  'PPE-002': `${BASE}avatars/clip-w-att02.jpg`,
  'PPE-003': `${BASE}avatars/clip-w-att03.jpg`,
  'WAH-001': `${BASE}avatars/clip-w-010.jpg`,
  'DZ-003': `${BASE}housekeeping/clutter-violation.jpg`,
  'ATGT-002': `${BASE}camera-feeds/cam03-atgt-scene.jpg`,
  'ATGT-004': `${BASE}camera-feeds/cam03-atgt-scene.jpg`,
  'BPTC-007': `${BASE}housekeeping/clutter-violation.jpg`,
  'BPTC-008': `${BASE}housekeeping/materials-violation.jpg`,
  'BPTC-009': `${BASE}housekeeping/thumb-kho-vat-tu.jpg`,
  'PCCC-001': `${BASE}camera-feeds/cam04-pccc-scene.jpg`,
  'PCCC-002': `${BASE}camera-feeds/cam04-pccc-scene.jpg`,
}

const GROUP_FALLBACK: Record<SafetyGroupId, string> = {
  PPE: `${BASE}avatars/clip-w-att01.jpg`,
  WAH: `${BASE}avatars/clip-w-010.jpg`,
  DZ: `${BASE}housekeeping/clutter-violation.jpg`,
  ATGT: `${BASE}avatars/clip-e-vhmn-1.jpg`,
  BPTC: `${BASE}housekeeping/clutter-violation.jpg`,
  PCCC: `${BASE}camera-feeds/cam04-pccc-scene.jpg`,
}

const SUBJECT_FALLBACK: Record<string, string> = {
  PERSON: `${BASE}avatars/clip-w-001.jpg`,
  VEHICLE: `${BASE}avatars/clip-e-vhmn-1.jpg`,
  SITE_CONDITION: `${BASE}housekeeping/materials-violation.jpg`,
  CONSTRUCTION_ACTIVITY: `${BASE}housekeeping/thumb-kho-vat-tu.jpg`,
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

export function resolveStaticViolationSnapshotUrl(record: SafetyViolationRecord): string {
  const byScenario = SCENARIO_SNAPSHOTS[record.scenarioId]
  if (byScenario) return byScenario

  const subject = getEventSubjectType(record)
  if (subject === 'PERSON' && record.subject?.workerId) {
    const clip = WORKER_CLIPS[hashId(record.subject.workerId) % WORKER_CLIPS.length]
    return `${BASE}avatars/${clip}.jpg`
  }

  return SUBJECT_FALLBACK[subject] ?? GROUP_FALLBACK[record.groupId] ?? `${BASE}avatars/clip-w-001.jpg`
}

export function resolveViolationSnapshotUrl(record: SafetyViolationRecord): string {
  if (record.snapshotUrl) return record.snapshotUrl

  return resolveStaticViolationSnapshotUrl(record)
}

export function assignSnapshotUrl(record: SafetyViolationRecord): SafetyViolationRecord {
  return { ...record, snapshotUrl: resolveViolationSnapshotUrl(record) }
}
