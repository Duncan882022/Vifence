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
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'
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
  const [streamOnline, setStreamOnline] = useState(
    () => Boolean(getPatrolMobileLiveSnapshot(HC02)?.streamOnline),
  )
  const [registryTick, setRegistryTick] = useState(0)

  const applyGps = (nextLat: number, nextLng: number) => {
    if (!isValidGps(nextLat, nextLng)) return
    setLat(nextLat)
    setLng(nextLng)
  }

  useEffect(() => subscribeHeatmapPersonRegistry(() => {
    setRegistryTick(t => t + 1)
  }), [])

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    const fresh = getPatrolHelmetGps(HC02)
    const known = fresh ?? getPatrolHelmetGpsLastKnown(HC02)
    if (known) applyGps(known.lat, known.lng)

    return subscribePatrolHelmetGps(snap => {
      if (snap.cameraId !== HC02) return
      applyGps(snap.lat, snap.lng)
    })
  }, [])

  useEffect(() => {
    const applyPerson = (count: number) => {
      setPersonCount(Math.max(0, Math.floor(count)))
    }

    const mobile = getPatrolMobileLiveSnapshot(HC02)
    if (mobile) {
      applyPerson(mobile.personCount)
      setStreamOnline(Boolean(mobile.streamOnline))
    }

    return subscribePatrolMobileLiveSnapshot(snap => {
      if (!snap || snap.cameraId !== HC02) return
      applyPerson(snap.personCount)
      setStreamOnline(Boolean(snap.streamOnline))
    })
  }, [])

  useEffect(() => {
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
          setStreamOnline(Boolean(mobile.streamOnline))
        } else {
          setPersonCount(Math.max(0, Math.floor(Number(metrics.person_count ?? 0))))
          setStreamOnline(Boolean(metrics.stream_online))
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
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => {
      if (!isValidGps(lat, lng)) {
        const known = getPatrolHelmetGpsLastKnown(HC02)
        if (known) applyGps(known.lat, known.lng)
      }
    }, 1000)
    return () => window.clearInterval(t)
  }, [lat, lng])

  const hasLiveGps = isValidGps(lat, lng)
  const usingDefaultGps = streamOnline && !hasLiveGps
  const hasMapPosition = hasLiveGps || usingDefaultGps
  const effectiveLat = hasLiveGps
    ? lat
    : usingDefaultGps
      ? PATROL_SITE_CENTER[0]
      : null
  const effectiveLng = hasLiveGps
    ? lng
    : usingDefaultGps
      ? PATROL_SITE_CENTER[1]
      : null

  const dots = useMemo(() => {
    void registryTick
    return getHeatmapPersonDots()
  }, [registryTick])

  const historicalDotCount = useMemo(() => {
    void registryTick
    return getHeatmapPersonCount()
  }, [registryTick])

  return {
    hasLiveGps,
    usingDefaultGps,
    hasMapPosition,
    lat: effectiveLat,
    lng: effectiveLng,
    personCount,
    historicalDotCount,
    dots,
    waitingGpsForDots: personCount > 0 && historicalDotCount === 0 && !hasMapPosition,
  }
}
