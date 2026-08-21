import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import type { EventType, PatrolEvent } from '../data/patrolMockData'
import { PATROL_HELMET_ZONE_ASSIGNMENTS } from '../data/patrolSiteMap'

const ZONE_LABELS: Record<string, string> = {
  ZONE_A: 'Khu thi công móng',
  ZONE_B: 'Khu lắp dựng tầng',
  ZONE_C: 'Khu hoàn thiện',
  ZONE_D: 'Khu kho vật tư',
  ZONE_E: 'Khu văn phòng công trường',
}

interface BackendViolationEvent {
  id: string
  camera_id?: string
  scenario_id?: string
  scenario_name?: string
  behavior?: string
  confidence?: number
  created_at?: number
  confirmed_at?: number
  snapshot_file?: string | null
  worker_id?: string | null
  worker_name?: string | null
  dedup_key?: string | null
}

function todayIsoDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function unixToIso(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return new Date().toISOString()
  return new Date(ts * 1000).toISOString()
}

function buildSnapshotUrl(backendUrl: string, eventId: string, versionTs?: number): string {
  const base = `${backendUrl.replace(/\/$/, '')}/events/${eventId}/snapshot`
  if (!versionTs) return base
  return `${base}?v=${Math.floor(versionTs)}`
}

function eventTypeFromScenario(scenarioId: string | undefined): EventType {
  if (scenarioId?.startsWith('PPE')) return 'PPE_VIOLATION'
  return 'MACHINE_STOPPED'
}

function zoneMetaForCamera(cameraId: string): { zoneId: string; zoneName: string } {
  const row = PATROL_HELMET_ZONE_ASSIGNMENTS.find(z => z.helmetId === cameraId)
  const zoneId = row?.zoneId ?? 'ZONE_A'
  return { zoneId, zoneName: ZONE_LABELS[zoneId] ?? zoneId }
}

export function mapBackendEventToPatrolEvent(
  event: BackendViolationEvent,
  backendUrl: string,
): PatrolEvent {
  const cameraId = event.camera_id ?? 'HC-01'
  const { zoneId, zoneName } = zoneMetaForCamera(cameraId)
  const helmetNum = cameraId.replace('HC-', '')
  const ts = event.confirmed_at ?? event.created_at
  const workerLabel = event.worker_name?.trim() || event.worker_id?.trim() || 'Người chưa xác định'

  return {
    id: event.id,
    type: eventTypeFromScenario(event.scenario_id),
    cameraId,
    cameraName: `Helmet ${helmetNum}`,
    zoneId,
    zoneName,
    objectId: event.dedup_key?.split('|').pop() ?? event.id.slice(0, 8),
    objectLabel: workerLabel,
    violationLabel: event.scenario_name ?? event.scenario_id ?? 'Vi phạm PPE',
    startedAt: unixToIso(event.created_at),
    lockedAt: unixToIso(ts),
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: Number(event.confidence ?? 0),
    gps: { lat: 0, lng: 0 },
    snapshotUrl: buildSnapshotUrl(backendUrl, event.id, ts),
  }
}

export async function fetchPatrolHelmetLiveEvents(
  cameraId = 'HC-01',
  backendUrl = getVmsBackendUrl(),
): Promise<PatrolEvent[]> {
  if (!backendUrl) return []
  const date = todayIsoDate()
  const res = await fetch(`${backendUrl.replace(/\/$/, '')}/events?limit=200&date=${date}`, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
    mode: 'cors',
  })
  if (!res.ok) return []
  const rows = await res.json() as BackendViolationEvent[]
  return rows
    .filter(row => row.camera_id === cameraId && row.scenario_id?.startsWith('PPE'))
    .map(row => mapBackendEventToPatrolEvent(row, backendUrl))
}
