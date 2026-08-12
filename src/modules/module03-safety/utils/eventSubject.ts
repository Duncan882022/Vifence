import type {
  EventSubjectType,
  ResponsibleUnitType,
  SafetyEventSubject,
  SafetyViolationRecord,
} from '../types/safety.types'
import { getScenarioName, SAFETY_SCENARIO_MAP } from '../data/safetyScenarios'
import { getZoneName, SAFETY_ZONE_MAP } from '../data/safetyZones'
import { displayUnknown } from './displayUnknown'
import { resolveVehiclePlate } from './vehiclePlate'

export function normalizeDetailText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isDuplicateDetailText(a: string | undefined, b: string | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false
  const left = normalizeDetailText(a)
  const right = normalizeDetailText(b)
  return left === right || left.includes(right) || right.includes(left)
}

/** BPTC-001 — chi tiết thiếu/bẩn hiển thị qua màu ROI (xanh/nâu), không lặp text. */
const MESH_VARIANT_DESCRIPTIONS = new Set([
  'lưới bao che thiếu',
  'lưới bao che bẩn',
])

/** Metadata cũ từ backend khi hard_median bị log nhầm ATGT-004. */
const ATGT004_STALE_LANE_PHRASES = [
  /đã tổ chức/i,
  /làn cứng/i,
  /làn mềm/i,
  /hàng rào/i,
  /phân cách/i,
]

export function isStaleAtgt004LaneNote(text: string | undefined): boolean {
  const normalized = text?.trim()
  if (!normalized) return false
  return ATGT004_STALE_LANE_PHRASES.some(pattern => pattern.test(normalized))
}

/** Tiêu đề sự kiện — tên kịch bản Nhóm ATLĐ (SCENARIO_ID_DISPLAY_NAME). */
export function resolveEventScenarioTitle(record: SafetyViolationRecord): string {
  return getScenarioName(record.scenarioId)
}

export function shouldShowEventDescriptionNote(
  record: SafetyViolationRecord,
  title: string,
): boolean {
  const extra = record.description?.trim()
  if (!extra) return false
  if (record.scenarioId === 'BPTC-001' && MESH_VARIANT_DESCRIPTIONS.has(normalizeDetailText(extra))) {
    return false
  }
  if (record.scenarioId === 'ATGT-004' && isStaleAtgt004LaneNote(extra)) {
    return false
  }
  const scenario = SAFETY_SCENARIO_MAP.get(record.scenarioId)
  const skipAgainst = [
    title,
    getScenarioName(record.scenarioId),
    scenario?.name,
    scenario?.description,
  ]
  return !skipAgainst.some(text => isDuplicateDetailText(extra, text))
}

export function shouldShowSubjectDetailRow(record: SafetyViolationRecord, title: string): boolean {
  const type = getEventSubjectType(record)
  const s = getSubject(record)

  if (type === 'PERSON' || type === 'VEHICLE') return true

  if (type === 'SITE_CONDITION') {
    if (record.scenarioId === 'ATGT-004') return false
    return Boolean(s.workItem?.trim() && !isDuplicateDetailText(s.workItem, title))
  }
  if (type === 'CONSTRUCTION_ACTIVITY') {
    const specific = s.workActivity ?? s.workItem
    return Boolean(specific?.trim() && !isDuplicateDetailText(specific, title))
  }
  if (type === 'MANAGEMENT') {
    const specific = s.managementUnit ?? s.responsibleRole
    return Boolean(specific?.trim() && !isDuplicateDetailText(specific, title))
  }
  return false
}

export function shouldShowAlertSubjectLine(record: SafetyViolationRecord): boolean {
  const title = resolveEventScenarioTitle(record)
  const label = getAlertSubjectLabel(record)
  if (!label || label === '—') return false
  if (isDuplicateDetailText(label, title)) return false
  if (label === EVENT_SUBJECT_LABELS.SITE_CONDITION) return false
  if (label === EVENT_SUBJECT_LABELS.CONSTRUCTION_ACTIVITY) return false
  if (label === EVENT_SUBJECT_LABELS.MANAGEMENT) return false
  return true
}

