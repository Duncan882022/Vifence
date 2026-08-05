import type { SafetyViolationRecord } from '../types/safety.types'
import { getScenarioName } from '../data/safetyScenarios'

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
  kind: 'smoking' | 'fire'
  cameraId: string
  confidence: number
  segmentKey?: string
  scenarioId: 'PCCC-001' | 'PCCC-002'
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
  const isFire = params.kind === 'fire'
  return pushDemoEvent({
    id: `pccc-demo-${kind}-${now}`,
    scenarioId: params.scenarioId,
    groupId: 'PCCC',
    zoneId: 'ZONE-A02',
    sourceDeviceId: params.cameraId,
    sourceType: 'FIXED_CAMERA',
    detectedAt,
    severity: isFire ? 'CRITICAL' : 'VIOLATION',
    status: 'DETECTED',
    confidence: params.confidence,
    eventSubjectType: isFire ? 'SITE_CONDITION' : 'PERSON',
    subject: isFire
      ? { type: 'SITE_CONDITION', workItem: getScenarioName(params.scenarioId) }
      : { type: 'PERSON' },
    verificationRequired: true,
    description: getScenarioName(params.scenarioId),
    snapshotUrl: params.snapshotUrl,
  })
}

export function registerPcccSmokingDemoEvent(params: {
  cameraId: string
  confidence: number
  segmentKey?: string
  snapshotUrl?: string
}): SafetyViolationRecord | null {
  return registerDemoEvent({
    kind: 'smoking',
    cameraId: params.cameraId,
    confidence: params.confidence,
    segmentKey: params.segmentKey,
    scenarioId: 'PCCC-001',
    snapshotUrl: params.snapshotUrl,
  })
}

export function registerPcccFireDemoEvent(params: {
  cameraId: string
  confidence: number
  segmentKey?: string
  snapshotUrl?: string
}): SafetyViolationRecord | null {
  return registerDemoEvent({
    kind: 'fire',
    cameraId: params.cameraId,
    confidence: params.confidence,
    segmentKey: params.segmentKey,
    scenarioId: 'PCCC-002',
    snapshotUrl: params.snapshotUrl,
  })
}

export function resetPcccDemoEventSegment(): void {
  lastSegmentKeys.smoking = null
  lastSegmentKeys.fire = null
}

export function getPcccDemoSafetyEvents(): SafetyViolationRecord[] {
  return [...demoEvents]
}

export function clearPcccDemoSafetyEvents(): void {
  demoEvents = []
  lastSegmentKeys.smoking = null
  lastSegmentKeys.fire = null
  lastLoggedAt.smoking = 0
  lastLoggedAt.fire = 0
}
