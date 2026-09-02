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
