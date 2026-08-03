import type { HousekeepingAiGroup, HousekeepingAiGroupId } from '../types/housekeepingAi.types'
import {
  formatHousekeepingGroupTooltip,
  HOUSEKEEPING_MONITORING_DICTIONARY,
} from './housekeepingMonitoringDictionary'

const GROUP_ORDER: HousekeepingAiGroupId[] = ['LOG', 'HK']

const GROUP_TO_DICT: Record<HousekeepingAiGroupId, string> = {
  LOG: 'logistics-road',
  HK: 'housekeeping-road',
}

const GROUP_ICON: Record<HousekeepingAiGroupId, string> = {
  LOG: 'Truck',
  HK: 'Sparkles',
}

function displayName(title: string, shortTitle: string): string {
  const paren = title.match(/\(([^)]+)\)/)
  return paren?.[1]?.trim() ?? shortTitle
}

export const HOUSEKEEPING_AI_GROUPS: HousekeepingAiGroup[] = GROUP_ORDER.map(id => {
  const dictId = GROUP_TO_DICT[id]
  const cat = HOUSEKEEPING_MONITORING_DICTIONARY.find(c => c.id === dictId)!
  return {
    id,
    name: displayName(cat.title, cat.shortTitle),
    description: cat.goal,
    icon: GROUP_ICON[id],
  }
})

export const HOUSEKEEPING_GROUP_MAP = new Map(HOUSEKEEPING_AI_GROUPS.map(g => [g.id, g]))

export function getHousekeepingGroupTooltip(groupId: HousekeepingAiGroupId): string {
  return formatHousekeepingGroupTooltip(GROUP_TO_DICT[groupId])
}
