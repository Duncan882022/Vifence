/**
 * Token ba tầng nhận diện Module 05 — nguồn duy nhất cho ROI, thẻ sự kiện, heatmap.
 * Palette nghiệp vụ: xám (Đối tượng) / cam (Người) / xanh lá (Định danh) — viền liền.
 */

export type PatrolTier = 'object' | 'person' | 'identity'

export const PATROL_TIER_RANK: Record<PatrolTier, number> = {
  object: 0,
  person: 1,
  identity: 2,
}

export interface PatrolTierToken {
  label: string
  color: string
  badge: string
  borderAccent: string
  tooltip: string
  roiBorder: string
  roiLabelBg: string
  roiLabelText: string
  heatmapDotHex: string
}

export const PATROL_TIER_TOKENS: Record<PatrolTier, PatrolTierToken> = {
  object: {
    label: 'Đối tượng',
    color: 'text-stone-400',
    badge: 'bg-stone-500/10 text-stone-400 border-stone-500/30',
    borderAccent: 'border-l-stone-400',
    tooltip: 'Chưa đủ tiêu chí nhận diện — bán thân / che mặt / khẩu trang',
    roiBorder: 'border-2 border-solid border-stone-400/95',
    roiLabelBg: 'bg-stone-950/95',
    roiLabelText: 'text-stone-300',
    heatmapDotHex: '#a8a29e',
  },
  person: {
    label: 'Người',
    color: 'text-orange-400',
    badge: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    borderAccent: 'border-l-orange-400',
    tooltip: 'Đã phân biệt A≠B — chưa có trong gallery',
    roiBorder: 'border-2 border-solid border-orange-400/95',
    roiLabelBg: 'bg-orange-950/95',
    roiLabelText: 'text-orange-50',
    heatmapDotHex: '#fb923c',
  },
  identity: {
    label: 'Định danh',
    color: 'text-green-400',
    badge: 'bg-green-500/10 text-green-400 border-green-500/30',
    borderAccent: 'border-l-green-400',
    tooltip: 'Đã xác minh danh tính (gallery / gán tên)',
    roiBorder: 'border-2 border-solid border-green-400/95',
    roiLabelBg: 'bg-green-950/95',
    roiLabelText: 'text-green-50',
    heatmapDotHex: '#4ade80',
  },
}

export function patrolTierToken(tier: PatrolTier | undefined): PatrolTierToken {
  return PATROL_TIER_TOKENS[tier ?? 'object']
}

export function higherPatrolTier(a: PatrolTier, b: PatrolTier): PatrolTier {
  return PATROL_TIER_RANK[a] >= PATROL_TIER_RANK[b] ? a : b
}
