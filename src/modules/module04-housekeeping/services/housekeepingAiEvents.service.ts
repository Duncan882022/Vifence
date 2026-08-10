import {
  getMobileAiBackendUrl,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import type {
  HousekeepingAlertSeverity,
  HousekeepingEventRecord,
  HousekeepingEventSubjectType,
} from '../types/housekeepingAi.types'
import { getHousekeepingScenarioName } from '../data/housekeepingScenarios'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

/** Backend BPTC road scenarios → Module 04 HK catalog */
const BACKEND_TO_HK_SCENARIO: Record<string, string> = {
  'BPTC-007': 'HK-01',
  'BPTC-008': 'HK-02',
  'BPTC-009': 'HK-03',
}

const BEHAVIOR_TO_HK: Record<string, string> = {
  mud: 'HK-01',
  water: 'HK-02',
  object: 'HK-03',
  mesh_missing: 'BPTC-001',
  mesh_torn: 'BPTC-001',
  mesh_dirty: 'BPTC-001',
}

const MESH_BEHAVIORS = new Set(['mesh_missing', 'mesh_torn', 'mesh_dirty'])

const BEHAVIOR_TO_SEVERITY: Record<string, HousekeepingAlertSeverity> = {
  mud: 'WARNING',
  water: 'WARNING',
  object: 'VIOLATION',
  mesh_missing: 'VIOLATION',
  mesh_torn: 'WARNING',
  mesh_dirty: 'WARNING',
}

const BEHAVIOR_TO_SUBJECT: Record<string, HousekeepingEventSubjectType> = {
  mud: 'SITE_CONDITION',
  water: 'SITE_CONDITION',
  object: 'CONSTRUCTION_ACTIVITY',
}

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

export interface BackendRoadEvent {
  id: string
  behavior: string
  confidence: number
  bbox: number[]
  created_at: number
  camera_id?: string
  scenario_id?: string
  scenario_name?: string
}

export function mapBackendEventToHousekeepingRecord(
  event: BackendRoadEvent,
  backendUrl: string,
): HousekeepingEventRecord | null {
  const scenarioId = BEHAVIOR_TO_HK[event.behavior]
    ?? BACKEND_TO_HK_SCENARIO[event.scenario_id ?? '']
    ?? (MESH_BEHAVIORS.has(event.behavior) ? 'BPTC-001' : undefined)
  if (!scenarioId) return null

  const cameraId = event.camera_id ?? 'A-03'
  const roiType = MESH_BEHAVIORS.has(event.behavior) ? 'MESH' : 'ROAD'

  return {
    id: `ai-hk-${event.id}`,
    scenarioId,
    groupId: 'HK',
    zoneId: 'khu-a',
    roiType,
    sourceDeviceId: cameraId,
    detectedAt: toIsoLocalTimestamp(event.created_at),
    severity: BEHAVIOR_TO_SEVERITY[event.behavior] ?? 'WARNING',
    status: 'DETECTED',
    confidence: event.confidence,
    eventSubjectType: BEHAVIOR_TO_SUBJECT[event.behavior] ?? 'SITE_CONDITION',
    description: event.scenario_name ?? getHousekeepingScenarioName(scenarioId),
    snapshotUrl: buildSnapshotUrl(backendUrl, event.id),
    evidence: {
      annotatedUrl: buildSnapshotUrl(backendUrl, event.id),
    },
  }
}

export async function fetchHousekeepingAiEvents(
  backendUrl?: string,
  date?: string,
): Promise<HousekeepingEventRecord[]> {
  const base = normalizeBaseUrl(backendUrl ?? getMobileAiBackendUrl())
  if (!base) return []

  const params = new URLSearchParams({ limit: '50' })
  if (date) params.set('date', date)

  try {
    const res = await fetch(`${base}/events?${params.toString()}`, {
      headers: TUNNEL_HEADERS,
      mode: 'cors',
    })
    if (!res.ok) return []
    const rows = await res.json() as BackendRoadEvent[]
    return rows
      .map(row => mapBackendEventToHousekeepingRecord(row, base))
      .filter((row): row is HousekeepingEventRecord => row != null)
  } catch {
    return []
  }
}

export function mergeHousekeepingRecordsWithAi(
  mockRecords: HousekeepingEventRecord[],
  aiRecords: HousekeepingEventRecord[],
): HousekeepingEventRecord[] {
  const aiIds = new Set(aiRecords.map(r => r.id))
  const filteredMock = mockRecords.filter(r => !aiIds.has(r.id))
  return [...aiRecords, ...filteredMock].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  )
}
