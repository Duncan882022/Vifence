import { formatVnIsoFromUnix } from '@/utils/vnDateTime'
import {
  getMobileAiBackendUrl,
} from '@/modules/module02-training/services/mobileAiBackend.service'
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
  // BPTC-001 — Lưới bao che giàn giáo
  mesh_missing: 'BPTC-001',
  mesh_torn: 'BPTC-001',
  mesh_dirty: 'BPTC-001',
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
  mesh_missing: 'BPTC',
  mesh_torn: 'BPTC',
  mesh_dirty: 'BPTC',
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
  mesh_missing: 'VIOLATION',
  mesh_torn: 'WARNING',
  mesh_dirty: 'WARNING',
}

const CAM03_BEHAVIORS = new Set([
  'mud', 'water', 'object',
  'vehicle', 'speeding', 'hard_median', 'no_soft_median', 'soft_median',
  // BPTC-001 lưới bao che — cam mặt tiền (A-05 khi deploy, A-03 fallback)
  'mesh_missing', 'mesh_torn', 'mesh_dirty',
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

function buildSnapshotUrl(backendUrl: string, eventId: string): string {
  return `${normalizeBaseUrl(backendUrl)}/events/${eventId}/snapshot`
}

export interface BackendViolationEvent {
  id: string
  behavior: string
  confidence: number
  bbox: number[]
  subject_bbox?: number[]
  related_bbox?: number[]
  frame_width?: number
  frame_height?: number
  created_at: number
  confirmed_at?: number
  camera_id?: string
  event_date?: string
  scenario_id?: string
  scenario_name?: string
  group?: string
  violation_type?: string
  dedup_key?: string
  vehicle_plate?: string | null
  vehicle_type?: string | null
  driver_name?: string | null
  /** Đường dẫn clip MP4 tương đối (VMS mode) — dùng với /events/{id}/clip */
  clip_file?: string | null
  clip_duration_sec?: number | null
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
  const scenarioId = event.scenario_id ?? BEHAVIOR_TO_SCENARIO[event.behavior] ?? 'PCCC-001'
  const groupId = (event.group as SafetyGroupId | undefined) ?? BEHAVIOR_TO_GROUP[event.behavior] ?? 'PCCC'
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
    detectedAt: formatVnIsoFromUnix(event.created_at),
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
    description: event.scenario_name ?? event.violation_type ?? getScenarioName(scenarioId),
    snapshotUrl: buildSnapshotUrl(backendUrl, event.id),
    bbox: event.bbox.length >= 4
      ? [event.bbox[0], event.bbox[1], event.bbox[2], event.bbox[3]]
      : undefined,
    subjectBbox: event.subject_bbox && event.subject_bbox.length >= 4
      ? [event.subject_bbox[0], event.subject_bbox[1], event.subject_bbox[2], event.subject_bbox[3]]
      : undefined,
    relatedBbox: event.related_bbox && event.related_bbox.length >= 4
      ? [event.related_bbox[0], event.related_bbox[1], event.related_bbox[2], event.related_bbox[3]]
      : undefined,
    frameWidth: event.frame_width,
    frameHeight: event.frame_height,
    dedupKey: event.dedup_key ?? buildSafetyDedupKey(sourceDeviceId, scenarioId, event.behavior),
    clipUrl: event.clip_file
      ? `${normalizeBaseUrl(backendUrl)}/events/${event.id}/clip`
      : undefined,
    clipDurationSec: event.clip_duration_sec ?? undefined,
  }
}

/** Khóa dedup fallback khi backend chưa có dedup_key (dữ liệu cũ). */
export function buildSafetyDedupKey(
  cameraId: string,
  scenarioId: string,
  trackHint: string,
): string {
  return `${cameraId}|${scenarioId}|${trackHint}`
}

/** Loại bản trùng — giữ bản mới nhất theo dedupKey hoặc id. */
export function dedupeSafetyRecords(records: SafetyViolationRecord[]): SafetyViolationRecord[] {
  const best = new Map<string, SafetyViolationRecord>()
  for (const record of records) {
    const key = record.dedupKey ?? record.id
    const prev = best.get(key)
    if (!prev || new Date(record.detectedAt).getTime() > new Date(prev.detectedAt).getTime()) {
      best.set(key, record)
    }
  }
  return [...best.values()].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  )
}

export function isLiveSafetyRecord(record: SafetyViolationRecord): boolean {
  return record.id.startsWith('ai-')
}

export function filterLiveSafetyRecords(records: SafetyViolationRecord[]): SafetyViolationRecord[] {
  return records.filter(r => isImplementedSafetyScenario(r.scenarioId))
}

export type FetchSafetyAiEventsResult =
  | { ok: true; records: SafetyViolationRecord[] }
  | { ok: false; reason: 'no_backend' | 'http_error' | 'network_error' }

export async function fetchSafetyAiEvents(
  backendUrl?: string,
  date?: string,
): Promise<FetchSafetyAiEventsResult> {
  const base = normalizeBaseUrl(backendUrl ?? getMobileAiBackendUrl())
  if (!base) return { ok: false, reason: 'no_backend' }

  const params = new URLSearchParams({ limit: '200' })
  if (date) params.set('date', date)

  try {
    const res = await fetch(`${base}/events?${params.toString()}`, {
      headers: TUNNEL_HEADERS,
      mode: 'cors',
    })
    if (!res.ok) return { ok: false, reason: 'http_error' }
    const rows = await res.json() as BackendViolationEvent[]
    return {
      ok: true,
      records: dedupeSafetyRecords(
        filterLiveSafetyRecords(
          rows.map(row => mapBackendEventToSafetyRecord(row, base)),
        ),
      ),
    }
  } catch {
    return { ok: false, reason: 'network_error' }
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

export async function fetchOverlaySafetyEvents(): Promise<SafetyViolationRecord[]> {
  const result = await fetchSafetyAiEvents()
  return result.ok ? result.records : []
}
