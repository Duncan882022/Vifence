import type { SafetyGroupId, SafetyScenario } from '../types/safety.types'
import { getDictionaryCategoryForGroup, GROUP_TO_VIOLATION_TYPE } from './safetyGroups'
import { getDictionaryScenarioName } from './safetyMonitoringDictionary'
import { SCENARIO_EVENT_SUBJECT } from './scenarioEventSubjects'

/** Metadata kịch bản — tên hiển thị lấy từ `SAFETY_MONITORING_DICTIONARY.scenarios` */
type RawScenarioDef = Omit<SafetyScenario, 'eventSubjectType' | 'name'>

const RAW_SCENARIO_DEFS: RawScenarioDef[] = [
  {
    id: 'PPE-001',
    groupId: 'PPE',
    description: 'Phát hiện người lao động không đội mũ bảo hộ trong vùng bắt buộc',
    monitoringModes: ['CONTINUOUS'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }, { type: 'BODY_CAMERA', role: 'VERIFICATION' }],
  },
  {
    id: 'PPE-002',
    groupId: 'PPE',
    description: 'Phát hiện không mặc áo phản quang hoặc áo bảo hộ',
    monitoringModes: ['CONTINUOUS'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }],
  },
  {
    id: 'PPE-003',
    groupId: 'PPE',
    description: 'Phát hiện giày không đạt hoặc không mang giày bảo hộ',
    monitoringModes: ['CONTINUOUS', 'EVENT_BASED'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }],
  },
  {
    id: 'WAH-001',
    groupId: 'WAH',
    description: 'Người lao động làm việc gần mép biên không có dây an toàn',
    monitoringModes: ['CONTINUOUS', 'HYBRID'],
    automationLevel: 'HSE_VERIFICATION',
    defaultSeverity: 'CRITICAL',
    devices: [{ type: 'PTZ_CAMERA', role: 'PRIMARY' }, { type: 'WEARABLE_SENSOR', role: 'SUPPORT' }],
  },
  {
    id: 'WAH-002',
    groupId: 'WAH',
    description: 'Phát hiện ném hoặc thả vật liệu từ cao độ',
    monitoringModes: ['CONTINUOUS', 'EVENT_BASED'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'CRITICAL',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }, { type: 'DRONE', role: 'SUPPORT' }],
  },
  {
    id: 'WAH-003',
    groupId: 'WAH',
    description: 'Có dây nhưng không móc vào điểm neo hoặc không đeo',
    monitoringModes: ['CONTINUOUS', 'HYBRID'],
    automationLevel: 'HSE_VERIFICATION',
    defaultSeverity: 'CRITICAL',
    devices: [{ type: 'PTZ_CAMERA', role: 'PRIMARY' }, { type: 'WEARABLE_SENSOR', role: 'VERIFICATION' }],
  },
  {
    id: 'DZ-001',
    groupId: 'DZ',
    description: 'Vật tư hoặc đất đào vi phạm khoảng cách an toàn mép hố',
    monitoringModes: ['SCHEDULED_PATROL', 'CHANGE_DETECTION'],
    automationLevel: 'AI_ASSISTED',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'DRONE_RTK', role: 'PRIMARY' }, { type: 'MOBILE', role: 'VERIFICATION' }],
  },
  {
    id: 'DZ-002',
    groupId: 'DZ',
    description: 'Khu vực hố sâu thiếu biển báo hoặc cờ cảnh báo',
    monitoringModes: ['SCHEDULED_PATROL', 'CHANGE_DETECTION'],
    automationLevel: 'AI_ASSISTED',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'DRONE_RTK', role: 'PRIMARY' }, { type: 'MOBILE', role: 'VERIFICATION' }],
  },
  {
    id: 'DZ-003',
    groupId: 'DZ',
    description: 'Công nhân đứng hoặc làm việc trong vùng nguy hiểm quanh thiết bị thi công (≤ 1 m)',
    monitoringModes: ['CONTINUOUS', 'EVENT_BASED'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'CRITICAL',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }, { type: 'PTZ_CAMERA', role: 'SUPPORT' }],
  },
  {
    id: 'ATGT-001',
    groupId: 'ATGT',
    description: 'Phương tiện vào vùng yêu cầu nhưng không có người điều hướng',
    monitoringModes: ['CONTINUOUS', 'EVENT_BASED'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }, { type: 'PTZ_CAMERA', role: 'SUPPORT' }],
  },
  {
    id: 'ATGT-002',
    groupId: 'ATGT',
    description: 'Radar hoặc AI phát hiện vượt tốc độ nội bộ',
    monitoringModes: ['CONTINUOUS'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'RADAR', role: 'PRIMARY' }, { type: 'GPS_IVI', role: 'SUPPORT' }],
  },
  {
    id: 'ATGT-003',
    groupId: 'ATGT',
    description: 'Khu vực giao thông nội bộ thiếu đèn đỏ, biển báo hoặc cảnh báo',
    monitoringModes: ['SCHEDULED_PATROL', 'CHANGE_DETECTION'],
    automationLevel: 'AI_ASSISTED',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }, { type: 'DRONE', role: 'SUPPORT' }],
  },
  {
    id: 'ATGT-004',
    groupId: 'ATGT',
    description: 'Hiện trường chưa phân làn, phân luồng theo phương án được phê duyệt',
    monitoringModes: ['SCHEDULED_PATROL', 'CHANGE_DETECTION'],
    automationLevel: 'AI_ASSISTED',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'DRONE', role: 'PRIMARY' }, { type: 'MOBILE', role: 'VERIFICATION' }],
  },
  {
    id: 'BPTC-001',
    groupId: 'BPTC',
    description: 'Lưới bao che chưa đủ hoặc hở — lỗi hiện trạng công trường',
    monitoringModes: ['SCHEDULED_PATROL', 'CHANGE_DETECTION'],
    automationLevel: 'AI_ASSISTED',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'DRONE', role: 'PRIMARY' }, { type: 'FIXED_CAMERA', role: 'SUPPORT' }],
  },
  {
    id: 'BPTC-002',
    groupId: 'BPTC',
    description: 'Vật liệu được cẩu thẳng lên cao không qua sàn tiếp liệu',
    monitoringModes: ['CONTINUOUS', 'EVENT_BASED'],
    automationLevel: 'AI_ASSISTED',
    defaultSeverity: 'CRITICAL',
    devices: [{ type: 'PTZ_CAMERA', role: 'PRIMARY' }],
  },
  {
    id: 'BPTC-003',
    groupId: 'BPTC',
    description: 'Sàn tiếp liệu từ cao độ 6 m trở lên không đúng biện pháp treo',
    monitoringModes: ['PRE_WORK_INSPECTION', 'SCHEDULED_PATROL'],
    automationLevel: 'HSE_VERIFICATION',
    defaultSeverity: 'CRITICAL',
    devices: [{ type: 'DRONE', role: 'PRIMARY' }, { type: 'MOBILE', role: 'VERIFICATION' }],
  },
  {
    id: 'BPTC-004',
    groupId: 'BPTC',
    description: 'Công việc hàn cắt thiếu màn che tia lửa',
    monitoringModes: ['CONTINUOUS', 'EVENT_BASED'],
    automationLevel: 'AI_ASSISTED',
    defaultSeverity: 'CRITICAL',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }, { type: 'BODY_CAMERA', role: 'VERIFICATION' }],
  },
  {
    id: 'BPTC-005',
    groupId: 'BPTC',
    description: 'Thiếu lưới chống rơi tại khu vực thi công thép/mái',
    monitoringModes: ['PRE_WORK_INSPECTION', 'SCHEDULED_PATROL'],
    automationLevel: 'AI_ASSISTED',
    defaultSeverity: 'CRITICAL',
    devices: [{ type: 'DRONE', role: 'PRIMARY' }, { type: 'FIXED_CAMERA', role: 'SUPPORT' }],
  },
  {
    id: 'BPTC-006',
    groupId: 'BPTC',
    description: 'Thiếu lan can, dây cứu sinh hoặc sàn thao tác — lỗi hiện trạng',
    monitoringModes: ['PRE_WORK_INSPECTION', 'SCHEDULED_PATROL'],
    automationLevel: 'HSE_VERIFICATION',
    defaultSeverity: 'CRITICAL',
    devices: [{ type: 'PTZ_CAMERA', role: 'PRIMARY' }, { type: 'MOBILE', role: 'VERIFICATION' }],
  },
  {
    id: 'BPTC-007',
    groupId: 'BPTC',
    description: 'Diện tích bùn đất che phủ mặt đường vượt ngưỡng cho phép trong ROI',
    monitoringModes: ['CONTINUOUS', 'CHANGE_DETECTION'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'WARNING',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }],
  },
  {
    id: 'BPTC-008',
    groupId: 'BPTC',
    description: 'Nước đọng trên lòng đường nội bộ ảnh hưởng giao thông',
    monitoringModes: ['CONTINUOUS', 'CHANGE_DETECTION'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'WARNING',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }],
  },
  {
    id: 'BPTC-009',
    groupId: 'BPTC',
    description: 'Vật tư hoặc thiết bị chiếm dụng ROI lòng đường gây cản trở lưu thông',
    monitoringModes: ['CONTINUOUS', 'EVENT_BASED'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }],
  },
  {
    id: 'PCCC-001',
    groupId: 'PCCC',
    description: 'Phát hiện hút thuốc ngoài khu vực cho phép',
    monitoringModes: ['CONTINUOUS', 'EVENT_BASED'],
    automationLevel: 'AUTOMATIC',
    defaultSeverity: 'VIOLATION',
    devices: [{ type: 'FIXED_CAMERA', role: 'PRIMARY' }, { type: 'BODY_CAMERA', role: 'SUPPORT' }],
  },
  {
    id: 'PCCC-002',
    groupId: 'PCCC',
    description: 'Dấu hiệu cháy nổ',
    monitoringModes: ['CONTINUOUS', 'EVENT_BASED'],
    automationLevel: 'AI_ASSISTED',
    defaultSeverity: 'CRITICAL',
    devices: [{ type: 'MOBILE', role: 'PRIMARY' }, { type: 'FIXED_CAMERA', role: 'SUPPORT' }],
  },
]

