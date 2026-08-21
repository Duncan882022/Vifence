import { useEffect, useState } from 'react'
import type { PatrolEvent } from '../data/patrolMockData'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import { fetchPatrolHelmetLiveEvents } from '../services/patrolLiveEvents.service'

export function usePatrolHelmetLiveEvents(cameraId = 'HC-01', pollMs = 3000) {
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<PatrolEvent[]>([])

  useEffect(() => {
    const backendUrl = getVmsBackendUrl()
    if (!backendUrl) return

    let stopped = false
    let timerId = 0

    const tick = async () => {
      if (stopped) return
      try {
        const rows = await fetchPatrolHelmetLiveEvents(cameraId, backendUrl)
        if (stopped) return
        setConnected(true)
        setEvents(rows)
        timerId = window.setTimeout(tick, pollMs)
      } catch {
        if (stopped) return
        setConnected(false)
        timerId = window.setTimeout(tick, pollMs * 2)
      }
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timerId)
    }
  }, [cameraId, pollMs])

  return { connected, events }
}
