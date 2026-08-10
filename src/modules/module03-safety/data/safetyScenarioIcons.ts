import type { LucideIcon } from 'lucide-react'
import {
  Anchor, Cigarette, CircleSlash, Construction, Droplets, Flame, Footprints,
  Gauge, Grid3x3, Package, Pickaxe, Shirt, Waypoints,
} from 'lucide-react'
import { SAFETY_SCENARIOS } from './safetyScenarios'

/** 13 icon — mỗi kịch bản triển khai một icon */
export const SCENARIO_ICONS: Record<string, LucideIcon> = {
  'PPE-001': CircleSlash,
  'PPE-002': Shirt,
  'PPE-003': Footprints,
  'WAH-001': Anchor,
  'DZ-003': Construction,
  'ATGT-002': Gauge,
  'ATGT-004': Waypoints,
  'BPTC-001': Grid3x3,
  'BPTC-007': Pickaxe,
  'BPTC-008': Droplets,
  'BPTC-009': Package,
  'PCCC-001': Cigarette,
  'PCCC-002': Flame,
}

for (const scenario of SAFETY_SCENARIOS) {
  if (!SCENARIO_ICONS[scenario.id]) {
    console.warn(`[safetyScenarioIcons] Thiếu icon cho ${scenario.id}`)
  }
}

export function getScenarioIcon(scenarioId: string): LucideIcon | undefined {
  return SCENARIO_ICONS[scenarioId]
}
