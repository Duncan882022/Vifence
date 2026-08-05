import type { SafetyViolationRecord } from '../types/safety.types'
import {
  ATGT_LANE_VIOLATION_TEXT,
  ATGT_SPEEDING_VIOLATION_TEXT,
} from '../utils/captureAtgtSnapshot'
import { getScenarioName } from '../data/safetyScenarios'
import { resolveVehiclePlate } from '../utils/vehiclePlate'

const SAFETY_AI_EVENTS_CHANGED = 'vifence-safety-ai-events-changed'
const DEMO_COOLDOWN_MS = 18_000
const MAX_DEMO_EVENTS = 12

let demoEvents: SafetyViolationRecord[] = []
const lastLoggedAt: Record<string, number> = {}
const lastSegmentKeys: Record<string, string | null> = {}

function toIsoLocalTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function pushDemoEvent(record: SafetyViolationRecord): SafetyViolationRecord {
  demoEvents = [record, ...demoEvents.filter(r => r.id !== record.id)].slice(0, MAX_DEMO_EVENTS)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SAFETY_AI_EVENTS_CHANGED))
  }
  return record
}

function registerDemoEvent(params: {
  kind: 'speeding' | 'lane'
  cameraId: string
  confidence: number
  segmentKey?: string
  scenarioId: 'ATGT-002' | 'ATGT-004'
  zoneId: string
  eventSubjectType: SafetyViolationRecord['eventSubjectType']
  subject: SafetyViolationRecord['subject']
  description: string
  snapshotUrl?: string
}): SafetyViolationRecord | null {
  const now = Date.now()
  const segmentKey = params.segmentKey ?? 'default'
  const kind = params.kind

  if (lastSegmentKeys[kind] === segmentKey) return null
  if (now - (lastLoggedAt[kind] ?? 0) < DEMO_COOLDOWN_MS && lastSegmentKeys[kind] != null) return null

  lastLoggedAt[kind] = now
  lastSegmentKeys[kind] = segmentKey

  const detectedAt = toIsoLocalTimestamp(new Date(now))
  return pushDemoEvent({
    id: `atgt-demo-${kind}-${now}`,
    scenarioId: params.scenarioId,
    groupId: 'ATGT',
    zoneId: params.zoneId,
    sourceDeviceId: params.cameraId,
    sourceType: 'FIXED_CAMERA',
    detectedAt,
    severity: 'VIOLATION',
    status: 'DETECTED',
    confidence: params.confidence,
    eventSubjectType: params.eventSubjectType,
    subject: params.subject,
    verificationRequired: true,
    description: params.description,
    snapshotUrl: params.snapshotUrl,
  })
}

/** Log sự kiện ATGT-002 khi Cam A-03 thấy xe vượt tốc độ. */
export function registerAtgtSpeedingDemoEvent(params: {
  cameraId: string
  confidence: number
  segmentKey?: string
  snapshotUrl?: string
  vehiclePlate?: string
  vehicleType?: string
}): SafetyViolationRecord | null {
  return registerDemoEvent({
    kind: 'speeding',
    cameraId: params.cameraId,
    confidence: params.confidence,
    segmentKey: params.segmentKey,
    scenarioId: 'ATGT-002',
    zoneId: 'ZONE-B01',
    eventSubjectType: 'VEHICLE',
    subject: {
      type: 'VEHICLE',
      vehiclePlate: resolveVehiclePlate(params.vehiclePlate),
      vehicleType: params.vehicleType,
    },
    description: ATGT_SPEEDING_VIOLATION_TEXT,
    snapshotUrl: params.snapshotUrl,
  })
}

/** Log sự kiện ATGT-004 khi không thấy phân cách mềm / phân làn luồng. */
export function registerAtgtLaneDemoEvent(params: {
  cameraId: string
  confidence: number
  segmentKey?: string
  snapshotUrl?: string
}): SafetyViolationRecord | null {
  return registerDemoEvent({
    kind: 'lane',
    cameraId: params.cameraId,
    confidence: params.confidence,
    segmentKey: params.segmentKey,
    scenarioId: 'ATGT-004',
    zoneId: 'ZONE-B02',
    eventSubjectType: 'SITE_CONDITION',
    subject: {
      type: 'SITE_CONDITION',
      workItem: getScenarioName('ATGT-004'),
    },
    description: ATGT_LANE_VIOLATION_TEXT,
    snapshotUrl: params.snapshotUrl,
  })
}

export function resetAtgtDemoEventSegment(): void {
  lastSegmentKeys.speeding = null
  lastSegmentKeys.lane = null
}

export function getAtgtDemoSafetyEvents(): SafetyViolationRecord[] {
  return [...demoEvents]
}

export function clearAtgtDemoSafetyEvents(): void {
  demoEvents = []
  lastSegmentKeys.speeding = null
  lastSegmentKeys.lane = null
  lastLoggedAt.speeding = 0
  lastLoggedAt.lane = 0
}
