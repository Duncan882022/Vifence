/**
 * Vị trí live trên bản đồ tuần tra — GPS bridge HC-02 + pin HC-01.
 * (Không phải WebSocket — tên cũ usePatrolWebSocket gây hiểu nhầm.)
 */
import { useEffect, useRef, useState } from 'react'
import { subscribePatrolHelmetGps } from '@/services/patrolHelmetGpsBridge'
import type { PatrolZone } from '../data/patrolTypes'
import { PATROL_MAP_ACTIVE_HELMET_PINS, PATROL_HELMET_02_FALLBACK } from '../data/patrolSiteMap'
import { resolvePatrolHelmetMapPosition } from '../utils/patrolHeatmapGps'

export type LivePatrolZone = PatrolZone
export type CameraPositions = Record<string, [number, number]>
export type RouteHistory = Record<string, [number, number][]>

const MAX_HISTORY = 150
const HC01_CAMERA_ID = 'HC-01'
const HC02_CAMERA_ID = 'HC-02'

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

export function usePatrolLiveMapState(): {
  cameraPositions: CameraPositions
  routeHistory: RouteHistory
} {
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

  useEffect(() => {
    return subscribePatrolHelmetGps(snap => {
      if (snap.cameraId !== HC02_CAMERA_ID) return
      applyHc02Position(snap.lat, snap.lng)
    })
  }, [])

  return { cameraPositions, routeHistory }
}
