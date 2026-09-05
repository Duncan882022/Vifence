import type { PatrolAppearanceSegment } from '../services/patrolDayEvents.service'
import type { PatrolPersonStage } from './patrolWorkforceEventLabels'
import { PATROL_PERSON_STAGE_META } from './patrolWorkforceEventLabels'

const TIER_PAYLOAD_MAP: Record<string, PatrolPersonStage> = {
  object: 'object',
  person: 'person',
  identity: 'profile',
}

/** Tier tại thời điểm gặm — từ appearance payload, không suy từ card hiện tại. */
export function resolveAppearanceObservationStage(
  segment: PatrolAppearanceSegment,
): PatrolPersonStage | null {
  const snap = segment.eventPayload?.tier_snapshot
  if (snap && typeof snap === 'object' && snap !== null) {
    const tier = String((snap as Record<string, unknown>).tier ?? '').trim()
    if (tier in TIER_PAYLOAD_MAP) return TIER_PAYLOAD_MAP[tier]
  }
  const raw = segment.eventPayload?.tier_at_observation
  if (typeof raw !== 'string' || !raw.trim()) return null
  return TIER_PAYLOAD_MAP[raw.trim().toLowerCase()] ?? null
}

export function appearanceObservationStageLabel(
  segment: PatrolAppearanceSegment,
): string | null {
  const stage = resolveAppearanceObservationStage(segment)
  if (!stage) return null
  return PATROL_PERSON_STAGE_META[stage].label
}

/** Badge màu tier cho dòng lịch sử — đồng bộ header popup. */
export function appearanceObservationStageMeta(
  segment: PatrolAppearanceSegment,
): (typeof PATROL_PERSON_STAGE_META)[PatrolPersonStage] | null {
  const stage = resolveAppearanceObservationStage(segment)
  if (!stage) return null
  return PATROL_PERSON_STAGE_META[stage]
}
