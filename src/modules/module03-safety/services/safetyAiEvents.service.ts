import {
  getMobileAiBackendUrl,
  type MobileAiViolationEvent,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import type {
  AlertSeverity,
  SafetyViolationRecord,
} from '../types/safety.types'
import { getScenarioName } from '../data/safetyScenarios'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

const BEHAVIOR_TO_SCENARIO: Record<string, string> = {
  smoking: 'PCCC-001',
  fire: 'PCCC-002',
}

const BEHAVIOR_TO_SEVERITY: Record<string, AlertSeverity> = {
  smoking: 'VIOLATION',
  fire: 'CRITICAL',
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

export interface BackendViolationEvent extends MobileAiViolationEvent {
  camera_id?: string
  event_date?: string
}

export function mapBackendEventToSafetyRecord(
  event: BackendViolationEvent,
  backendUrl: string,
): SafetyViolationRecord {
  const cameraId = event.camera_id ?? 'MOB-01'
  const scenarioId = BEHAVIOR_TO_SCENARIO[event.behavior] ?? event.scenario_id ?? 'PCCC-001'

  return {
    id: `ai-${event.id}`,
    scenarioId,
    groupId: 'PCCC',
    zoneId: 'ZONE-A01',
    sourceDeviceId: cameraId,
    sourceType: 'MOBILE',
    detectedAt: toIsoLocalTimestamp(event.created_at),
    severity: BEHAVIOR_TO_SEVERITY[event.behavior] ?? 'VIOLATION',
    status: 'DETECTED',
    confidence: event.confidence,
    eventSubjectType: 'PERSON',
    subject: {
      type: 'PERSON',
      workerName: 'Unknown',
    },
    verificationRequired: true,
    description: getScenarioName(scenarioId),
    snapshotUrl: buildSnapshotUrl(backendUrl, event.id),
  }
}

export async function fetchSafetyAiEvents(
  backendUrl?: string,
  date?: string,
): Promise<SafetyViolationRecord[]> {
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
    const rows = await res.json() as BackendViolationEvent[]
    return rows.map(row => mapBackendEventToSafetyRecord(row, base))
  } catch {
    return []
  }
}

export function mergeSafetyRecordsWithAi(
  mockRecords: SafetyViolationRecord[],
  aiRecords: SafetyViolationRecord[],
): SafetyViolationRecord[] {
  const aiIds = new Set(aiRecords.map(r => r.id))
  const filteredMock = mockRecords.filter(r => !aiIds.has(r.id))
  return [...aiRecords, ...filteredMock].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  )
}
