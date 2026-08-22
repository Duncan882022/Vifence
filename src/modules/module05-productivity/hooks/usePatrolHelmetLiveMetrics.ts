import { useEffect, useRef, useState } from 'react'
import { getMobileAiBackendUrl, pingMobileAiBackend } from '@/modules/module02-training/services/mobileAiBackend.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import {
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
  type PatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import { DEFAULT_PATROL_CAMERA_IDS } from '../data/patrolCameras'
import { isPatrolHelmetCameraId } from '../data/patrolHelmetScope'
import {
  fetchPatrolHelmetAggregateMetrics,
  type PatrolHelmetCameraMetricsSlice,
} from '../services/patrolLiveEvents.service'

export interface PatrolHelmetLiveMetrics {
  backendReachable: boolean
  streamOnline: boolean
  /** @deprecated dùng streamOnline */
  connected: boolean
  personCount: number
  uniqueWorkers: number
  identifiedWorkers: number
  activePpeViolations: number
  ppeAlertsToday: number
  workerNames: string[]
  /** Chi tiết theo từng mũ — HC-01, HC-02, … */
  perCamera: PatrolHelmetCameraMetricsSlice[]
}

const EMPTY: PatrolHelmetLiveMetrics = {
  backendReachable: false,
  streamOnline: false,
  connected: false,
  personCount: 0,
  uniqueWorkers: 0,
  identifiedWorkers: 0,
  activePpeViolations: 0,
  ppeAlertsToday: 0,
  workerNames: [],
  perCamera: [],
}

const PERSON_COUNT_HOLD_MS = 8000
const VIOLATION_COUNT_HOLD_MS = 6000
const HC02 = 'HC-02'

function mergeHc02Mobile(
  base: PatrolHelmetLiveMetrics,
  mobile: PatrolMobileLiveSnapshot | null,
): PatrolHelmetLiveMetrics {
  if (!mobile || mobile.cameraId !== HC02) return base
  if (Date.now() - mobile.updatedAt > 10_000) return base

  const perCamera = [...base.perCamera]
  const idx = perCamera.findIndex(c => c.camera_id === HC02)
  const hc02Slice: PatrolHelmetCameraMetricsSlice = {
    camera_id: HC02,
    stream_online: true,
    person_count: Math.max(mobile.personCount, idx >= 0 ? perCamera[idx].person_count : 0),
    ppe_violations: Math.max(mobile.activePpeViolations, idx >= 0 ? perCamera[idx].ppe_violations : 0),
    identified_workers: Math.max(mobile.identifiedWorkers, idx >= 0 ? perCamera[idx].identified_workers : 0),
    ppe_alerts_today: idx >= 0 ? perCamera[idx].ppe_alerts_today : 0,
  }
  if (idx >= 0) perCamera[idx] = { ...perCamera[idx], ...hc02Slice }
  else perCamera.push(hc02Slice)

  const othersPerson = perCamera
    .filter(c => c.camera_id !== HC02)
    .reduce((s, c) => s + (c.stream_online ? c.person_count : 0), 0)
  const othersViol = perCamera
    .filter(c => c.camera_id !== HC02)
    .reduce((s, c) => s + (c.stream_online ? c.ppe_violations : 0), 0)

  const personCount = othersPerson + hc02Slice.person_count
  const activePpeViolations = othersViol + hc02Slice.ppe_violations
  const names = [
    ...new Set([...(base.workerNames ?? []), ...mobile.workerNames]),
  ].slice(0, 8)

  return {
    ...base,
    backendReachable: true,
    streamOnline: true,
    connected: true,
    personCount,
    uniqueWorkers: personCount,
    identifiedWorkers: Math.max(base.identifiedWorkers, mobile.identifiedWorkers),
    activePpeViolations,
    workerNames: names,
    perCamera,
  }
}