export const EVENT_SUBJECT_LABELS: Record<EventSubjectType, string> = {
  PERSON: 'Người lao động',
  VEHICLE: 'Phương tiện',
  SITE_CONDITION: 'Hiện trạng công trường',
  CONSTRUCTION_ACTIVITY: 'Hoạt động thi công',
  MANAGEMENT: 'Điều hành / Tổ chức',
}

export const RESPONSIBLE_UNIT_LABELS: Record<ResponsibleUnitType, string> = {
  CONTRACTOR: 'Nhà thầu',
  CONSTRUCTION_TEAM: 'Đội thi công',
  SITE_MANAGEMENT: 'Ban điều hành',
  HSE: 'HSE',
}

const BLOCK_BY_ZONE: Record<string, string> = {
  'ZONE-A01': 'Block Bắc',
  'ZONE-A02': 'Block T.Bắc',
  'ZONE-B01': 'Đường nội bộ',
  'ZONE-B02': 'Nút Tây',
  'ZONE-B03': 'Nút Đông',
  'ZONE-C01': 'Block Nam',
}

const TEAM_BY_CONTRACTOR: Record<string, string> = {
  Vincons: 'Thi công · TTDV-A',
  SGC: 'Máy hạng nặng · TMDV-B',
  Alpha: 'Vận tải · TMDV-C',
}

export function getEventSubjectType(record: SafetyViolationRecord): EventSubjectType {
  return record.eventSubjectType ?? SAFETY_SCENARIO_MAP.get(record.scenarioId)?.eventSubjectType ?? 'PERSON'
}

export function getSubject(record: SafetyViolationRecord): SafetyEventSubject {
  return record.subject ?? { type: getEventSubjectType(record) }
}

interface BuildSubjectInput {
  scenarioId: string
  zoneId: string
  contractorName: string
  worker?: { id: string; name: string; code: string; contractor: string }
  vehicle?: { plate: string; type: string; driver?: string }
  floor?: string
  workItem?: string
}

export function buildEventSubject(input: BuildSubjectInput): SafetyEventSubject {
  const scenario = SAFETY_SCENARIO_MAP.get(input.scenarioId)
  const type = scenario?.eventSubjectType ?? 'PERSON'
  const zone = SAFETY_ZONE_MAP.get(input.zoneId)
  const block = BLOCK_BY_ZONE[input.zoneId] ?? zone?.name ?? input.zoneId
  const team = TEAM_BY_CONTRACTOR[input.contractorName] ?? `${input.contractorName} · Giảng Võ`

  switch (type) {
    case 'PERSON':
      return {
        type,
        workerId: input.worker?.id,
        workerName: input.worker?.name,
        employeeCode: input.worker?.code,
        contractorName: input.worker?.contractor ?? input.contractorName,
        teamName: team,
        responsibleUnit: 'CONTRACTOR',
      }
    case 'VEHICLE':
      return {
        type,
        vehiclePlate: input.vehicle?.plate
          ? resolveVehiclePlate(input.vehicle.plate)
          : undefined,
        vehicleType: input.vehicle?.type,
        contractorName: input.contractorName,
        responsibleUnit: 'CONTRACTOR',
      }
    case 'SITE_CONDITION':
      return {
        type,
        block,
        floor: input.floor ?? 'Tầng 3–5',
        workItem: input.workItem ?? getScenarioName(input.scenarioId),
        siteContractor: input.contractorName,
        responsibleUnit: 'CONTRACTOR',
      }
    case 'CONSTRUCTION_ACTIVITY':
      return {
        type,
        workActivity: getScenarioName(input.scenarioId),
        workItem: input.workItem ?? block,
        constructionUnit: input.contractorName,
        supervisorName: input.worker?.name ?? 'Chỉ huy trưởng ca',
        contractorName: input.contractorName,
        responsibleUnit: 'CONSTRUCTION_TEAM',
      }
    case 'MANAGEMENT':
      return {
        type,
        managementUnit: input.contractorName,
        responsibleRole: scenario?.name.includes('điều hướng') ? 'Điều phối giao thông' : 'Ban ATL / Điều hành',
        responsiblePerson: 'Trưởng ca thi công',
        block,
        contractorName: input.contractorName,
        responsibleUnit: scenario?.name.includes('phân') ? 'SITE_MANAGEMENT' : 'HSE',
      }
    default:
      return { type: 'PERSON' }
  }
}

