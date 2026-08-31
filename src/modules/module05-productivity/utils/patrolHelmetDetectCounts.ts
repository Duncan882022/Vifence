import type { PatrolDayPresence } from '../services/patrolDayEvents.service'

export interface PatrolDeviceDetectCounts {
  person: number
  identity: number
  total: number
}

function presenceTouchesCamera(presence: PatrolDayPresence, cameraId: string): boolean {
  if (presence.cameraId === cameraId) return true
  return presence.sourceCameras.includes(cameraId)
}

/**
 * Đếm entity theo camera từ SQLite presences — không dedupe FE trên events.
 * Tooltip mũ / flycam: unique subjectId per tier per device.
 */
export function buildHelmetDetectCountsFromPresences(
  presences: PatrolDayPresence[],
  cameraIds: readonly string[],
): Record<string, PatrolDeviceDetectCounts> {
  const out: Record<string, PatrolDeviceDetectCounts> = {}

  for (const cameraId of cameraIds) {
    const personIds = new Set<string>()
    const identityIds = new Set<string>()

    for (const row of presences) {
      if (!presenceTouchesCamera(row, cameraId)) continue
      if (row.tier === 'identity') {
        identityIds.add(row.subjectId)
      } else if (row.tier === 'person') {
        personIds.add(row.subjectId)
      }
    }

    const person = personIds.size
    const identity = identityIds.size
    out[cameraId] = { person, identity, total: person + identity }
  }

  return out
}

/** @deprecated Dùng {@link buildHelmetDetectCountsFromPresences} — events dedupe lệch SQLite. */
export function buildHelmetDetectCountsById(
  _events: unknown[],
  cameraIds: readonly string[],
): Record<string, PatrolDeviceDetectCounts> {
  const out: Record<string, PatrolDeviceDetectCounts> = {}
  for (const id of cameraIds) {
    out[id] = { person: 0, identity: 0, total: 0 }
  }
  return out
}
