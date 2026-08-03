import type { HousekeepingAiScenario } from '../types/housekeepingAi.types'

export const HOUSEKEEPING_AI_SCENARIOS: HousekeepingAiScenario[] = [
  {
    id: 'LOG-01',
    groupId: 'LOG',
    name: 'Vật tư chiếm dụng lòng đường',
    description: 'Vật tư hoặc thiết bị nằm trong ROI lòng đường, không di chuyển > 30 phút, không thuộc vùng tập kết.',
    eventSubjectType: 'CONSTRUCTION_ACTIVITY',
    defaultSeverity: 'VIOLATION',
    dwellMinutes: 30,
    requiresRoadRoi: true,
  },
  {
    id: 'HK-01',
    groupId: 'HK',
    name: 'Đường nội bộ bùn bẩn',
    description: 'Diện tích bùn đất che phủ mặt đường vượt ngưỡng cho phép.',
    eventSubjectType: 'SITE_CONDITION',
    defaultSeverity: 'WARNING',
    dwellMinutes: 0,
    requiresRoadRoi: true,
  },
  {
    id: 'HK-02',
    groupId: 'HK',
    name: 'Nước đọng trên đường',
    description: 'Nước đọng trên lòng đường ảnh hưởng giao thông nội bộ.',
    eventSubjectType: 'SITE_CONDITION',
    defaultSeverity: 'WARNING',
    dwellMinutes: 0,
    requiresRoadRoi: true,
  },
  {
    id: 'HK-03',
    groupId: 'HK',
    name: 'Vật liệu rơi vãi trên đường',
    description: 'Vật liệu xây dựng rơi vãi trong ROI lòng đường gây cản trở lưu thông.',
    eventSubjectType: 'CONSTRUCTION_ACTIVITY',
    defaultSeverity: 'VIOLATION',
    dwellMinutes: 0,
    requiresRoadRoi: true,
  },
  {
    id: 'HK-04',
    groupId: 'HK',
    name: 'Rác tồn lưu trên đường',
    description: 'Rác thải trong ROI lòng đường tồn tại > 30 phút chưa thu gom.',
    eventSubjectType: 'SITE_CONDITION',
    defaultSeverity: 'VIOLATION',
    dwellMinutes: 30,
    requiresRoadRoi: true,
  },
]

export const HOUSEKEEPING_SCENARIO_MAP = new Map(
  HOUSEKEEPING_AI_SCENARIOS.map(s => [s.id, s]),
)

export function getHousekeepingScenarioName(scenarioId: string): string {
  return HOUSEKEEPING_SCENARIO_MAP.get(scenarioId)?.name ?? scenarioId
}

export function getScenariosForHousekeepingGroup(groupId: string): HousekeepingAiScenario[] {
  return HOUSEKEEPING_AI_SCENARIOS.filter(s => s.groupId === groupId)
}
