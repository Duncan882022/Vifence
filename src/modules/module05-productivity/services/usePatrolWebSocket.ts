/**
 * Mock WebSocket hook — HQCV §41.
 * Mỗi mũ tuần tra trong khu phụ trách (vòng lặp GPS quanh tâm zone).
 */
import { useEffect, useRef, useState } from 'react'
import { MOCK_PATROL_ZONES, type PatrolZone } from '../data/patrolMockData'
import {
  PATROL_HELMET_GPS_PINS,
  PATROL_HELMET_ZONE_TRAILS,
} from '../data/patrolSiteMap'

export type LivePatrolZone = PatrolZone

export type CameraPositions = Record<string, [number, number]>
export type RouteHistory    = Record<string, [number, number][]>

const MAX_HISTORY = 150

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
  routeHistory: RouteHistory
} {
  const [liveZones, setLiveZones] = useState<LivePatrolZone[]>(
    () => MOCK_PATROL_ZONES.map(z => ({ ...z })),
  )
  const [cameraPositions, setCameraPositions] = useState<CameraPositions>(
    buildInitialPositions,
  )
  const [routeHistory, setRouteHistory] = useState<RouteHistory>(() =>
    Object.fromEntries(PATROL_HELMET_GPS_PINS.map(p => [p.id, [p.position]])),
  )

  const trailIndicesRef = useRef<Record<string, number>>(
    Object.fromEntries(PATROL_HELMET_GPS_PINS.map(p => [p.id, 0])),
  )

  /* zone_count_updated ── every 3.5 s */
  useEffect(() => {
    const t = window.setInterval(() => {
      setLiveZones(prev => tickZones(prev))
    }, 3500)
    return () => window.clearInterval(t)
  }, [])

  /* camera_position — mỗi mũ di chuyển, tích luỹ history */
  useEffect(() => {
    let historyTick = 0
    const t = window.setInterval(() => {
      const newPositions: CameraPositions = {}
      for (const pin of PATROL_HELMET_GPS_PINS) {
        const trail = PATROL_HELMET_ZONE_TRAILS[pin.id]
        if (!trail?.length) continue
        const idx = trailIndicesRef.current[pin.id] ?? 0
        trailIndicesRef.current[pin.id] = (idx + 1) % trail.length
        newPositions[pin.id] = trail[trailIndicesRef.current[pin.id]]
      }
      setCameraPositions(newPositions)

      /* Cập nhật history mỗi 5 tick (~1.5s) để tránh re-render quá nhiều */
      historyTick++
      if (historyTick % 5 === 0) {
        setRouteHistory(prev => {
          const next = { ...prev }
          for (const pin of PATROL_HELMET_GPS_PINS) {
            const pos = newPositions[pin.id]
            if (!pos) continue
            const hist = prev[pin.id] ?? []
            const updated = [...hist, pos]
            next[pin.id] = updated.length > MAX_HISTORY
              ? updated.slice(updated.length - MAX_HISTORY)
              : updated
          }
          return next
        })
      }
    }, 300)
    return () => window.clearInterval(t)
  }, [])

  /* Stagger initial phase so 5 mũ không chồng vị trí */
  useEffect(() => {
    const offsets: Record<string, number> = {
      'HC-01': 0,
      'HC-02': 3,
      'HC-03': 6,
      'HC-04': 9,
      'HC-05': 12,
    }
    trailIndicesRef.current = Object.fromEntries(
      PATROL_HELMET_GPS_PINS.map(p => [p.id, offsets[p.id] ?? 0]),
    )
    setCameraPositions(() => {
      const pos: CameraPositions = {}
      for (const pin of PATROL_HELMET_GPS_PINS) {
        const trail = PATROL_HELMET_ZONE_TRAILS[pin.id]
        const idx = offsets[pin.id] ?? 0
        pos[pin.id] = trail?.[idx] ?? pin.position
      }
      return pos
    })
  }, [])

  return { liveZones, cameraPositions, routeHistory }
}
