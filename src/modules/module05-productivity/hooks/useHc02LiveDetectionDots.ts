/**
 * HC-02 live map dots — lịch sử theo từng người (ID ổn định), chỉ cập nhật vị trí khi gặp lại.
 */
import { useEffect, useMemo, useState } from 'react'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import { watchDeviceGps } from '@/modules/module02-training/services/deviceGps.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
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
import { fetchPatrolHelmetMetrics } from '../services/patrolLiveEvents.service'

const HC02 = 'HC-02'
const POLL_MS = 1800

function isValidGps(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
}

function asGpsPair(lat: unknown, lng: unknown): [number, number] | null {
  if (!isValidGps(lat, lng)) return null
  return [lat, lng as number]
}

export interface Hc02LiveMapState {
  /** GPS thật từ thiết bị / backend */
  hasLiveGps: boolean
  /** Stream online nhưng chưa có GPS — dùng PATROL_SITE_CENTER */
  usingDefaultGps: boolean
  /** Có tọa độ hiển thị trên map (GPS thật hoặc mặc định) */
  hasMapPosition: boolean
  lat: number | null
  lng: number | null
  /** Số người trên frame hiện tại */
  personCount: number
  /** Tổng dot lịch sử trên map (unique IDs) */
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
    return subscribePatrolMobileLiveSnapshot(snap => {
      const online = Boolean(snap && snap.cameraId === HC02 && snap.streamOnline)
      setStreamOnline(online)
      if (!online) {
        setPersonCount(0)
        setLat(null)
        setLng(null)
      }
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
    const applyPerson = (count: number) => {
      if (!streamOnline) {
        setPersonCount(0)
        return
      }
      setPersonCount(Math.max(0, Math.floor(count)))
    }

    const mobile = getPatrolMobileLiveSnapshot(HC02)
    if (mobile) {
      applyPerson(mobile.personCount)
    }

    return subscribePatrolMobileLiveSnapshot(snap => {
      if (!snap || snap.cameraId !== HC02) return
      setStreamOnline(Boolean(snap.streamOnline))
      applyPerson(snap.personCount)
    })
  }, [streamOnline])

  useEffect(() => {
    if (!streamOnline) return
    let cancelled = false

    const poll = async () => {
      const backendUrl = getMobileAiBackendUrl() || getVmsBackendUrl()
      if (!backendUrl) return
      try {
        const metrics = await fetchPatrolHelmetMetrics(HC02, backendUrl)
        if (cancelled || !metrics) return
        const pair = asGpsPair(metrics.gps_lat, metrics.gps_lng)
        if (pair) applyGps(pair[0], pair[1])
        const mobile = getPatrolMobileLiveSnapshot(HC02)
        if (mobile) {
          setPersonCount(mobile.personCount)
        } else {
          setPersonCount(Math.max(0, Math.floor(Number(metrics.person_count ?? 0))))
        }
      } catch {
        // giữ trạng thái cuối
      }
    }

    void poll()
    const t = window.setInterval(() => { void poll() }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
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
