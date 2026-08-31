/**
 * Eligibility helpers cho heatmap dots — không dùng để KPI headcount.
 * KPI Nhân sự / Lượt gặp: `day_stats` qua derivePatrolDisplayStats.
 */
import type { PatrolEvent } from '../data/patrolTypes'
import {
  isPatrolIdenId,
  isPatrolPersId,
  isPatrolTrackWorkerId,
  resolvePatrolPersonStage,
} from './patrolWorkforceEventLabels'
import { isPatrolGalleryWorkerId } from './patrolIdentityEntity'
import { isPatrolManuallyIdentified } from '../services/patrolManualIdentity.service'

export function isPatrolHeatmapEligibleId(rawId?: string | null): boolean {
  const id = rawId?.trim() ?? ''
  if (!id) return false
  if (isPatrolPersId(id)) return true
  if (isPatrolIdenId(id)) return true
  if (isPatrolTrackWorkerId(id)) return true
  if (isPatrolGalleryWorkerId(id)) return true
  if (isPatrolManuallyIdentified(id)) return true
  return false
}

export function isPatrolHeatmapEligibleEvent(event: PatrolEvent): boolean {
  if (event.type !== 'PERSON_DETECTED' && event.type !== 'IDENTITY_VERIFIED') return false
  const stage = resolvePatrolPersonStage(event)
  return stage === 'person' || stage === 'profile'
}
