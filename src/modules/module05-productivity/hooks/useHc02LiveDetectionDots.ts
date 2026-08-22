/**
 * HC-02 live map dots: person_count + GPS (live hoặc last-known) → chấm ≤ ~2m.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
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
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import type { DetectionDot } from '../data/patrolDetectionData'
import { fetchPatrolHelmetMetrics } from '../services/patrolLiveEvents.service'
import { buildPersonDotsAroundGps } from '../utils/patrolLivePersonDots'

const HC02 = 'HC-02'
const POLL_MS = 1800
const PERSON_HOLD_MS = 10_000

function isValidGps(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
}

export interface Hc02LiveMapState {
  hasLiveGps: boolean
  lat: number | null
  lng: number | null
  personCount: number
  dots: DetectionDot[]
  /** Có người detect nhưng chưa có GPS để vẽ chấm */
  waitingGpsForDots: boolean
}

export function useHc02LiveDetectionDots(): Hc02LiveMapState {
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [personCount, setPersonCount] = useState(0)
  const heldRef = useRef({ count: 0, at: 0 })
  const [displayCount, setDisplayCount] = useState(0)

  const bumpDisplayCount = (n: number) => {
    const now = Date.now()
    if (n > 0) {
      heldRef.current = { count: n, at: now }
      setDisplayCount(n)
      return
    }
    if (now - heldRef.current.at <= PERSON_HOLD_MS) {
      setDisplayCount(heldRef.current.count)
      return
    }
    heldRef.current = { count: 0, at: 0 }
    setDisplayCount(0)
  }

  const applyGps = (nextLat: number, nextLng: number) => {
    if (!isValidGps(nextLat, nextLng)) return
    setLat(nextLat)
    setLng(nextLng)
  }

  /* GPS watch ngay trên map — không phụ thuộc MobileCameraFeed */
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
      const n = Math.max(0, Math.floor(count))
      setPersonCount(n)
      bumpDisplayCount(n)
    }

    const mobile = getPatrolMobileLiveSnapshot(HC02)
    if (mobile) applyPerson(mobile.personCount)

    return subscribePatrolMobileLiveSnapshot(snap => {
      if (!snap) return
      if (snap.cameraId !== HC02) return
      applyPerson(snap.personCount)
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
        if (isValidGps(metrics.gps_lat, metrics.gps_lng)) {
          applyGps(metrics.gps_lat, metrics.gps_lng)
        }
        const n = Math.max(0, Math.floor(Number(metrics.person_count ?? 0)))
        // Ưu tiên bridge mobile nếu còn fresh — tránh poll 0 đè lên live count
        const mobile = getPatrolMobileLiveSnapshot(HC02)
        if (mobile && mobile.personCount > 0) {
          setPersonCount(mobile.personCount)
          bumpDisplayCount(mobile.personCount)
        } else {
          setPersonCount(n)
          bumpDisplayCount(n)
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
      bumpDisplayCount(personCount)
      // Refresh last-known GPS vào state nếu watch chưa kịp
      if (!isValidGps(lat, lng)) {
        const known = getPatrolHelmetGpsLastKnown(HC02)
        if (known) applyGps(known.lat, known.lng)
      }
    }, 1000)
    return () => window.clearInterval(t)
  }, [personCount, lat, lng])

  const hasGps = isValidGps(lat, lng)

  const dots = useMemo(() => {
    if (!hasGps || displayCount <= 0) return []
    // ~2m trên map cho dễ thấy; vẫn quanh vị trí mũ
    return buildPersonDotsAroundGps(HC02, lat, lng, displayCount, 2)
  }, [hasGps, lat, lng, displayCount])

  return {
    hasLiveGps: hasGps,
    lat,
    lng,
    personCount: displayCount,
    dots,
    waitingGpsForDots: displayCount > 0 && !hasGps,
  }
}
