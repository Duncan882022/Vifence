import type { PatrolEvent } from '../data/patrolTypes'
import { countPatrolDetectedByCamera } from './patrolPatrolCounts'

/** Per-camera detect counts — memo-friendly input. */
export function buildHelmetDetectCountsById(
  events: PatrolEvent[],
  cameraIds: readonly string[],
): Record<string, { person: number; identity: number; total: number }> {
  const out: Record<string, { person: number; identity: number; total: number }> = {}
  for (const id of cameraIds) {
    out[id] = countPatrolDetectedByCamera(events, id)
  }
  return out
}
