import { formatVnDate, formatVnDateOffsetDays, formatVnIsoFromUnix } from '@/utils/vnDateTime'
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
import { isStaleAtgt004LaneNote } from '../utils/eventSubject'
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
  no_soft_median: 'ATGT-004',
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
  no_soft_median: 'ATGT',
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
  no_soft_median: 'VIOLATION',
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

function buildSnapshotUrl(backendUrl: string, eventId: string, cacheKey?: number): string {
  const base = `${normalizeBaseUrl(backendUrl)}/events/${eventId}/snapshot`
  if (cacheKey == null || !Number.isFinite(cacheKey)) return base
  return `${base}?t=${Math.floor(cacheKey)}`
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
  worker_id?: string | null
  worker_name?: string | null
  employee_code?: string | null
  contractor_name?: string | null
  face_match_confidence?: number | null
}

function buildVehicleSubject(event: BackendViolationEvent): SafetyViolationRecord['subject'] {
  return {
    type: 'VEHICLE',
    vehiclePlate: resolveVehiclePlate(event.vehicle_plate),
    vehicleType: event.vehicle_type ?? undefined,
  }
}

function buildSiteConditionSubject(scenarioId: string): SafetyViolationRecord['subject'] {
  return {
    type: 'SITE_CONDITION',
    workItem: getScenarioName(scenarioId),
    siteContractor: 'Vincons',
    contractorName: 'Vincons',
    responsibleUnit: 'CONTRACTOR',
  }
}

function buildCam03SiteSubject(
  scenarioId: string,
  behavior: string,
): SafetyViolationRecord['subject'] {
  if (behavior.startsWith('mesh_')) {
    return {
      type: 'SITE_CONDITION',
      siteContractor: 'Vincons',
      contractorName: 'Vincons',
      responsibleUnit: 'CONTRACTOR',
    }
  }
  return buildSiteConditionSubject(scenarioId)
}

const CAM04_PCCC_SMOKING_DEMO_SUBJECT: SafetyViolationRecord['subject'] = {
  type: 'PERSON',
  workerId: 'w-021',
  workerName: 'Phạm Quang Tùng',
  employeeCode: 'VCS112233',
  contractorName: 'Vincons',
  responsibleUnit: 'CONTRACTOR',
}

const CAM04_DZ_DEMO_SUBJECT: SafetyViolationRecord['subject'] = {
  type: 'PERSON',
  workerId: 'w-019',
  workerName: 'Nguyễn Văn Hoàng',
  employeeCode: 'NV001155',
  contractorName: 'Vincons',
  responsibleUnit: 'CONTRACTOR',
}

function isUnknownWorkerName(name: string | undefined): boolean {
  const trimmed = name?.trim()
  return !trimmed || trimmed.toLowerCase() === 'unknown'
}

function buildPersonSubject(event: BackendViolationEvent): SafetyViolationRecord['subject'] {
  const fromApi: SafetyViolationRecord['subject'] = {
    type: 'PERSON',
    workerId: event.worker_id ?? undefined,
    workerName: event.worker_name ?? undefined,
    employeeCode: event.employee_code ?? undefined,
    contractorName: event.contractor_name ?? undefined,
    responsibleUnit: 'CONTRACTOR',
  }
  if (
    event.behavior === 'smoking'
    && event.camera_id === 'A-04'
    && isUnknownWorkerName(fromApi.workerName)
  ) {
    return { ...CAM04_PCCC_SMOKING_DEMO_SUBJECT }
  }
  if (
    event.camera_id === 'A-04'
    && (event.behavior === 'crane_proximity' || event.scenario_id === 'DZ-003')
    && isUnknownWorkerName(fromApi.workerName)
  ) {
    return { ...CAM04_DZ_DEMO_SUBJECT }
  }
  return fromApi
}

function isValidAtgt004LiveRecord(record: SafetyViolationRecord): boolean {
  if (record.scenarioId !== 'ATGT-004') return true
  if (record.aiBehavior && record.aiBehavior !== 'no_soft_median') return false
  if (isStaleAtgt004LaneNote(record.subject?.workItem)) return false
  if (isStaleAtgt004LaneNote(record.description)) return false
  return true
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
        : buildCam03SiteSubject(scenarioId, event.behavior))
      : event.behavior === 'fire'
        ? buildSiteConditionSubject(scenarioId)
        : buildPersonSubject(event),
    verificationRequired: !isCam04Ai || event.behavior === 'crane_proximity',
    description: getScenarioName(scenarioId),
    aiBehavior: event.behavior,
    snapshotUrl: buildSnapshotUrl(
      backendUrl,
      event.id,
      event.confirmed_at ?? event.created_at,
    ),
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
  return records.filter(r => isImplementedSafetyScenario(r.scenarioId) && isValidAtgt004LiveRecord(r))
}

export type FetchSafetyAiEventsResult =
  | { ok: true; records: SafetyViolationRecord[] }
  | { ok: false; reason: 'no_backend' | 'http_error' | 'network_error' }

export function getSafetyLiveEventDate(): string {
  /** Live AI — luôn hôm nay (VN), không dính session ?date= demo playback. */
  return formatVnDate()
}

export function getSafetyLiveYesterdayDate(): string {
  return formatVnDateOffsetDays(-1, getSafetyLiveEventDate())
}

export async function fetchSafetyAiEvents(
  backendUrl?: string,
  date?: string,
): Promise<FetchSafetyAiEventsResult> {
  const base = normalizeBaseUrl(backendUrl ?? getMobileAiBackendUrl())
  if (!base) return { ok: false, reason: 'no_backend' }

  const params = new URLSearchParams({ limit: '200' })
  const eventDate = date ?? getSafetyLiveEventDate()
  params.set('date', eventDate)

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
