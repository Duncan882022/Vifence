/**
 * Mock WebSocket hook — HQCV §41.
 * Production: replace setInterval with actual WebSocket /ws/patrol/{id}.
 *
 * Simulated events:
 *   zone_count_updated  — every 3 500 ms
 *   camera_position     — every 2 000 ms (HC-01 moves along GPS trail)
 *   coverage_updated    — once after 30 s (simulates a new zone visited)
 */
import { useEffect, useRef, useState } from 'react'
import { MOCK_PATROL_ZONES, type PatrolZone } from '../data/patrolMockData'
import { PATROL_GPS_TRAIL, PATROL_HELMET_GPS_PINS } from '../data/patrolSiteMap'

export type LivePatrolZone = PatrolZone

export type CameraPositions = Record<string, [number, number]>

function jitter(value: number, max: number): number {
  if (max <= 0) return 0
  const delta = Math.floor(Math.random() * 5) - 2
  return Math.max(0, Math.min(max, value + delta))
}

function tickZones(zones: LivePatrolZone[]): LivePatrolZone[] {
  return zones.map(z => {
    if (z.coverage !== 'VISITED') return z
    return {
      ...z,
      peopleCurrent: jitter(z.peopleCurrent, z.uniquePeople + 8),
      vehiclesCurrent: jitter(z.vehiclesCurrent, z.uniqueVehicles + 3),
    }
  })
}

function buildInitialPositions(): CameraPositions {
  return Object.fromEntries(
    PATROL_HELMET_GPS_PINS.map(p => [p.id, p.position]),
  )
}

export function usePatrolWebSocket(_patrolId: string): {
  liveZones: LivePatrolZone[]
  cameraPositions: CameraPositions
} {
  const [liveZones, setLiveZones] = useState<LivePatrolZone[]>(
    () => MOCK_PATROL_ZONES.map(z => ({ ...z })),
  )
  const [cameraPositions, setCameraPositions] = useState<CameraPositions>(
    buildInitialPositions,
  )

  const trailIndexRef = useRef(0)

  /* zone_count_updated ── every 3.5 s */
  useEffect(() => {
    const t = window.setInterval(() => {
      setLiveZones(prev => tickZones(prev))
    }, 3500)
    return () => window.clearInterval(t)
  }, [])

  /* camera_position ── HC-01 moves along GPS trail every 2 s */
  useEffect(() => {
    const trail = PATROL_GPS_TRAIL
    const t = window.setInterval(() => {
      trailIndexRef.current = (trailIndexRef.current + 1) % trail.length
      const pos = trail[trailIndexRef.current]
      setCameraPositions(prev => ({ ...prev, 'HC-01': pos }))
    }, 2000)
    return () => window.clearInterval(t)
  }, [])

  /* coverage_updated ── simulate HC-04 finishing ZONE_D after 30 s */
  useEffect(() => {
    const t = window.setTimeout(() => {
      setLiveZones(prev =>
        prev.map(z =>
          z.id === 'ZONE_D' ? { ...z, dwellSeconds: z.dwellSeconds + 45 } : z,
        ),
      )
    }, 30_000)
    return () => window.clearTimeout(t)
  }, [])

  return { liveZones, cameraPositions }
}
