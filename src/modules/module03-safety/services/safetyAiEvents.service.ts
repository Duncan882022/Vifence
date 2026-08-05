import {
  getMobileAiBackendUrl,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { getAtgtDemoSafetyEvents } from './atgtDemoEvents.service'
import { getPcccDemoSafetyEvents } from './pcccDemoEvents.service'
import type {
  AlertSeverity,
  SafetyGroupId,
  SafetyViolationRecord,
} from '../types/safety.types'
import { getScenarioName } from '../data/safetyScenarios'
import { isImplementedSafetyScenario } from '../data/implementedSafetyCatalog'
import { inferEventSourceMeta } from '../utils/safetyCameraBridge'
import { resolveVehiclePlate } from '../utils/vehiclePlate'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

export const SAFETY_AI_EVENTS_CHANGED = 'vifence-safety-ai-events-changed'

export function notifySafetyAiEventsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SAFETY_AI_EVENTS_CHANGED))
}

const BEHAVIOR_TO_SCENARIO: Record<string, string> = {
  smoking: 'PCCC-001',
  fire: 'PCCC-002',
  no_harness: 'WAH-001',
  speeding: 'ATGT-002',
  hard_median: 'ATGT-004',
  no_soft_median: 'ATGT-004',
  soft_median: 'ATGT-004',
  mud: 'BPTC-007',
  water: 'BPTC-008',
  object: 'BPTC-009',
  crane_proximity: 'DZ-003',
  person: 'DZ-003',
  crane: 'DZ-003',
  no_helmet: 'PPE-001',
  no_vest: 'PPE-002',
  no_shoes: 'PPE-003',
  hard_hat: 'PPE-001',
  safety_vest: 'PPE-002',
  safety_shoes: 'PPE-003',
}

const BEHAVIOR_TO_GROUP: Record<string, SafetyGroupId> = {
  smoking: 'PCCC',
  fire: 'PCCC',
  no_harness: 'WAH',
  speeding: 'ATGT',
  hard_median: 'ATGT',
  no_soft_median: 'ATGT',
  soft_median: 'ATGT',
  mud: 'BPTC',
  water: 'BPTC',
  object: 'BPTC',
  crane_proximity: 'DZ',
  person: 'DZ',
  crane: 'DZ',
  no_helmet: 'PPE',
  no_vest: 'PPE',
  no_shoes: 'PPE',
  hard_hat: 'PPE',
  safety_vest: 'PPE',
  safety_shoes: 'PPE',
}

const BEHAVIOR_TO_SEVERITY: Record<string, AlertSeverity> = {
  smoking: 'VIOLATION',
  fire: 'CRITICAL',
  no_harness: 'CRITICAL',
  speeding: 'VIOLATION',
  hard_median: 'WARNING',
  no_soft_median: 'VIOLATION',
  soft_median: 'WARNING',
  mud: 'WARNING',
  water: 'WARNING',
  object: 'VIOLATION',
  crane_proximity: 'CRITICAL',
  person: 'WARNING',
  crane: 'WARNING',
  no_helmet: 'VIOLATION',
  no_vest: 'WARNING',
  no_shoes: 'WARNING',
  hard_hat: 'WARNING',
  safety_vest: 'WARNING',
  safety_shoes: 'WARNING',
}

const CAM03_BEHAVIORS = new Set([
  'mud', 'water', 'object',
  'vehicle', 'speeding', 'hard_median', 'no_soft_median', 'soft_median',
])

const CAM04_BEHAVIORS = new Set([
  'crane_proximity', 'person', 'crane',
  'no_helmet', 'no_vest', 'no_shoes', 'hard_hat', 'safety_vest', 'safety_shoes',
  'smoking', 'fire',
  'no_harness',
])

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

function toIsoLocalTimestamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function buildSnapshotUrl(backendUrl: string, eventId: string): string {
  return `${normalizeBaseUrl(backendUrl)}/events/${eventId}/snapshot`
}

export interface BackendViolationEvent {
  id: string
  behavior: string
  confidence: number
  bbox: number[]
  created_at: number
  camera_id?: string
  event_date?: string
  scenario_id?: string
  scenario_name?: string
  group?: string
  violation_type?: string
  vehicle_plate?: string | null
  vehicle_type?: string | null
  driver_name?: string | null
}

function buildVehicleSubject(event: BackendViolationEvent): SafetyViolationRecord['subject'] {
  return {
    type: 'VEHICLE',
    vehiclePlate: resolveVehiclePlate(event.vehicle_plate),
    vehicleType: event.vehicle_type ?? undefined,
  }
}

function buildSiteConditionSubject(scenarioId: string, scenarioName?: string): SafetyViolationRecord['subject'] {
  return {
    type: 'SITE_CONDITION',
    workItem: scenarioName ?? getScenarioName(scenarioId),
  }
}

