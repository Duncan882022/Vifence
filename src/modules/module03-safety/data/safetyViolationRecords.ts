import type {
  AlertSeverity,
  MonitoringDeviceType,
  SafetyViolationRecord,
  ViolationStatus,
} from '../types/safety.types'
import { SAFETY_SCENARIOS } from './safetyScenarios'
import { buildEventSubject } from '../utils/eventSubject'
import { resolveViolationSnapshotUrl } from './safetyViolationSnapshots'
import { SAFETY_DEMO_TODAY, SAFETY_DEMO_YESTERDAY } from './safetyDemoDate'

const TODAY = SAFETY_DEMO_TODAY
const YESTERDAY = SAFETY_DEMO_YESTERDAY

/** 19 kịch bản giám sát — khớp `SAFETY_SCENARIOS` */
export const SAFETY_SCENARIO_COUNT = SAFETY_SCENARIOS.length

const CONTRACTORS = ['Vincons', 'SGC', 'Alpha'] as const
const WORKERS = [
  { id: 'w-001', name: 'Nguyễn Văn An', code: 'NV000912', contractor: 'Vincons' },
  { id: 'w-002', name: 'Trần Minh Đức', code: 'NV001034', contractor: 'SGC' },
  { id: 'w-003', name: 'Lê Hoàng Nam', code: 'NV000887', contractor: 'Alpha' },
  { id: 'w-004', name: 'Phạm Quốc Bảo', code: 'NV000756', contractor: 'Vincons' },
  { id: 'w-005', name: 'Võ Đức Thắng', code: 'NV000998', contractor: 'Vincons' },
  { id: 'w-006', name: 'Đinh Quốc Hùng', code: 'NV001045', contractor: 'SGC' },
  { id: 'w-007', name: 'Hoàng Văn Phúc', code: 'NV000823', contractor: 'Alpha' },
  { id: 'w-008', name: 'Bùi Thanh Tùng', code: 'NV000691', contractor: 'SGC' },
]

const VEHICLES = [
  { plate: '30H-582.14', type: 'Xe tải', driver: 'Võ Đức Thắng' },
  { plate: '51C-778.21', type: 'Xe ben', driver: 'Trần Minh Đức' },
  { plate: '29C-441.09', type: 'Xe cứu hỏa', driver: undefined },
]

const ZONE_DEVICE: Record<string, { deviceId: string; type: MonitoringDeviceType }[]> = {
  'ZONE-A01': [
    { deviceId: 'CAM-01', type: 'FIXED_CAMERA' },
    { deviceId: 'PTZ-01', type: 'PTZ_CAMERA' },
    { deviceId: 'BODY-01', type: 'BODY_CAMERA' },
  ],
  'ZONE-A02': [
    { deviceId: 'CAM-03', type: 'FIXED_CAMERA' },
    { deviceId: 'PTZ-02', type: 'PTZ_CAMERA' },
    { deviceId: 'BODY-03', type: 'BODY_CAMERA' },
  ],
  'ZONE-B01': [
    { deviceId: 'CAM-05', type: 'FIXED_CAMERA' },
    { deviceId: 'CAM-06', type: 'FIXED_CAMERA' },
  ],
  'ZONE-B02': [
    { deviceId: 'CAM-07', type: 'FIXED_CAMERA' },
    { deviceId: 'CAM-08', type: 'FIXED_CAMERA' },
    { deviceId: 'CAM-09', type: 'FIXED_CAMERA' },
  ],
  'ZONE-B03': [
    { deviceId: 'DRONE-01', type: 'DRONE' },
    { deviceId: 'CAM-10', type: 'FIXED_CAMERA' },
  ],
  'ZONE-C01': [
    { deviceId: 'BODY-04', type: 'BODY_CAMERA' },
    { deviceId: 'BODY-05', type: 'BODY_CAMERA' },
    { deviceId: 'CAM-06', type: 'FIXED_CAMERA' },
  ],
}

