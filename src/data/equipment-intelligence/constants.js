/** @typedef {'IDLE' | 'WAITING_CONCRETE' | 'WAITING_OPERATOR' | 'SAFETY_STOP' | 'TECHNICAL_ERROR' | 'HARD_GEOLOGY' | 'NO_SIGNAL' | 'OFF_PLAN' | 'WORKING' | 'PLANNED_IDLE'} MachineOperationalState */

/**
 * Enterprise-scale Equipment Intelligence constants.
 * Source of truth for mock generator scale + business-rule thresholds.
 */

export const DATA_VERSION = '1.0.0'

/** Demo window — 7 consecutive days ending on fixed anchor date */
export const ANCHOR_DATE = '2026-06-24T23:59:59.000Z'
export const HISTORY_DAYS = 7
export const TELEMETRY_INTERVAL_MINUTES = 15

/** Máy cọc nhồi — mục tiêu khai thác 20/24h */
export const MACHINE_UTILIZATION = {
  availableHoursPerDay: 24,
  targetWorkingHoursPerDay: 20,
  maxContinuousIdleMinutes: 30,
  idleCostPerHour: 85,
  efficiencyWeights: {
    productive: 0.45,
    idleControl: 0.20,
    downtimeControl: 0.15,
    planCompliance: 0.10,
    signalQuality: 0.10,
  },
}

/** Trạng thái idle liên tục — vượt ngưỡng 30 phút */
export const CONTINUOUS_IDLE_STATES = ['IDLE', 'WAITING_CONCRETE', 'WAITING_OPERATOR']
export const CONTINUOUS_IDLE_ALERT_TYPE = 'CONTINUOUS_IDLE_OVER_30_MIN'

/** Target record counts (inclusive ranges for generator jitter) */
export const TARGET_COUNTS = {
  projects: 5,
  zonesPerProject: 5,
  machines: 50,
  cameras: 120,
  piles: 500,
  workers: 80,
  telemetry: { min: 3000, max: 5000 },
  cameraEvents: { min: 1000, max: 2000 },
  alerts: { min: 80, max: 120 },
  recommendations: { min: 30, max: 50 },
}

export const PROJECTS = [
  { id: 'prj-ha-long-xanh', code: 'HLX', name: 'Hạ Long Xanh' },
  { id: 'prj-can-gio', code: 'CG', name: 'Cần Giờ' },
  { id: 'prj-vung-ang', code: 'VA', name: 'Điện gió Vũng Áng' },
  { id: 'prj-lang-olympic', code: 'LO', name: 'Làng Olympic' },
  { id: 'prj-ocp1', code: 'OCP1', name: 'OCP1' },
]

/** Five zones per project — naming pattern: {projectCode}-Z{1-5} */
export const ZONE_LABELS = [
  'Khu đóng cọc A',
  'Khu đóng cọc B',
  'Bãi thiết bị',
  'Kho vật tư',
  'Đường vận chuyển',
]

export const SANY_MODELS = [
  { model: 'SR360', type: 'rotary_drill', maxTorque: 360, maxRpm: 28 },
  { model: 'SR285', type: 'rotary_drill', maxTorque: 285, maxRpm: 32 },
  { model: 'SR155', type: 'rotary_drill', maxTorque: 155, maxRpm: 38 },
  { model: 'SY650HB', type: 'hydraulic_hammer', maxTorque: 120, maxRpm: 45 },
  { model: 'SY500HD', type: 'crawler_crane_aux', maxTorque: 95, maxRpm: 52 },
]

export const MACHINE_STATE_WEIGHTS = {
  WORKING: 0.38,
  IDLE: 0.14,
  WAITING_CONCRETE: 0.08,
  WAITING_OPERATOR: 0.07,
  SAFETY_STOP: 0.06,
  TECHNICAL_ERROR: 0.05,
  HARD_GEOLOGY: 0.07,
  NO_SIGNAL: 0.04,
  OFF_PLAN: 0.06,
  PLANNED_IDLE: 0.05,
}

