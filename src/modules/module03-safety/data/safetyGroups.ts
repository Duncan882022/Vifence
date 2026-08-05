import type { SafetyGroup, SafetyGroupId } from '../types/safety.types'
import type { ViolationType } from '@/types/safety'
import { SAFETY_MONITORING_DICTIONARY, formatMonitoringGroupTooltip } from './safetyMonitoringDictionary'

/** Map mã nhóm dashboard ↔ ViolationType trong SAFETY MONITORING DICTIONARY */
export const GROUP_TO_VIOLATION_TYPE: Record<SafetyGroupId, ViolationType> = {
  PPE: 'ppe',
  WAH: 'work-at-height',
  DZ: 'danger-zone',
  ATGT: 'traffic-safety',
  BPTC: 'method-statement',
  PCCC: 'fire-hot-work',
}

const GROUP_ORDER: SafetyGroupId[] = ['PPE', 'WAH', 'DZ', 'ATGT', 'BPTC', 'PCCC']

const GROUP_ICON: Record<SafetyGroupId, string> = {
  PPE: 'HardHat',
  WAH: 'ArrowUpFromLine',
  DZ: 'AlertTriangle',
  ATGT: 'Car',
  BPTC: 'Construction',
  PCCC: 'Flame',
}

function displayNameFromDictionary(title: string, shortTitle: string): string {
  const paren = title.match(/\(([^)]+)\)/)
  return paren?.[1]?.trim() ?? shortTitle
}

/** 6 nhóm ATLĐ — dictionary + kịch bản khớp pipeline AI đang chạy (12 kịch bản) */
export const SAFETY_GROUPS: SafetyGroup[] = GROUP_ORDER.map(id => {
  const violationType = GROUP_TO_VIOLATION_TYPE[id]
  const cat = SAFETY_MONITORING_DICTIONARY.find(c => c.id === violationType)!
  return {
    id,
    name: displayNameFromDictionary(cat.title, cat.shortTitle),
    description: cat.goal,
    icon: GROUP_ICON[id],
  }
})

export const SAFETY_GROUP_MAP = new Map(SAFETY_GROUPS.map(g => [g.id, g]))

export function getDictionaryCategoryForGroup(groupId: SafetyGroupId) {
  return SAFETY_MONITORING_DICTIONARY.find(c => c.id === GROUP_TO_VIOLATION_TYPE[groupId])
}

/** Tooltip nhóm — tiêu đề + mục tiêu giám sát từ dictionary */
export function getGroupDictionaryTooltip(groupId: SafetyGroupId): string {
  const violationType = GROUP_TO_VIOLATION_TYPE[groupId]
  return formatMonitoringGroupTooltip(violationType)
}