/** Khu vực mặc định theo kịch bản */
const SCENARIO_ZONE: Record<string, string> = {
  'PPE-001': 'ZONE-A01', 'PPE-002': 'ZONE-A02', 'PPE-003': 'ZONE-B02',
  'WAH-001': 'ZONE-A01', 'WAH-002': 'ZONE-A02', 'WAH-003': 'ZONE-A02',
  'DZ-001': 'ZONE-C01', 'DZ-002': 'ZONE-B03',
  'ATGT-001': 'ZONE-B02', 'ATGT-002': 'ZONE-B01', 'ATGT-003': 'ZONE-B01', 'ATGT-004': 'ZONE-B02',
  'BPTC-001': 'ZONE-A01', 'BPTC-002': 'ZONE-A02', 'BPTC-003': 'ZONE-C01',
  'BPTC-004': 'ZONE-C01', 'BPTC-005': 'ZONE-A01', 'BPTC-006': 'ZONE-A02',
  'PCCC-001': 'ZONE-A01',
}

const OPEN_STATUSES: ViolationStatus[] = [
  'DETECTED', 'PENDING_VERIFICATION', 'CONFIRMED', 'ASSIGNED',
  'IN_PROGRESS', 'PENDING_RECHECK', 'OVERDUE',
]

let seq = 1

function ts(date: string, hour: number, minute: number): string {
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
}

function pickWorker(i: number) {
  return WORKERS[i % WORKERS.length]
}

function pickContractor(i: number) {
  return CONTRACTORS[i % CONTRACTORS.length]
}

function pickVehicle(i: number) {
  return VEHICLES[i % VEHICLES.length]
}

function pickDevice(zoneId: string, i: number) {
  const devices = ZONE_DEVICE[zoneId] ?? [{ deviceId: 'CAM-01', type: 'FIXED_CAMERA' as MonitoringDeviceType }]
  return devices[i % devices.length]
}

interface GenOpts {
  scenarioId: string
  zoneId: string
  date?: string
  hour: number
  minute: number
  severity?: AlertSeverity
  status?: ViolationStatus
  confidence?: number
  workerIdx?: number
  contractorIdx?: number
  deviceIdx?: number
  vehicleIdx?: number
  dueAt?: string
  floor?: string
  workItem?: string
}

function gen(o: GenOpts): SafetyViolationRecord {
  const scenario = SAFETY_SCENARIOS.find(s => s.id === o.scenarioId)!
  const device = pickDevice(o.zoneId, o.deviceIdx ?? seq)
  const contractorName = o.workerIdx !== undefined
    ? pickWorker(o.workerIdx).contractor
    : pickContractor(o.contractorIdx ?? seq)
  const worker = o.workerIdx !== undefined ? pickWorker(o.workerIdx) : undefined
  const vehicle = scenario.eventSubjectType === 'VEHICLE'
    ? pickVehicle(o.vehicleIdx ?? o.workerIdx ?? seq)
    : undefined

  const subject = buildEventSubject({
    scenarioId: o.scenarioId,
    zoneId: o.zoneId,
    contractorName,
    worker: worker ? { id: worker.id, name: worker.name, code: worker.code, contractor: worker.contractor } : undefined,
    vehicle,
    floor: o.floor,
    workItem: o.workItem,
  })

  const id = `SV-${String(seq++).padStart(4, '0')}`
  const date = o.date ?? TODAY

  return {
    id,
    scenarioId: o.scenarioId,
    groupId: scenario.groupId,
    zoneId: o.zoneId,
    sourceDeviceId: device.deviceId,
    sourceType: device.type,
    detectedAt: ts(date, o.hour, o.minute),
    severity: o.severity ?? scenario.defaultSeverity,
    status: o.status ?? 'DETECTED',
    confidence: o.confidence ?? (scenario.automationLevel === 'AUTOMATIC' ? 0.92 : 0.74),
    eventSubjectType: scenario.eventSubjectType,
    subject,
    snapshotUrl: resolveViolationSnapshotUrl({
      id,
      scenarioId: o.scenarioId,
      groupId: scenario.groupId,
      zoneId: o.zoneId,
      sourceDeviceId: device.deviceId,
      sourceType: device.type,
      detectedAt: ts(date, o.hour, o.minute),
      severity: o.severity ?? scenario.defaultSeverity,
      status: o.status ?? 'DETECTED',
      eventSubjectType: scenario.eventSubjectType,
      subject,
      verificationRequired: scenario.automationLevel === 'HSE_VERIFICATION',
    }),
    verificationRequired: scenario.automationLevel === 'HSE_VERIFICATION',
    dueAt: o.dueAt,
    description: scenario.description,
    contractorName: subject.contractorName ?? subject.siteContractor ?? contractorName,
    workerId: subject.workerId,
    workerName: subject.workerName,
  }
}