export function mapBackendEventToSafetyRecord(
  event: BackendViolationEvent,
  backendUrl: string,
): SafetyViolationRecord {
  const scenarioId = BEHAVIOR_TO_SCENARIO[event.behavior] ?? event.scenario_id ?? 'PCCC-001'
  const groupId = BEHAVIOR_TO_GROUP[event.behavior] ?? (event.group as SafetyGroupId | undefined) ?? 'PCCC'
  const isCam03Ai = CAM03_BEHAVIORS.has(event.behavior)
  const isCam04Ai = CAM04_BEHAVIORS.has(event.behavior)
  const isFixedCamAi = isCam03Ai || isCam04Ai
  const { sourceDeviceId, sourceType } = inferEventSourceMeta(
    event.camera_id,
    isFixedCamAi ? 'FIXED_CAMERA' : 'MOBILE',
  )

  return {
    id: `ai-${event.id}`,
    scenarioId,
    groupId,
    zoneId: event.behavior === 'speeding'
      ? 'ZONE-B01'
      : event.behavior === 'no_soft_median'
        ? 'ZONE-B02'
        : event.behavior === 'hard_median'
          ? 'ZONE-B02'
          : isCam04Ai || sourceDeviceId === 'A-04'
            ? 'ZONE-A02'
            : sourceDeviceId === 'A-03'
              ? 'ZONE-A02'
              : 'ZONE-A01',
    sourceDeviceId,
    sourceType,
    detectedAt: toIsoLocalTimestamp(event.created_at),
    severity: BEHAVIOR_TO_SEVERITY[event.behavior] ?? 'VIOLATION',
    status: 'DETECTED',
    confidence: event.confidence,
    eventSubjectType: isCam03Ai
      ? (event.behavior === 'object'
        ? 'CONSTRUCTION_ACTIVITY'
        : event.behavior === 'speeding'
          ? 'VEHICLE'
          : 'SITE_CONDITION')
      : event.behavior === 'fire'
        ? 'SITE_CONDITION'
        : isCam04Ai
          ? 'PERSON'
          : 'PERSON',
    subject: isCam03Ai
      ? (event.behavior === 'speeding'
        ? buildVehicleSubject(event)
        : event.behavior === 'no_soft_median'
          ? buildSiteConditionSubject(scenarioId, event.scenario_name)
          : { type: 'SITE_CONDITION' })
      : event.behavior === 'fire'
        ? buildSiteConditionSubject(scenarioId, event.scenario_name)
        : { type: 'PERSON' },
    verificationRequired: !isCam04Ai || event.behavior === 'crane_proximity',
    description: event.scenario_name ?? getScenarioName(scenarioId),
    snapshotUrl: buildSnapshotUrl(backendUrl, event.id),
  }
}

export function isLiveSafetyRecord(record: SafetyViolationRecord): boolean {
  return record.id.startsWith('ai-')
    || record.id.startsWith('atgt-demo-')
    || record.id.startsWith('pccc-demo-')
}

export function filterLiveSafetyRecords(records: SafetyViolationRecord[]): SafetyViolationRecord[] {
  return records.filter(r => isImplementedSafetyScenario(r.scenarioId))
}

export async function fetchSafetyAiEvents(
  backendUrl?: string,
  date?: string,
): Promise<SafetyViolationRecord[]> {
  const overlayEvents = filterLiveSafetyRecords([
    ...getAtgtDemoSafetyEvents(),
    ...getPcccDemoSafetyEvents(),
  ])
  const base = normalizeBaseUrl(backendUrl ?? getMobileAiBackendUrl())
  if (!base) return overlayEvents

  const params = new URLSearchParams({ limit: '50' })
  if (date) params.set('date', date)

  try {
    const res = await fetch(`${base}/events?${params.toString()}`, {
      headers: TUNNEL_HEADERS,
      mode: 'cors',
    })
    if (!res.ok) return overlayEvents
    const rows = await res.json() as BackendViolationEvent[]
    const backendRecords = filterLiveSafetyRecords(
      rows.map(row => mapBackendEventToSafetyRecord(row, base)),
    )
    const merged = mergeSafetyRecordsWithAi(overlayEvents, backendRecords)
    return attachDemoSnapshotsToBackend(merged, overlayEvents)
  } catch {
    return overlayEvents
  }
}

export function mergeSafetyRecordsWithAi(
  baseRecords: SafetyViolationRecord[],
  aiRecords: SafetyViolationRecord[],
): SafetyViolationRecord[] {
  const aiIds = new Set(aiRecords.map(r => r.id))
  const merged = [...aiRecords, ...baseRecords.filter(r => !aiIds.has(r.id))]
  return merged.sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  )
}

/** Ưu tiên snapshot chụp từ video (data URL) cho sự kiện backend ATGT cùng kịch bản. */
function attachDemoSnapshotsToBackend(
  records: SafetyViolationRecord[],
  demoRecords: SafetyViolationRecord[],
): SafetyViolationRecord[] {
  const demoSnapByScenario = new Map<string, string>()
  for (const demo of demoRecords) {
    if (demo.snapshotUrl?.startsWith('data:')) {
      demoSnapByScenario.set(demo.scenarioId, demo.snapshotUrl)
    }
  }
  if (demoSnapByScenario.size === 0) return records

  return records.map(record => {
    if (!record.id.startsWith('ai-') || record.groupId !== 'ATGT') return record
    const localSnap = demoSnapByScenario.get(record.scenarioId)
    return localSnap ? { ...record, snapshotUrl: localSnap } : record
  })
}

export async function fetchOverlaySafetyEvents(): Promise<SafetyViolationRecord[]> {
  return filterLiveSafetyRecords([
    ...getAtgtDemoSafetyEvents(),
    ...getPcccDemoSafetyEvents(),
  ])
}
