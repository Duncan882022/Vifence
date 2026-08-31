/**
 * Poll mật độ flycam tầm cao — KPI Tier1 «Mật độ flymap».
 */
import { useEffect, useState } from 'react'
import { PATROL_DRONE_IDS } from '../data/patrolDrones'
import {
  fetchPatrolDroneHeatmapMetrics,
  type PatrolDroneHeatmapMetrics,
} from '../services/patrolFlymap.service'

const POLL_MS = 30_000

export interface PatrolFlymapMetricsState {
  metrics: PatrolDroneHeatmapMetrics | null
  personInFrame: number
  loading: boolean
}

export function usePatrolFlymapMetrics(
  cameraId: string = PATROL_DRONE_IDS[0] ?? 'DR-03',
  enabled = true,
): PatrolFlymapMetricsState {
  const [metrics, setMetrics] = useState<PatrolDroneHeatmapMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }

    let cancelled = false

    const refresh = async () => {
      const next = await fetchPatrolDroneHeatmapMetrics(cameraId)
      if (cancelled) return
      setMetrics(next)
      setLoading(false)
    }

    void refresh()
    const timer = window.setInterval(() => { void refresh() }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [cameraId, enabled])

  const personInFrame = metrics
    ? (metrics.trackCount || metrics.framePersonCount || metrics.personCount || 0)
    : 0

  return { metrics, personInFrame, loading }
}
