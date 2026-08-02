import type { LucideIcon } from 'lucide-react'
import {
  Anchor, ArrowDownFromLine, Cable, Cigarette, CircleSlash, Fence, Flag, Flame, Footprints,
  Forklift, Gauge, Grid3x3, Link2Off, OctagonX, PanelTop, PersonStanding, Scissors, Shirt,
  Shovel, Waypoints,
} from 'lucide-react'
import { SAFETY_SCENARIOS } from './safetyScenarios'

/** 19 icon — mỗi kịch bản một icon, không trùng component */
export const SCENARIO_ICONS: Record<string, LucideIcon> = {
  'PPE-001': CircleSlash,       // Không đội mũ (≠ HardHat header nhóm)
  'PPE-002': Shirt,             // Không mặc áo phản quang
  'PPE-003': Footprints,        // Không mang giày BHLD
  'WAH-001': Anchor,            // Không dùng dây tại mép biên
  'WAH-002': ArrowDownFromLine, // Quăng/ném từ trên cao
  'WAH-003': Link2Off,          // Có dây nhưng không móc neo
  'DZ-001': Shovel,             // Đất đào sát mép hố
  'DZ-002': Flag,               // Thiếu cờ/biển cảnh báo
  'ATGT-001': PersonStanding,   // Thiếu người điều hướng
  'ATGT-002': Gauge,            // Vượt tốc độ
  'ATGT-003': OctagonX,         // Thiếu đèn đỏ / biển dừng
  'ATGT-004': Waypoints,        // Không phân làn/luồng
  'BPTC-001': Grid3x3,          // Lưới/giáo bao che
  'BPTC-002': Forklift,         // Cẩu/nâng thẳng lên cao
  'BPTC-003': PanelTop,         // Sàn tiếp liệu
  'BPTC-004': Scissors,         // Hàn/cắt thiếu che chắn
  'BPTC-005': Fence,            // Thiếu lưới chống rơi
  'BPTC-006': Cable,            // Thiếu dây cứu sinh/lan can
  'PCCC-001': Cigarette,        // Hút thuốc sai nơi quy định
  'PCCC-002': Flame,            // Dấu hiệu cháy nổ
}

const iconRefs = Object.values(SCENARIO_ICONS)
const uniqueRefs = new Set(iconRefs)
if (uniqueRefs.size !== iconRefs.length) {
  console.warn('[safetyScenarioIcons] Trùng icon component giữa các kịch bản')
}

for (const scenario of SAFETY_SCENARIOS) {
  if (!SCENARIO_ICONS[scenario.id]) {
    console.warn(`[safetyScenarioIcons] Thiếu icon cho ${scenario.id}`)
  }
}

export function getScenarioIcon(scenarioId: string): LucideIcon | undefined {
  return SCENARIO_ICONS[scenarioId]
}
