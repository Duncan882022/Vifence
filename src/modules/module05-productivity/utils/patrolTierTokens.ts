/**
 * Token ba tầng nhận diện Module 05 — nguồn duy nhất cho cả ROI trên camera lẫn
 * panel sự kiện.
 *
 * Người vận hành nhìn khung trên video rồi nhìn sang danh sách sự kiện; hai nơi
 * mà khác màu cho cùng một tầng thì họ phải tự dịch. Trước đây ROI vẽ mọi người
 * bằng một màu xanh duy nhất nên chuyển tầng không hề thấy trên video.
 */

export type PatrolTier = 'object' | 'person' | 'identity'

export const PATROL_TIER_RANK: Record<PatrolTier, number> = {
  object: 0,
  person: 1,
  identity: 2,
}

export interface PatrolTierToken {
  label: string
  /** Màu chữ nhãn — dùng cho icon và text trong danh sách. */
  color: string
  /** Nền + viền badge trong danh sách. */
  badge: string
  borderAccent: string
  tooltip: string
  /** Viền khung ROI trên video. */
  roiBorder: string
  /** Nền nhãn ROI trên video. */
  roiLabelBg: string
  roiLabelText: string
}

export const PATROL_TIER_TOKENS: Record<PatrolTier, PatrolTierToken> = {
  object: {
    label: 'Đối tượng',
    color: 'text-slate-400',
    badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    borderAccent: 'border-l-slate-400',
    tooltip: 'Chưa đủ tiêu chí nhận diện — bán thân / che mặt / khẩu trang',
    roiBorder: 'border border-dashed border-slate-300/90',
    roiLabelBg: 'bg-slate-900/95',
    roiLabelText: 'text-slate-100',
  },
  person: {
    label: 'Người',
    color: 'text-sky-400',
    badge: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    borderAccent: 'border-l-sky-400',
    tooltip: 'Đã phân biệt A≠B — chưa có trong gallery',
    roiBorder: 'border-2 border-solid border-sky-400/95',
    roiLabelBg: 'bg-sky-900/95',
    roiLabelText: 'text-sky-50',
  },
  identity: {
    label: 'Định danh',
    color: 'text-violet-400',
    badge: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    borderAccent: 'border-l-violet-400',
    tooltip: 'Đã xác minh danh tính (gallery / gán tên)',
    roiBorder: 'border-2 border-solid border-violet-400/95',
    roiLabelBg: 'bg-violet-900/95',
    roiLabelText: 'text-violet-50',
  },
}

export function patrolTierToken(tier: PatrolTier | undefined): PatrolTierToken {
  return PATROL_TIER_TOKENS[tier ?? 'object']
}

/** Tầng cao hơn thắng — nhãn không bao giờ tụt xuống trong một lượt xuất hiện. */
export function higherPatrolTier(a: PatrolTier, b: PatrolTier): PatrolTier {
  return PATROL_TIER_RANK[a] >= PATROL_TIER_RANK[b] ? a : b
}