/** @type {Record<string, import('./calculations.js').StateBusinessProfile>} */
export const STATE_BUSINESS_PROFILES = {
  IDLE: {
    idleMinutes: { min: 45, max: 480 },
    rpm: { min: 0, max: 2 },
    torque: { min: 0, max: 15 },
    workerCount: { min: 0, max: 3 },
    hasPlan: true,
    signalStatus: 'ONLINE',
    concreteTruckVisible: null,
    safetyViolation: false,
    dangerZoneIntrusion: false,
    errorCode: null,
    temperature: { min: 38, max: 55 },
    vibration: { min: 0.1, max: 1.2 },
  },
  WAITING_CONCRETE: {
    idleMinutes: { min: 20, max: 180 },
    rpm: { min: 0, max: 5 },
    torque: { min: 0, max: 20 },
    workerCount: { min: 2, max: 6 },
    hasPlan: true,
    signalStatus: 'ONLINE',
    concreteTruckVisible: false,
    safetyViolation: false,
    dangerZoneIntrusion: false,
    errorCode: null,
    temperature: { min: 42, max: 62 },
    vibration: { min: 0.2, max: 2.0 },
  },
  WAITING_OPERATOR: {
    idleMinutes: { min: 15, max: 240 },
    rpm: { min: 0, max: 8 },
    torque: { min: 0, max: 25 },
    workerCount: { min: 0, max: 1 },
    hasPlan: true,
    signalStatus: 'ONLINE',
    concreteTruckVisible: null,
    safetyViolation: false,
    dangerZoneIntrusion: false,
    errorCode: null,
    temperature: { min: 40, max: 58 },
    vibration: { min: 0.1, max: 1.5 },
  },
  SAFETY_STOP: {
    idleMinutes: { min: 5, max: 120 },
    rpm: { min: 0, max: 3 },
    torque: { min: 0, max: 10 },
    workerCount: { min: 1, max: 8 },
    hasPlan: true,
    signalStatus: 'ONLINE',
    concreteTruckVisible: null,
    safetyViolation: true,
    dangerZoneIntrusion: true,
    errorCode: null,
    temperature: { min: 45, max: 68 },
    vibration: { min: 0.5, max: 3.5 },
  },
  TECHNICAL_ERROR: {
    idleMinutes: { min: 10, max: 360 },
    rpm: { min: 0, max: 12 },
    torque: { min: 5, max: 80 },
    workerCount: { min: 0, max: 4 },
    hasPlan: true,
    signalStatus: 'ONLINE',
    concreteTruckVisible: null,
    safetyViolation: false,
    dangerZoneIntrusion: false,
    errorCode: 'AUTO',
    temperature: { min: 78, max: 98 },
    vibration: { min: 6.0, max: 14.0 },
  },
  HARD_GEOLOGY: {
    idleMinutes: { min: 0, max: 30 },
    rpm: { min: 4, max: 12 },
    torque: { min: 75, max: 98 },
    workerCount: { min: 2, max: 6 },
    hasPlan: true,
    signalStatus: 'ONLINE',
    concreteTruckVisible: null,
    safetyViolation: false,
    dangerZoneIntrusion: false,
    errorCode: null,
    temperature: { min: 55, max: 82 },
    vibration: { min: 3.0, max: 8.0 },
  },
  NO_SIGNAL: {
    idleMinutes: { min: 0, max: 60 },
    rpm: { min: 0, max: 0 },
    torque: { min: 0, max: 0 },
    workerCount: { min: 0, max: 0 },
    hasPlan: true,
    signalStatus: 'OFFLINE',
    concreteTruckVisible: null,
    safetyViolation: false,
    dangerZoneIntrusion: false,
    errorCode: null,
    temperature: { min: 0, max: 0 },
    vibration: { min: 0, max: 0 },
  },
  OFF_PLAN: {
    idleMinutes: { min: 0, max: 20 },
    rpm: { min: 10, max: 26 },
    torque: { min: 30, max: 70 },
    workerCount: { min: 1, max: 5 },
    hasPlan: false,
    signalStatus: 'ONLINE',
    concreteTruckVisible: null,
    safetyViolation: false,
    dangerZoneIntrusion: false,
    errorCode: null,
    temperature: { min: 48, max: 75 },
    vibration: { min: 1.5, max: 5.0 },
  },
  WORKING: {
    idleMinutes: { min: 0, max: 8 },
    rpm: { min: 14, max: 28 },
    torque: { min: 35, max: 72 },
    workerCount: { min: 3, max: 8 },
    hasPlan: true,
    signalStatus: 'ONLINE',
    concreteTruckVisible: true,
    safetyViolation: false,
    dangerZoneIntrusion: false,
    errorCode: null,
    temperature: { min: 52, max: 72 },
    vibration: { min: 1.0, max: 4.5 },
  },
  PLANNED_IDLE: {
    idleMinutes: { min: 30, max: 120 },
    rpm: { min: 0, max: 1 },
    torque: { min: 0, max: 8 },
    workerCount: { min: 0, max: 2 },
    hasPlan: true,
    signalStatus: 'ONLINE',
    concreteTruckVisible: null,
    safetyViolation: false,
    dangerZoneIntrusion: false,
    errorCode: null,
    temperature: { min: 35, max: 48 },
    vibration: { min: 0.05, max: 0.8 },
  },
}