/** Tìm kiếm đa trường — không chỉ tên công nhân */
export function matchesEventSearch(record: SafetyViolationRecord, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const s = getSubject(record)
  const haystack = [
    record.id,
    getScenarioName(record.scenarioId),
    getZoneName(record.zoneId),
    record.description,
    s.workerName,
    s.employeeCode,
    s.vehiclePlate,
    s.vehicleType,
    s.driverName,
    s.contractorName,
    s.teamName,
    s.block,
    s.floor,
    s.workItem,
    s.siteContractor,
    s.workActivity,
    s.constructionUnit,
    s.supervisorName,
    s.managementUnit,
    s.responsibleRole,
    s.responsiblePerson,
    EVENT_SUBJECT_LABELS[getEventSubjectType(record)],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(q)
}

export function isPersonalViolation(record: SafetyViolationRecord): boolean {
  return getEventSubjectType(record) === 'PERSON'
}

export function isManagementAlert(record: SafetyViolationRecord): boolean {
  return getEventSubjectType(record) === 'MANAGEMENT'
}

export function isBodycamVerification(record: SafetyViolationRecord): boolean {
  return record.sourceType === 'BODY_CAMERA' && record.status === 'PENDING_VERIFICATION'
}

export function isUnassigned(record: SafetyViolationRecord): boolean {
  return record.status === 'DETECTED' || record.status === 'CONFIRMED'
}

/** Tên đối tượng hiển thị trên card cảnh báo — theo Subject Type, không mặc định là người vi phạm */
export function getAlertSubjectLabel(record: SafetyViolationRecord): string {
  const type = getEventSubjectType(record)
  const s = getSubject(record)

  switch (type) {
    case 'PERSON':
      return displayUnknown(s.workerName)
    case 'VEHICLE':
      return resolveVehiclePlate(s.vehiclePlate)
    case 'SITE_CONDITION':
      return EVENT_SUBJECT_LABELS.SITE_CONDITION
    case 'CONSTRUCTION_ACTIVITY':
      return displayUnknown(s.workActivity ?? s.workItem)
    case 'MANAGEMENT':
      return displayUnknown(s.managementUnit ?? s.responsibleRole)
    default:
      return displayUnknown(EVENT_SUBJECT_LABELS[type])
  }
}

/** Đơn vị chịu trách nhiệm — không dùng avatar người cho lỗi hiện trạng / điều hành */
export function getResponsiblePartyLabel(record: SafetyViolationRecord): string {
  const type = getEventSubjectType(record)
  const s = getSubject(record)

  switch (type) {
    case 'PERSON':
      return displayUnknown(s.contractorName ?? s.teamName)
    case 'VEHICLE':
      return displayUnknown(s.contractorName)
    case 'SITE_CONDITION':
      return displayUnknown(s.siteContractor ?? s.contractorName)
    case 'CONSTRUCTION_ACTIVITY':
      return displayUnknown(s.constructionUnit ?? s.teamName ?? s.contractorName)
    case 'MANAGEMENT':
      return displayUnknown(
        s.managementUnit
          ?? (s.responsibleUnit ? RESPONSIBLE_UNIT_LABELS[s.responsibleUnit] : undefined),
      )
    default:
      return displayUnknown(s.contractorName)
  }
}
