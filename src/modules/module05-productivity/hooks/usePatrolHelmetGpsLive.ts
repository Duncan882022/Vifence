/**
 * GPS live HC-02 cho pin bản đồ — không dùng registry chấm (presences là nguồn map dots).
 */
import { useEffect, useState } from 'react'
import { watchDeviceGps } from '@/modules/module02-training/services/deviceGps.service'
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
  setPatrolHelmetGps,
  subscribePatrolHelmetGps,
} from '@/services/patrolHelmetGpsBridge'
import {
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import { PATROL_HELMET_02_FALLBACK } from '../data/patrolSiteMap'
import { resolvePatrolHelmetMapPosition } from '../utils/patrolHeatmapGps'

const HC02 = 'HC-02'

function isValidGps(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
}

export interface PatrolHelmetGpsLiveState {
  hasLiveGps: boolean
  hasMapPosition: boolean
  lat: number | null
  lng: number | null
}

export function usePatrolHelmetGpsLive(cameraId: string = HC02): PatrolHelmetGpsLiveState {
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [streamOnline, setStreamOnline] = useState(
    () => Boolean(getPatrolMobileLiveSnapshot(cameraId)?.streamOnline),
  )

  const applyGps = (nextLat: number, nextLng: number) => {
    if (!streamOnline) return
    if (!isValidGps(nextLat, nextLng)) return
    setLat(nextLat)
    setLng(nextLng)
  }

  useEffect(() => {
    const applyMobileSnap = (snap: ReturnType<typeof getPatrolMobileLiveSnapshot>) => {
      if (!snap || snap.cameraId !== cameraId) return
      const online = Boolean(snap.streamOnline)
      setStreamOnline(online)
      if (!online) {
        setLat(null)
        setLng(null)
      }
    }

    applyMobileSnap(getPatrolMobileLiveSnapshot(cameraId))
    return subscribePatrolMobileLiveSnapshot(snap => {
      if (!snap || snap.cameraId !== cameraId) return
      applyMobileSnap(snap)
    })
  }, [cameraId])

  useEffect(() => {
    if (!streamOnline || cameraId !== HC02) return
    return watchDeviceGps(reading => {
      setPatrolHelmetGps({
        cameraId,
        lat: reading.lat,
        lng: reading.lng,
        accuracyM: reading.accuracyM,
        updatedAt: reading.updatedAt,
      })
      applyGps(reading.lat, reading.lng)
    })
  }, [streamOnline, cameraId])

  useEffect(() => {
    if (!streamOnline) return
    const fresh = getPatrolHelmetGps(cameraId)
    const known = fresh ?? getPatrolHelmetGpsLastKnown(cameraId)
    if (known) applyGps(known.lat, known.lng)

    return subscribePatrolHelmetGps(snap => {
      if (snap.cameraId !== cameraId) return
      applyGps(snap.lat, snap.lng)
    })
  }, [streamOnline, cameraId])

  useEffect(() => {
    if (!streamOnline) return
    const t = window.setInterval(() => {
      if (!isValidGps(lat, lng)) {
        const known = getPatrolHelmetGpsLastKnown(cameraId)
        if (known) applyGps(known.lat, known.lng)
      }
    }, 1000)
    return () => window.clearInterval(t)
  }, [lat, lng, streamOnline, cameraId])

  const hasLiveGps = streamOnline && isValidGps(lat, lng)
  const hasMapPosition = streamOnline || isValidGps(lat, lng)
  const [effectiveLat, effectiveLng] = streamOnline
    ? resolvePatrolHelmetMapPosition(lat, lng, PATROL_HELMET_02_FALLBACK)
    : PATROL_HELMET_02_FALLBACK

  return {
    hasLiveGps,
    hasMapPosition,
    lat: effectiveLat,
    lng: effectiveLng,
  }
}
