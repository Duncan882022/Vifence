/**
 * Live map positions — chỉ HC-01 + HC-02.
 * HC-02: GPS thật. HC-01: pin khu ZONE_A (không zigzag). HC-03…05 tạm ẩn.
 */
import { useEffect, useRef, useState } from 'react'
import { subscribePatrolHelmetGps } from '@/services/patrolHelmetGpsBridge'
import type { PatrolZone } from '../data/patrolTypes'
import { PATROL_MAP_ACTIVE_HELMET_PINS, PATROL_HELMET_02_FALLBACK, PATROL_SITE_ZONE_SEED } from '../data/patrolSiteMap'
import { resolvePatrolHelmetMapPosition } from '../utils/patrolHeatmapGps'

export type LivePatrolZone = PatrolZone

export type CameraPositions = Record<string, [number, number]>
export type RouteHistory = Record<string, [number, number][]>

const MAX_HISTORY = 150
const HC01_CAMERA_ID = 'HC-01'
const HC02_CAMERA_ID = 'HC-02'

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
  const positions: CameraPositions = {}
  for (const pin of PATROL_MAP_ACTIVE_HELMET_PINS) {
    positions[pin.id] = pin.position
  }
  return positions
}

function appendRouteHistory(
  prev: RouteHistory,
  cameraId: string,
  pos: [number, number],
): RouteHistory {
  const hist = prev[cameraId] ?? []
  const last = hist[hist.length - 1]
  if (last && last[0] === pos[0] && last[1] === pos[1]) return prev
  const updated = [...hist, pos]
  return {
    ...prev,
    [cameraId]: updated.length > MAX_HISTORY
      ? updated.slice(updated.length - MAX_HISTORY)
      : updated,
  }
}

export function usePatrolWebSocket(_patrolId: string): {
  liveZones: LivePatrolZone[]
  cameraPositions: CameraPositions
  routeHistory: RouteHistory
} {
  const [liveZones, setLiveZones] = useState<LivePatrolZone[]>(
    () => PATROL_SITE_ZONE_SEED.map(z => ({ ...z })),
  )
  const [cameraPositions, setCameraPositions] = useState<CameraPositions>(
    buildInitialPositions,
  )
  const [routeHistory, setRouteHistory] = useState<RouteHistory>(() => {
    const pin = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === HC01_CAMERA_ID)
    const initial: RouteHistory = {}
    if (pin) initial[HC01_CAMERA_ID] = [pin.position]
    return initial
  })

  const hc02PosRef = useRef<[number, number] | null>(null)

  const applyHc02Position = (lat: number, lng: number) => {
    const pos = resolvePatrolHelmetMapPosition(lat, lng, PATROL_HELMET_02_FALLBACK)
    hc02PosRef.current = pos
    setCameraPositions(prev => ({ ...prev, [HC02_CAMERA_ID]: pos }))
    setRouteHistory(prev => appendRouteHistory(prev, HC02_CAMERA_ID, pos))
  }

  /* HC-01: giữ pin tại center công trường (offline khi cam tắt — không giả lập di chuyển) */
  useEffect(() => {
    const pin = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === HC01_CAMERA_ID)
    if (!pin) return
    setCameraPositions(prev => {
      const { [HC02_CAMERA_ID]: hc02, ...rest } = prev
      return {
        ...rest,
        [HC01_CAMERA_ID]: pin.position,
        ...(hc02 ? { [HC02_CAMERA_ID]: hc02 } : {}),
      }
    })
  }, [])

  /* HC-02: GPS từ bridge thiết bị — poll backend do useHc02LiveDetectionDots / workforce. */
  useEffect(() => {
    return subscribePatrolHelmetGps(snap => {
      if (snap.cameraId !== HC02_CAMERA_ID) return
      applyHc02Position(snap.lat, snap.lng)
    })
  }, [])

  /* zone_count_updated ── every 3.5 s (chỉ khi bật polygon mock) */
  useEffect(() => {
    const t = window.setInterval(() => {
      setLiveZones(prev => tickZones(prev))
    }, 3500)
    return () => window.clearInterval(t)
  }, [])

  return { liveZones, cameraPositions, routeHistory }
}
