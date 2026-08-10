import type { SafetyGroupId } from '../types/safety.types'

/**
 * Kịch bản ATLĐ đã có pipeline AI + log sự kiện (đồng bộ cameraAiModelCatalog + backend engines).
 * FE chỉ hiển thị / mock / profile các ID trong danh sách này.
 */
export const IMPLEMENTED_SAFETY_SCENARIO_IDS = [
  'PPE-001',
  'PPE-002',
  'PPE-003',
  'WAH-001',
  'DZ-003',
  'ATGT-002',
  'ATGT-004',
  'BPTC-001',
  'BPTC-007',
  'BPTC-008',
  'BPTC-009',
  'PCCC-001',
  'PCCC-002',
] as const

export type ImplementedSafetyScenarioId = (typeof IMPLEMENTED_SAFETY_SCENARIO_IDS)[number]

export const IMPLEMENTED_SAFETY_SCENARIO_SET = new Set<string>(IMPLEMENTED_SAFETY_SCENARIO_IDS)

/** 6 nhóm — mỗi nhóm có ≥1 kịch bản triển khai */
export const IMPLEMENTED_SAFETY_GROUP_IDS: SafetyGroupId[] = [
  'PPE',
  'WAH',
  'DZ',
  'ATGT',
  'BPTC',
  'PCCC',
]

export function isImplementedSafetyScenario(scenarioId: string): scenarioId is ImplementedSafetyScenarioId {
  return IMPLEMENTED_SAFETY_SCENARIO_SET.has(scenarioId)
}

/** Camera demo gắn với từng nhóm (tham chiếu nhanh UI) */
export const IMPLEMENTED_GROUP_CAMERAS: Partial<Record<SafetyGroupId, string>> = {
  PPE: 'A-04',
  WAH: 'A-04',
  DZ: 'A-04',
  PCCC: 'A-04',
  ATGT: 'A-03',
  BPTC: 'A-03',
}