export const TECHNICAL_ERROR_CODES = [
  { code: 'E-HYD-021', label: 'Áp suất thủy lực thấp' },
  { code: 'E-ENG-014', label: 'Quá nhiệt động cơ' },
  { code: 'E-VIB-007', label: 'Rung động vượt ngưỡng' },
  { code: 'E-SEN-033', label: 'Cảm biến momen lỗi' },
  { code: 'E-CAN-002', label: 'Mất kết nối CAN bus' },
  { code: 'E-DRILL-019', label: 'Kẹt mũi khoan' },
]

export const CAMERA_AI_EVENT_TYPES = [
  { type: 'concrete_truck_detected', label: 'Phát hiện xe bê tông' },
  { type: 'concrete_truck_missing', label: 'Không thấy xe bê tông' },
  { type: 'worker_in_danger_zone', label: 'Người trong vùng nguy hiểm' },
  { type: 'ppe_violation', label: 'Vi phạm PPE' },
  { type: 'unauthorized_vehicle', label: 'Xe không được phép' },
  { type: 'pile_progress_detected', label: 'Tiến độ đóng cọc' },
  { type: 'equipment_idle_detected', label: 'Máy ngừng bất thường' },
  { type: 'crowd_near_machine', label: 'Tụ tập gần máy' },
]

export const ALERT_SEVERITIES = ['critical', 'high', 'medium', 'low']

export const ALERT_CATEGORIES = [
  'safety',
  'technical',
  'productivity',
  'geology',
  'connectivity',
  'compliance',
  'concrete_supply',
]

export const RECOMMENDATION_TYPES = [
  'relocate_equipment',
  'schedule_concrete',
  'assign_operator',
  'maintenance_window',
  'geology_survey',
  'safety_briefing',
  'optimize_pile_sequence',
  'camera_reposition',
]

export const WORKER_ROLES = [
  'Tổ trưởng đóng cọc',
  'Vận hành máy SANY',
  'Giám sát an toàn',
  'Thợ hàn cọc',
  'Điều phối bê tông',
  'Kỹ thuật hiện trường',
]

export const CONTRACTORS = [
  { id: 'ctr-sany-vn', name: 'SANY Việt Nam', code: 'SNY' },
  { id: 'ctr-pcc1', name: 'PCC1', code: 'PC1' },
  { id: 'ctr-cotec', name: 'Coteccons', code: 'CTC' },
  { id: 'ctr-hoa-binh', name: 'Hòa Bình Corp', code: 'HBC' },
]

export const PILE_STATUSES = ['planned', 'drilling', 'reinforcement', 'concreting', 'completed', 'on_hold']

export const SIGNAL_STATUSES = ['ONLINE', 'OFFLINE', 'DEGRADED']

export const RNG_SEED = 20260624