function buildScenariosFromDictionary(defs: RawScenarioDef[]): SafetyScenario[] {
  const indexByGroup = new Map<SafetyGroupId, number>()

  return defs.map(def => {
    const index = indexByGroup.get(def.groupId) ?? 0
    indexByGroup.set(def.groupId, index + 1)

    const violationType = GROUP_TO_VIOLATION_TYPE[def.groupId]
    const dictName = getDictionaryScenarioName(violationType, index)

    if (import.meta.env.DEV && !dictName) {
      console.warn(`[safetyScenarios] Thiếu tên dictionary cho ${def.id} (${def.groupId}[${index}])`)
    }

    return {
      ...def,
      name: dictName ?? def.id,
      eventSubjectType: SCENARIO_EVENT_SUBJECT[def.id] ?? 'PERSON',
      description: def.description,
    }
  })
}

if (import.meta.env.DEV) {
  const GROUP_IDS: SafetyGroupId[] = ['PPE', 'WAH', 'DZ', 'ATGT', 'BPTC', 'PCCC']
  for (const groupId of GROUP_IDS) {
    const cat = getDictionaryCategoryForGroup(groupId)
    const count = RAW_SCENARIO_DEFS.filter(d => d.groupId === groupId).length
    if (cat && count !== cat.scenarios.length) {
      console.error(
        `[safetyScenarios] ${groupId}: ${count} kịch bản code ≠ ${cat.scenarios.length} trong dictionary`,
      )
    }
  }
}

export const SAFETY_SCENARIOS: SafetyScenario[] = buildScenariosFromDictionary(RAW_SCENARIO_DEFS)

export const SAFETY_SCENARIO_MAP = new Map(SAFETY_SCENARIOS.map(s => [s.id, s]))

export function getScenarioName(scenarioId: string): string {
  return SAFETY_SCENARIO_MAP.get(scenarioId)?.name ?? scenarioId
}

export function getScenariosForGroup(groupId: string) {
  return SAFETY_SCENARIOS.filter(s => s.groupId === groupId)
}