function subjectOpts(scenarioId: string, i: number): Pick<GenOpts, 'workerIdx' | 'contractorIdx' | 'vehicleIdx'> {
  const scenario = SAFETY_SCENARIOS.find(s => s.id === scenarioId)!
  switch (scenario.eventSubjectType) {
    case 'PERSON':
      return { workerIdx: i }
    case 'VEHICLE':
      return { vehicleIdx: i }
    default:
      return { contractorIdx: i }
  }
}

/** Mỗi kịch bản — đúng 1 sự kiện hôm nay; trạng thái đa dạng, khớp 19 kịch bản dictionary */
function buildTodayCatalog(): SafetyViolationRecord[] {
  return SAFETY_SCENARIOS.map((scenario, i) => {
    const zoneId = SCENARIO_ZONE[scenario.id] ?? 'ZONE-A01'
    let status: ViolationStatus = OPEN_STATUSES[i % OPEN_STATUSES.length]
    let dueAt: string | undefined

    if (scenario.id === 'PCCC-001') {
      status = 'DETECTED'
    } else if (scenario.automationLevel === 'HSE_VERIFICATION') {
      status = 'PENDING_VERIFICATION'
    } else if (scenario.defaultSeverity === 'CRITICAL') {
      status = i % 2 === 0 ? 'DETECTED' : 'ASSIGNED'
    } else if (scenario.groupId === 'ATGT' && scenario.id === 'ATGT-001') {
      status = 'OVERDUE'
      dueAt = `${TODAY}T08:00:00`
    } else if (i % 17 === 0) {
      status = 'CLOSED'
    }

    return gen({
      scenarioId: scenario.id,
      zoneId,
      hour: 7 + (i % 10),
      minute: (i * 13 + 5) % 60,
      status,
      dueAt,
      deviceIdx: i,
      confidence: scenario.automationLevel === 'HSE_VERIFICATION' ? 0.62 + (i % 10) * 0.03 : undefined,
      ...subjectOpts(scenario.id, i),
    })
  })
}

/** Bổ sung volume — phân bổ theo 6 nhóm / 19 kịch bản (catalog đã có 1 sự kiện/kịch bản) */
const SUPPLEMENTAL_TODAY: GenOpts[] = [
  // PPE (3 kịch bản)
  { scenarioId: 'PPE-001', zoneId: 'ZONE-A02', hour: 8, minute: 12, status: 'DETECTED', workerIdx: 1 },
  { scenarioId: 'PPE-003', zoneId: 'ZONE-B02', hour: 8, minute: 35, status: 'ASSIGNED', workerIdx: 5 },
  // WAH (3 kịch bản)
  { scenarioId: 'WAH-001', zoneId: 'ZONE-A01', hour: 7, minute: 18, severity: 'CRITICAL', status: 'DETECTED', workerIdx: 0 },
  { scenarioId: 'WAH-002', zoneId: 'ZONE-A02', hour: 8, minute: 44, severity: 'CRITICAL', status: 'CONFIRMED', workerIdx: 2 },
  // DZ (2 kịch bản)
  { scenarioId: 'DZ-001', zoneId: 'ZONE-B02', hour: 11, minute: 8, status: 'PENDING_VERIFICATION', contractorIdx: 1, confidence: 0.71 },
  // ATGT (4 kịch bản)
  { scenarioId: 'ATGT-002', zoneId: 'ZONE-B01', hour: 9, minute: 18, status: 'IN_PROGRESS', vehicleIdx: 0, confidence: 0.97 },
  { scenarioId: 'ATGT-003', zoneId: 'ZONE-B01', hour: 10, minute: 5, status: 'PENDING_VERIFICATION', contractorIdx: 0, confidence: 0.68 },
  { scenarioId: 'ATGT-004', zoneId: 'ZONE-B02', hour: 13, minute: 5, status: 'DETECTED', contractorIdx: 1, confidence: 0.72 },
  // BPTC (6 kịch bản — nhóm nhiều kịch bản nhất)
  { scenarioId: 'BPTC-001', zoneId: 'ZONE-A02', hour: 12, minute: 40, status: 'PENDING_VERIFICATION', contractorIdx: 0, confidence: 0.63 },
  { scenarioId: 'BPTC-002', zoneId: 'ZONE-A02', hour: 9, minute: 50, status: 'ASSIGNED', contractorIdx: 1 },
  { scenarioId: 'BPTC-003', zoneId: 'ZONE-C01', hour: 11, minute: 25, status: 'PENDING_VERIFICATION', contractorIdx: 2, confidence: 0.58 },
  { scenarioId: 'BPTC-004', zoneId: 'ZONE-C01', hour: 6, minute: 55, status: 'OVERDUE', contractorIdx: 1, dueAt: `${TODAY}T07:30:00` },
  { scenarioId: 'BPTC-005', zoneId: 'ZONE-A01', hour: 10, minute: 35, status: 'PENDING_VERIFICATION', contractorIdx: 0, confidence: 0.65 },
  { scenarioId: 'BPTC-006', zoneId: 'ZONE-A02', hour: 14, minute: 10, status: 'IN_PROGRESS', contractorIdx: 2 },
  // PCCC (1 kịch bản)
  { scenarioId: 'PCCC-001', zoneId: 'ZONE-C01', hour: 14, minute: 48, status: 'CLOSED', workerIdx: 7 },
]

