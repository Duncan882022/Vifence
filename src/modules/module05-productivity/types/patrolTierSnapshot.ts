/** Contract tầng thống nhất BE → FE (ROI, thẻ sự kiện, lịch sử). */

export type PatrolTierLevel = 'object' | 'person' | 'identity'

export interface PatrolTierSnapshot {
  tier: PatrolTierLevel
  tier_rank: 0 | 1 | 2
  tier_since: number
  subject_id: string
  worker_id?: string | null
  worker_name?: string | null
  face_eligible: boolean
  confidence: number
  snapshot_score: number
  promoted_from?: string[]
  promoted_at?: number | null
  bbox?: number[]
  track_id?: string
  camera_id?: string
  tier_source?: string
  /** Alias deprecated — tier frozen lúc ghi appearance */
  tier_at_observation?: PatrolTierLevel
  tier_label_vi?: string
}

export const PATROL_TIER_LEVEL_RANK: Record<PatrolTierLevel, number> = {
  object: 0,
  person: 1,
  identity: 2,
}

export function higherPatrolTierLevel(a: PatrolTierLevel, b: PatrolTierLevel): PatrolTierLevel {
  return PATROL_TIER_LEVEL_RANK[a] >= PATROL_TIER_LEVEL_RANK[b] ? a : b
}
