/**
 * Live map positions — chỉ HC-01 + HC-02.
 * HC-02: GPS thật. HC-01: pin khu ZONE_A (không zigzag). HC-03…05 tạm ẩn.
 */
import { useEffect, useRef, useState } from 'react'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import { subscribePatrolHelmetGps } from '@/services/patrolHelmetGpsBridge'
import { MOCK_PATROL_ZONES, type PatrolZone } from '../data/patrolMockData'
import { PATROL_MAP_ACTIVE_HELMET_PINS } from '../data/patrolSiteMap'
import { fetchPatrolHelmetMetrics } from './patrolLiveEvents.service'

export type LivePatrolZone = PatrolZone

export type CameraPositions = Record<string, [number, number]>
export type RouteHistory = Record<string, [number, number][]>

const MAX_HISTORY = 150
const HC01_CAMERA_ID = 'HC-01'
const HC02_CAMERA_ID = 'HC-02'
const BACKEND_GPS_POLL_MS = 2500

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
  const pin = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === HC01_CAMERA_ID)
  return pin ? { [HC01_CAMERA_ID]: pin.position } : {}
}

function isValidGps(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
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
    () => MOCK_PATROL_ZONES.map(z => ({ ...z })),
  )
  const [cameraPositions, setCameraPositions] = useState<CameraPositions>(
    buildInitialPositions,
  )
  const [routeHistory, setRouteHistory] = useState<RouteHistory>(() => {
    const pin = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === HC01_CAMERA_ID)
    return pin ? { [HC01_CAMERA_ID]: [pin.position] } : {}
  })

  const hc02PosRef = useRef<[number, number] | null>(null)

  const applyHc02Position = (lat: number, lng: number) => {
    const pos: [number, number] = [lat, lng]
    hc02PosRef.current = pos
    setCameraPositions(prev => ({ ...prev, [HC02_CAMERA_ID]: pos }))
    setRouteHistory(prev => appendRouteHistory(prev, HC02_CAMERA_ID, pos))
  }

  /* HC-01: giữ pin ZONE_A (offline khi cam tắt — không giả lập di chuyển) */
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

  /* HC-02: GPS từ thiết bị đang stream (cùng tab) */
  useEffect(() => {
    return subscribePatrolHelmetGps(snap => {
      if (snap.cameraId !== HC02_CAMERA_ID) return
      applyHc02Position(snap.lat, snap.lng)
    })
  }, [])

  /* HC-02: poll backend cache */
  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      const backendUrl = getMobileAiBackendUrl() || getVmsBackendUrl()
      if (!backendUrl) return
      try {
        const metrics = await fetchPatrolHelmetMetrics(HC02_CAMERA_ID, backendUrl)
        if (cancelled || !metrics) return
        const { gps_lat: lat, gps_lng: lng } = metrics
        if (isValidGps(lat, lng)) {
          applyHc02Position(lat, lng)
        }
      } catch {
        // Backend offline — giữ vị trí cuối.
      }
    }

    void poll()
    const t = window.setInterval(() => { void poll() }, BACKEND_GPS_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
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