function buildTodaySupplemental(): SafetyViolationRecord[] {
  return SUPPLEMENTAL_TODAY.map((row, i) => gen({
    ...row,
    zoneId: row.zoneId ?? SCENARIO_ZONE[row.scenarioId] ?? 'ZONE-A01',
    deviceIdx: i + 30,
  }))
}

/** Pre-Alert (tab Cảnh báo) — Rule Engine, severity WARNING, không thuộc mức vi phạm mặc định */
const PRE_ALERT_TODAY: GenOpts[] = [
  { scenarioId: 'WAH-001', zoneId: 'ZONE-A01', hour: 15, minute: 2, severity: 'WARNING', status: 'DETECTED', workerIdx: 3, confidence: 0.76 },
  { scenarioId: 'WAH-003', zoneId: 'ZONE-A02', hour: 15, minute: 11, severity: 'WARNING', status: 'DETECTED', workerIdx: 1, confidence: 0.69 },
  { scenarioId: 'PPE-001', zoneId: 'ZONE-A01', hour: 15, minute: 18, severity: 'WARNING', status: 'DETECTED', workerIdx: 4, confidence: 0.52 },
  { scenarioId: 'PPE-002', zoneId: 'ZONE-A02', hour: 15, minute: 22, severity: 'WARNING', status: 'DETECTED', workerIdx: 2, confidence: 0.61 },
  { scenarioId: 'PPE-003', zoneId: 'ZONE-B02', hour: 15, minute: 26, severity: 'WARNING', status: 'DETECTED', workerIdx: 5, confidence: 0.58 },
  { scenarioId: 'ATGT-002', zoneId: 'ZONE-B01', hour: 15, minute: 28, severity: 'WARNING', status: 'DETECTED', vehicleIdx: 1, confidence: 0.88 },
  { scenarioId: 'DZ-001', zoneId: 'ZONE-C01', hour: 15, minute: 33, severity: 'WARNING', status: 'DETECTED', contractorIdx: 2, confidence: 0.73 },
  { scenarioId: 'DZ-002', zoneId: 'ZONE-B03', hour: 15, minute: 41, severity: 'WARNING', status: 'DETECTED', contractorIdx: 0, confidence: 0.67 },
  { scenarioId: 'BPTC-001', zoneId: 'ZONE-A01', hour: 15, minute: 48, severity: 'WARNING', status: 'DETECTED', contractorIdx: 1, confidence: 0.59 },
  { scenarioId: 'ATGT-003', zoneId: 'ZONE-B01', hour: 16, minute: 3, severity: 'WARNING', status: 'DETECTED', contractorIdx: 2, confidence: 0.64 },
  { scenarioId: 'ATGT-004', zoneId: 'ZONE-B02', hour: 16, minute: 8, severity: 'WARNING', status: 'DETECTED', contractorIdx: 1, confidence: 0.70 },
  { scenarioId: 'BPTC-006', zoneId: 'ZONE-A02', hour: 16, minute: 15, severity: 'WARNING', status: 'DETECTED', contractorIdx: 0, confidence: 0.62 },
  { scenarioId: 'PCCC-001', zoneId: 'ZONE-C01', hour: 16, minute: 22, severity: 'WARNING', status: 'DETECTED', workerIdx: 6, confidence: 0.71 },
]