/** Live KPI Module 05 — backend aggregate + bridge HC-02 mobile cùng tab. */
export function usePatrolHelmetLiveMetrics(
  cameraIds: readonly string[] = DEFAULT_PATROL_CAMERA_IDS,
  pollMs = 2200,
): PatrolHelmetLiveMetrics {
  const [metrics, setMetrics] = useState<PatrolHelmetLiveMetrics>(EMPTY)
  const backendLiveRef = useRef(false)
  const lastPersonCountRef = useRef(0)
  const lastPersonAtRef = useRef(0)
  const lastViolationCountRef = useRef(0)
  const lastViolationAtRef = useRef(0)
  const baseRef = useRef<PatrolHelmetLiveMetrics>(EMPTY)

  useEffect(() => {
    const applyMobile = (snap: PatrolMobileLiveSnapshot | null) => {
      setMetrics(mergeHc02Mobile(baseRef.current, snap ?? getPatrolMobileLiveSnapshot(HC02)))
    }
    applyMobile(getPatrolMobileLiveSnapshot(HC02))
    return subscribePatrolMobileLiveSnapshot(applyMobile)
  }, [])

  useEffect(() => {
    const backendUrl = getMobileAiBackendUrl() || getVmsBackendUrl()
    const ids = cameraIds.filter(isPatrolHelmetCameraId)
    if (!backendUrl || ids.length === 0) return

    let stopped = false
    let timerId = 0

    const applyHold = (
      current: number,
      lastRef: { current: number },
      atRef: { current: number },
      holdMs: number,
    ) => {
      const now = Date.now()
      if (current > 0) {
        lastRef.current = current
        atRef.current = now
        return current
      }
      if (now - atRef.current <= holdMs) {
        return lastRef.current
      }
      lastRef.current = 0
      return 0
    }

    const tick = async () => {
      if (stopped) return
      try {
        const online = await pingMobileAiBackend(backendUrl)
        if (stopped) return
        backendLiveRef.current = online
        if (!online) {
          // Backend down — vẫn giữ bridge mobile nếu đang stream cùng tab
          const mobileOnly = mergeHc02Mobile(EMPTY, getPatrolMobileLiveSnapshot(HC02))
          if (mobileOnly.streamOnline) {
            baseRef.current = mobileOnly
            setMetrics(mobileOnly)
          } else {
            lastPersonCountRef.current = 0
            lastPersonAtRef.current = 0
            lastViolationCountRef.current = 0
            lastViolationAtRef.current = 0
            baseRef.current = EMPTY
            setMetrics(EMPTY)
          }
          timerId = window.setTimeout(tick, pollMs * 2)
          return
        }

        const snapshot = await fetchPatrolHelmetAggregateMetrics(ids, backendUrl)
        if (stopped) return

        if (!snapshot) {
          const merged = mergeHc02Mobile(
            {
              ...baseRef.current,
              backendReachable: true,
              streamOnline: false,
              connected: false,
            },
            getPatrolMobileLiveSnapshot(HC02),
          )
          baseRef.current = merged
          setMetrics(merged)
          timerId = window.setTimeout(tick, pollMs * 2)
          return
        }

        const streamOnline = Boolean(snapshot.stream_online)
        if (!streamOnline) {
          lastPersonCountRef.current = 0
          lastPersonAtRef.current = 0
          lastViolationCountRef.current = 0
          lastViolationAtRef.current = 0
        }

        const rawPersonCount = Number(snapshot.person_count ?? 0)
        const rawViolations = Number(snapshot.ppe_violations ?? 0)
        const personCount = streamOnline
          ? applyHold(rawPersonCount, lastPersonCountRef, lastPersonAtRef, PERSON_COUNT_HOLD_MS)
          : 0
        const activePpeViolations = streamOnline
          ? applyHold(rawViolations, lastViolationCountRef, lastViolationAtRef, VIOLATION_COUNT_HOLD_MS)
          : 0

        const fromBackend: PatrolHelmetLiveMetrics = {
          backendReachable: true,
          streamOnline,
          connected: streamOnline,
          personCount,
          uniqueWorkers: rawPersonCount,
          identifiedWorkers: Number(snapshot.identified_workers ?? 0),
          activePpeViolations,
          ppeAlertsToday: Number(snapshot.ppe_alerts_today ?? 0),
          workerNames: snapshot.worker_names ?? [],
          perCamera: snapshot.cameras ?? [],
        }
        const merged = mergeHc02Mobile(fromBackend, getPatrolMobileLiveSnapshot(HC02))
        baseRef.current = merged
        setMetrics(merged)
        timerId = window.setTimeout(tick, pollMs)
      } catch {
        if (stopped) return
        const merged = mergeHc02Mobile(
          {
            ...baseRef.current,
            backendReachable: backendLiveRef.current,
            streamOnline: false,
            connected: false,
          },
          getPatrolMobileLiveSnapshot(HC02),
        )
        baseRef.current = merged
        setMetrics(merged)
        timerId = window.setTimeout(tick, pollMs * 2)
      }
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timerId)
      backendLiveRef.current = false
      lastPersonCountRef.current = 0
      lastPersonAtRef.current = 0
      lastViolationCountRef.current = 0
      lastViolationAtRef.current = 0
    }
  }, [cameraIds.join(','), pollMs])

  return metrics
}
