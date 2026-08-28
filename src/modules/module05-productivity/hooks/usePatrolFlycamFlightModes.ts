import { useEffect, useState } from 'react'
import {
  getPatrolFlightMode,
  subscribePatrolFlightMode,
} from '@/services/patrolFlightModeBridge'
import type { PatrolFlightMode } from '../utils/patrolFlightMode'
import { PATROL_DRONE_IDS } from '../data/patrolDrones'

/** flight_mode live theo từng flycam — mặc định aerial khi chưa có telemetry. */
export function usePatrolFlycamFlightModes(
  cameraIds: readonly string[] = PATROL_DRONE_IDS,
): Record<string, PatrolFlightMode> {
  const ids = cameraIds.filter(id => id.startsWith('DR-'))
  const [modes, setModes] = useState<Record<string, PatrolFlightMode>>(() => {
    const init: Record<string, PatrolFlightMode> = {}
    for (const id of ids) {
      init[id] = getPatrolFlightMode(id) ?? 'aerial'
    }
    return init
  })

  useEffect(() => {
    const sync = (cameraId: string, mode: PatrolFlightMode | null) => {
      if (!ids.includes(cameraId)) return
      setModes(prev => ({ ...prev, [cameraId]: mode ?? 'aerial' }))
    }
    return subscribePatrolFlightMode(sync)
  }, [ids.join(',')])

  return modes
}