/** Bổ sung panel Cảnh báo — đủ workflow filter, quick filter, PPE AI tự động */
const ALERTS_PANEL_TODAY: GenOpts[] = [
  { scenarioId: 'PPE-002', zoneId: 'ZONE-A01', hour: 8, minute: 48, status: 'DETECTED', workerIdx: 2, deviceIdx: 2 },
  { scenarioId: 'PPE-003', zoneId: 'ZONE-A02', hour: 9, minute: 5, status: 'DETECTED', workerIdx: 6 },
  { scenarioId: 'PPE-001', zoneId: 'ZONE-B02', hour: 10, minute: 15, status: 'CLOSED', workerIdx: 0 },
  { scenarioId: 'WAH-003', zoneId: 'ZONE-A02', hour: 11, minute: 20, severity: 'CRITICAL', status: 'CONFIRMED', workerIdx: 3 },
  { scenarioId: 'BPTC-005', zoneId: 'ZONE-A01', hour: 11, minute: 55, severity: 'CRITICAL', status: 'PENDING_RECHECK', contractorIdx: 0 },
  { scenarioId: 'DZ-002', zoneId: 'ZONE-B03', hour: 12, minute: 10, status: 'CONFIRMED', contractorIdx: 1, deviceIdx: 0 },
  { scenarioId: 'DZ-001', zoneId: 'ZONE-B03', hour: 12, minute: 30, status: 'DETECTED', contractorIdx: 2, deviceIdx: 0 },
  { scenarioId: 'WAH-001', zoneId: 'ZONE-A01', hour: 13, minute: 0, severity: 'CRITICAL', status: 'PENDING_VERIFICATION', workerIdx: 4, deviceIdx: 2, confidence: 0.61 },
  { scenarioId: 'ATGT-001', zoneId: 'ZONE-B02', hour: 13, minute: 20, status: 'ASSIGNED', contractorIdx: 0, confidence: 0.72 },
  { scenarioId: 'BPTC-001', zoneId: 'ZONE-A02', hour: 13, minute: 45, status: 'IN_PROGRESS', contractorIdx: 1, confidence: 0.66 },
  { scenarioId: 'BPTC-004', zoneId: 'ZONE-C01', hour: 14, minute: 5, severity: 'CRITICAL', status: 'OVERDUE', contractorIdx: 2, dueAt: `${TODAY}T13:00:00` },
  { scenarioId: 'PCCC-001', zoneId: 'ZONE-A01', hour: 14, minute: 20, status: 'DETECTED', workerIdx: 7 },
]

function buildTodayPreAlerts(): SafetyViolationRecord[] {
  return PRE_ALERT_TODAY.map((row, i) => gen({
    ...subjectOpts(row.scenarioId, i + 10),
    ...row,
    zoneId: row.zoneId ?? SCENARIO_ZONE[row.scenarioId] ?? 'ZONE-A01',
    deviceIdx: row.deviceIdx ?? i + 50,
  }))
}

function buildAlertsPanelSeed(): SafetyViolationRecord[] {
  return ALERTS_PANEL_TODAY.map((row, i) => gen({
    ...subjectOpts(row.scenarioId, i + 20),
    ...row,
    zoneId: row.zoneId ?? SCENARIO_ZONE[row.scenarioId] ?? 'ZONE-A01',
    deviceIdx: row.deviceIdx ?? i + 70,
  }))
}

/** Hôm qua — mỗi kịch bản ít nhất 1 bản ghi */
function buildYesterdayRecords(): SafetyViolationRecord[] {
  return SAFETY_SCENARIOS.flatMap((scenario, i) => {
    const zoneId = SCENARIO_ZONE[scenario.id] ?? 'ZONE-A01'
    const base = gen({
      scenarioId: scenario.id,
      zoneId,
      date: YESTERDAY,
      hour: 7 + (i % 8),
      minute: (i * 9 + 3) % 60,
      status: i % 3 === 0 ? 'CLOSED' : 'IN_PROGRESS',
      ...subjectOpts(scenario.id, i),
    })
    if (i % 4 !== 0) return [base]
    return [
      base,
      gen({
        scenarioId: scenario.id,
        zoneId: ['ZONE-A01', 'ZONE-A02', 'ZONE-B01', 'ZONE-C01'][i % 4],
        date: YESTERDAY,
        hour: 13 + (i % 4),
        minute: (i * 7) % 60,
        status: 'CLOSED',
        ...subjectOpts(scenario.id, i + 1),
      }),
    ]
  })
}

