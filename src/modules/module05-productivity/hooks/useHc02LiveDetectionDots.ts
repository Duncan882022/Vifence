/**
 * HC-02 live map dots — GPS bridge + registry, không poll metrics trùng page.
 */
import { useEffect, useMemo, useState } from 'react'
import { watchDeviceGps } from '@/modules/module02-training/services/deviceGps.service'
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
  setPatrolHelmetGps,
  subscribePatrolHelmetGps,
} from '@/services/patrolHelmetGpsBridge'
import {
  getHeatmapPersonCount,
  getHeatmapPersonDots,
  subscribeHeatmapPersonRegistry,
} from '@/services/patrolHeatmapPersonRegistry'
import {
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import type { DetectionDot } from '../data/patrolDetectionData'
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

export interface Hc02LiveMapState {
  hasLiveGps: boolean
  usingDefaultGps: boolean
  hasMapPosition: boolean
  lat: number | null
  lng: number | null
  personCount: number
  historicalDotCount: number
  dots: DetectionDot[]
  waitingGpsForDots: boolean
}

export function useHc02LiveDetectionDots(): Hc02LiveMapState {
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [personCount, setPersonCount] = useState(0)
  const [registryTick, setRegistryTick] = useState(0)
  const [streamOnline, setStreamOnline] = useState(
    () => Boolean(getPatrolMobileLiveSnapshot(HC02)?.streamOnline),
  )

  const applyGps = (nextLat: number, nextLng: number) => {
    if (!streamOnline) return
    if (!isValidGps(nextLat, nextLng)) return
    setLat(nextLat)
    setLng(nextLng)
  }

  useEffect(() => subscribeHeatmapPersonRegistry(() => {
    setRegistryTick(t => t + 1)
  }), [])

  useEffect(() => {
    const applyMobileSnap = (snap: ReturnType<typeof getPatrolMobileLiveSnapshot>) => {
      if (!snap || snap.cameraId !== HC02) return
      const online = Boolean(snap.streamOnline)
      setStreamOnline(online)
      if (!online) {
        setPersonCount(0)
        setLat(null)
        setLng(null)
        return
      }
      setPersonCount(Math.max(0, Math.floor(snap.personCount)))
    }

    applyMobileSnap(getPatrolMobileLiveSnapshot(HC02))
    return subscribePatrolMobileLiveSnapshot(snap => {
      if (!snap || snap.cameraId !== HC02) return
      applyMobileSnap(snap)
    })
  }, [])

  useEffect(() => {
    if (!streamOnline) return
    return watchDeviceGps(reading => {
      setPatrolHelmetGps({
        cameraId: HC02,
        lat: reading.lat,
        lng: reading.lng,
        accuracyM: reading.accuracyM,
        updatedAt: reading.updatedAt,
      })
      applyGps(reading.lat, reading.lng)
    })
  }, [streamOnline])

  useEffect(() => {
    if (!streamOnline) return
    const fresh = getPatrolHelmetGps(HC02)
    const known = fresh ?? getPatrolHelmetGpsLastKnown(HC02)
    if (known) applyGps(known.lat, known.lng)

    return subscribePatrolHelmetGps(snap => {
      if (snap.cameraId !== HC02) return
      applyGps(snap.lat, snap.lng)
    })
  }, [streamOnline])

  useEffect(() => {
    if (!streamOnline) return
    const t = window.setInterval(() => {
      if (!isValidGps(lat, lng)) {
        const known = getPatrolHelmetGpsLastKnown(HC02)
        if (known) applyGps(known.lat, known.lng)
      }
    }, 1000)
    return () => window.clearInterval(t)
  }, [lat, lng, streamOnline])

  const hasLiveGps = streamOnline && isValidGps(lat, lng)
  const usingDefaultGps = !hasLiveGps
  const hasMapPosition = streamOnline || isValidGps(lat, lng)
  const [effectiveLat, effectiveLng] = streamOnline
    ? resolvePatrolHelmetMapPosition(lat, lng, PATROL_HELMET_02_FALLBACK)
    : PATROL_HELMET_02_FALLBACK

  const dots = useMemo(() => {
    if (!streamOnline) return []
    void registryTick
    return getHeatmapPersonDots(HC02)
  }, [registryTick, streamOnline])

  const historicalDotCount = useMemo(() => {
    if (!streamOnline) return 0
    void registryTick
    return getHeatmapPersonCount(HC02)
  }, [registryTick, streamOnline])

  return {
    hasLiveGps,
    usingDefaultGps,
    hasMapPosition,
    lat: effectiveLat,
    lng: effectiveLng,
    personCount,
    historicalDotCount,
    dots,
    waitingGpsForDots: personCount > 0 && historicalDotCount === 0,
  }
}
