/**
 * Thứ tự quét ROI — 3 tầng ưu tiên (đồng bộ mọi nhóm model):
 * 1. SUBJECT — người, phương tiện, máy móc
 * 2. CONDITION — điều kiện làm việc (PPE, WAH, làn ATGT, …)
 * 3. VIOLATION — vi phạm (phase giữ cuối)
 *
 * Các overlay nhóm model (PPE, WAH, DZ, ATGT, …) có thể hiển thị đồng thời;
 * chu kỳ quét dùng chung clock qua OverlayCycleProvider.
 */

export const OVERLAY_CYCLE_DEFAULTS = {
  stepMs: 260,
  holdMs: 900,
} as const

/** Rank ngưỡng — rank < CONDITION = subject, < VIOLATION = condition. */
export const OVERLAY_SCAN_TIER = {
  SUBJECT: 0,
  CONDITION: 100,
  VIOLATION: 200,
} as const

export type OverlayScanTierGroup = 'subject' | 'condition'

const TIER_ORDER: OverlayScanTierGroup[] = ['subject', 'condition']

export function overlayScanTierGroup(rank: number): OverlayScanTierGroup {
  return rank < OVERLAY_SCAN_TIER.CONDITION ? 'subject' : 'condition'
}

export function overlayScanTierIndex(group: OverlayScanTierGroup): number {
  return TIER_ORDER.indexOf(group)
}

export { TIER_ORDER as OVERLAY_SCAN_TIER_ORDER }

function subjectRank(offset: number): number {
  return OVERLAY_SCAN_TIER.SUBJECT + offset
}

function conditionRank(offset: number): number {
  return OVERLAY_SCAN_TIER.CONDITION + offset
}

/** PPE: người → mũ → áo → giày trái → giày phải. */
export function ppeScanRank(behavior: string, bbox?: number[]): number {
  const footOrder = footScanOrder(bbox)
  switch (behavior) {
    case 'person': return subjectRank(0)
    case 'hard_hat': return conditionRank(0)
    case 'safety_vest': return conditionRank(10)
    case 'safety_shoes': return conditionRank(20) + footOrder
    case 'no_shoes': return conditionRank(20) + footOrder
    default: return conditionRank(30)
  }
}

/** Trái (bbox nhỏ hơn) quét trước phải. */
function footScanOrder(bbox?: number[]): number {
  if (!bbox || bbox.length < 4) return 0
  return Math.min(4, Math.floor(bbox[0] / 200))
}

export function ppeViolationRank(behavior: string, bbox?: number[]): number {
  const footOrder = footScanOrder(bbox)
  switch (behavior) {
    case 'no_helmet': return 0
    case 'no_vest': return 1
    case 'no_shoes': return 2 + footOrder
    default: return 9
  }
}

/** WAH: người → dây an toàn. */
export function wahScanRank(behavior: string): number {
  switch (behavior) {
    case 'person': return subjectRank(0)
    case 'safety_harness': return conditionRank(0)
    default: return conditionRank(10)
  }
}

/** DZ / Crane: người → máy (vi phạm khoảng cách ở phase riêng). */
export function craneScanRank(behavior: string, machineKind?: string | null): number {
  if (behavior === 'person') return subjectRank(0)
  if (behavior === 'unknown') return subjectRank(5)
  if (behavior === 'crane') {
    if (machineKind === 'tower_crane') return subjectRank(10)
    if (machineKind === 'sany_drill') return subjectRank(11)
    if (machineKind === 'crane_green') return subjectRank(12)
    return subjectRank(13)
  }
  return conditionRank(0)
}

/** ATGT: xe → làn cứng → làn mềm. */
export function atgtScanRank(behavior: string): number {
  switch (behavior) {
    case 'vehicle': return subjectRank(0)
    case 'hard_median': return conditionRank(0)
    case 'soft_median': return conditionRank(5)
    default: return conditionRank(10)
  }
}

export function atgtViolationRank(behavior: string): number {
  switch (behavior) {
    case 'no_soft_median': return 0
    case 'speeding': return 1
    default: return 9
  }
}

/** PCCC: người (subject) — hút thuốc/lửa ở phase vi phạm. */
export function pcccScanRank(behavior: string): number {
  if (behavior === 'person') return subjectRank(0)
  return conditionRank(20)
}

export function pcccViolationRank(behavior: string): number {
  switch (behavior) {
    case 'smoking': return 0
    case 'fire': return 1
    default: return 9
  }
}

export function defaultScanRank(behavior: string): number {
  if (behavior === 'person') return subjectRank(0)
  return conditionRank(0)
}