const TODAY_CATALOG = buildTodayCatalog()
const TODAY_SUPPLEMENTAL = buildTodaySupplemental()
const TODAY_PRE_ALERTS = buildTodayPreAlerts()
const TODAY_ALERTS_SEED = buildAlertsPanelSeed()
const YESTERDAY_EVENTS = buildYesterdayRecords()

export const SAFETY_VIOLATION_RECORDS: SafetyViolationRecord[] = [
  ...TODAY_CATALOG,
  ...TODAY_SUPPLEMENTAL,
  ...TODAY_PRE_ALERTS,
  ...TODAY_ALERTS_SEED,
  ...YESTERDAY_EVENTS,
]

export function getTodayViolations(): SafetyViolationRecord[] {
  return SAFETY_VIOLATION_RECORDS.filter(v => v.detectedAt.startsWith(TODAY))
}

export function getYesterdayViolations(): SafetyViolationRecord[] {
  return SAFETY_VIOLATION_RECORDS.filter(v => v.detectedAt.startsWith(YESTERDAY))
}

export function isOpenStatus(status: ViolationStatus): boolean {
  return status !== 'CLOSED'
}

export { OPEN_STATUSES }

/** Kiểm tra coverage mock — mỗi kịch bản có ≥1 sự kiện hôm nay */
export function assertTodayScenarioCoverage(records = getTodayViolations()): void {
  const covered = new Set(records.map(v => v.scenarioId))
  const missing = SAFETY_SCENARIOS.filter(s => !covered.has(s.id))
  if (missing.length > 0) {
    console.warn('[safetyViolationRecords] Thiếu mock hôm nay:', missing.map(s => s.id).join(', '))
  }
}

if (import.meta.env.DEV) {
  assertTodayScenarioCoverage()
  const today = getTodayViolations()
  const groupIds = ['PPE', 'WAH', 'DZ', 'ATGT', 'BPTC', 'PCCC'] as const
  const groupSum = groupIds.reduce((sum, id) => sum + today.filter(v => v.groupId === id).length, 0)
  if (groupSum !== today.length) {
    console.warn('[safetyViolationRecords] Tổng nhóm ≠ tổng hôm nay:', groupSum, today.length)
  }
  const expectedPerGroup: Record<(typeof groupIds)[number], number> = {
    PPE: 3, WAH: 3, DZ: 2, ATGT: 4, BPTC: 6, PCCC: 1,
  }
  for (const id of groupIds) {
    const scenariosInGroup = new Set(today.filter(v => v.groupId === id).map(v => v.scenarioId))
    if (scenariosInGroup.size < expectedPerGroup[id]) {
      console.warn(`[safetyViolationRecords] Nhóm ${id} thiếu kịch bản hôm nay: ${scenariosInGroup.size}/${expectedPerGroup[id]}`)
    }
  }

  const warningCount = today.filter(v => v.severity === 'WARNING').length
  const ppeCount = today.filter(v => v.groupId === 'PPE').length
  const workflowStatuses = new Set(today.map(v => v.status))
  if (warningCount < 8) {
    console.warn('[safetyViolationRecords] Panel Cảnh báo: thiếu Pre-Alert WARNING, có', warningCount)
  }
  if (ppeCount < 6) {
    console.warn('[safetyViolationRecords] Panel Cảnh báo: thiếu mock PPE, có', ppeCount)
  }
  for (const status of OPEN_STATUSES) {
    if (!workflowStatuses.has(status)) {
      console.warn('[safetyViolationRecords] Panel Cảnh báo: thiếu trạng thái workflow', status)
    }
  }
  if (!workflowStatuses.has('CLOSED')) {
    console.warn('[safetyViolationRecords] Panel Cảnh báo: thiếu trạng thái CLOSED')
  }
}
