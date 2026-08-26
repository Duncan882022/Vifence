import { useEffect, useRef, useState } from 'react'
import { getMobileAiBackendUrl, pingMobileAiBackend } from '@/modules/module02-training/services/mobileAiBackend.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import {
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
  type PatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import { DEFAULT_PATROL_CAMERA_IDS } from '../data/patrolCameras'
import { isPatrolHelmetCameraId, isPatrolMetricsCameraId } from '../data/patrolHelmetScope'
import {
  fetchPatrolHelmetAggregateMetrics,
  type PatrolHelmetCameraMetricsSlice,
} from '../services/patrolLiveEvents.service'

export interface PatrolHelmetLiveMetrics {
  backendReachable: boolean
  streamOnline: boolean
  /** @deprecated dùng streamOnline */
  connected: boolean
  /** Peak cộng dồn phiên — không giảm về 0 khi mất detect tạm thời. */
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

const VIOLATION_COUNT_HOLD_MS = 6000
const HC02 = 'HC-02'

function mergeHc02Mobile(
  base: PatrolHelmetLiveMetrics,
  mobile: PatrolMobileLiveSnapshot | null,
  sessionPeakRef: { current: number },
): PatrolHelmetLiveMetrics {
  if (!mobile || mobile.cameraId !== HC02) return base
  if (Date.now() - mobile.updatedAt > 45_000) return base
  if (!mobile.streamOnline && mobile.personCount <= 0 && mobile.peakPersonCount <= 0) {
    return base
  }

  const perCamera = [...base.perCamera]
  const idx = perCamera.findIndex(c => c.camera_id === HC02)
  const prevSlice = idx >= 0 ? perCamera[idx] : null
  const hc02Person = Math.max(
    mobile.peakPersonCount,
    mobile.personCount,
    prevSlice?.person_count ?? 0,
  )
  sessionPeakRef.current = Math.max(sessionPeakRef.current, hc02Person)

  const hc02Slice: PatrolHelmetCameraMetricsSlice = {
    camera_id: HC02,
    stream_online: Boolean(mobile.streamOnline),
    person_count: Math.max(hc02Person, sessionPeakRef.current),
    ppe_violations: Math.max(mobile.activePpeViolations, prevSlice?.ppe_violations ?? 0),
    identified_workers: Math.max(mobile.identifiedWorkers, prevSlice?.identified_workers ?? 0),
    ppe_alerts_today: prevSlice?.ppe_alerts_today ?? 0,
  }
  if (idx >= 0) perCamera[idx] = { ...perCamera[idx], ...hc02Slice }
  else perCamera.push(hc02Slice)

  const othersPerson = perCamera
    .filter(c => c.camera_id !== HC02)
    .reduce((s, c) => s + Math.max(0, c.person_count), 0)
  const othersViol = perCamera
    .filter(c => c.camera_id !== HC02)
    .reduce((s, c) => s + (c.stream_online ? c.ppe_violations : 0), 0)

  const personCount = Math.max(
    sessionPeakRef.current,
    othersPerson + hc02Slice.person_count,
    base.personCount,
  )
  sessionPeakRef.current = personCount

  const activePpeViolations = othersViol + hc02Slice.ppe_violations
  const names = [
    ...new Set([...(base.workerNames ?? []), ...mobile.workerNames]),
  ].slice(0, 8)

  return {
    ...base,
    backendReachable: true,
    streamOnline: Boolean(mobile.streamOnline) || base.streamOnline,
    connected: Boolean(mobile.streamOnline) || base.connected,
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
  const lastViolationCountRef = useRef(0)
  const lastViolationAtRef = useRef(0)
  const sessionPeakPersonRef = useRef(0)
  const baseRef = useRef<PatrolHelmetLiveMetrics>(EMPTY)

  useEffect(() => {
    const applyMobile = (snap: PatrolMobileLiveSnapshot | null) => {
      setMetrics(
        mergeHc02Mobile(
          baseRef.current,
          snap ?? getPatrolMobileLiveSnapshot(HC02),
          sessionPeakPersonRef,
        ),
      )
    }
    applyMobile(getPatrolMobileLiveSnapshot(HC02))
    return subscribePatrolMobileLiveSnapshot(applyMobile)
  }, [])

  useEffect(() => {
    const backendUrl = getMobileAiBackendUrl() || getVmsBackendUrl()
    const ids = cameraIds.filter(isPatrolMetricsCameraId)
    if (!backendUrl || ids.length === 0) return

    let stopped = false
    let timerId = 0

    const applyViolationHold = (current: number) => {
      const now = Date.now()
      if (current > 0) {
        lastViolationCountRef.current = current
        lastViolationAtRef.current = now
        return current
      }
      if (now - lastViolationAtRef.current <= VIOLATION_COUNT_HOLD_MS) {
        return lastViolationCountRef.current
      }
      lastViolationCountRef.current = 0
      return 0
    }

    const tick = async () => {
      if (stopped) return
      try {
        const online = await pingMobileAiBackend(backendUrl)
        if (stopped) return
        backendLiveRef.current = online
        if (!online) {
          const mobileOnly = mergeHc02Mobile(
            {
              ...EMPTY,
              personCount: sessionPeakPersonRef.current,
              uniqueWorkers: sessionPeakPersonRef.current,
            },
            getPatrolMobileLiveSnapshot(HC02),
            sessionPeakPersonRef,
          )
          baseRef.current = mobileOnly
          setMetrics(mobileOnly)
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
              personCount: Math.max(baseRef.current.personCount, sessionPeakPersonRef.current),
            },
            getPatrolMobileLiveSnapshot(HC02),
            sessionPeakPersonRef,
          )
          baseRef.current = merged
          setMetrics(merged)
          timerId = window.setTimeout(tick, pollMs * 2)
          return
        }

        const streamOnline = Boolean(snapshot.stream_online)
        const rawPersonCount = Number(snapshot.person_count ?? 0)
        const rawViolations = Number(snapshot.ppe_violations ?? 0)

        // Cộng dồn peak phiên — không cho KPI từ N về 0
        sessionPeakPersonRef.current = Math.max(
          sessionPeakPersonRef.current,
          rawPersonCount,
        )
        const personCount = Math.max(sessionPeakPersonRef.current, rawPersonCount)
        const activePpeViolations = streamOnline
          ? applyViolationHold(rawViolations)
          : applyViolationHold(0)

        const stickyPerCamera = (snapshot.cameras ?? []).map(row => {
          if (row.camera_id !== HC02) {
            return {
              ...row,
              person_count: Math.max(0, Number(row.person_count ?? 0)),
            }
          }
          const prev = baseRef.current.perCamera.find(c => c.camera_id === HC02)
          return {
            ...row,
            stream_online: Boolean(row.stream_online),
            person_count: Math.max(
              Number(row.person_count ?? 0),
              prev?.person_count ?? 0,
              sessionPeakPersonRef.current,
            ),
          }
        })

        const fromBackend: PatrolHelmetLiveMetrics = {
          backendReachable: true,
          streamOnline,
          connected: streamOnline,
          personCount,
          uniqueWorkers: personCount,
          identifiedWorkers: Math.max(
            Number(snapshot.identified_workers ?? 0),
            baseRef.current.identifiedWorkers,
          ),
          activePpeViolations,
          ppeAlertsToday: Number(snapshot.ppe_alerts_today ?? 0),
          workerNames: snapshot.worker_names ?? [],
          perCamera: stickyPerCamera,
        }
        const merged = mergeHc02Mobile(
          fromBackend,
          getPatrolMobileLiveSnapshot(HC02),
          sessionPeakPersonRef,
        )
        baseRef.current = merged
        setMetrics(merged)
        timerId = window.setTimeout(tick, pollMs)
      } catch {
        if (stopped) return
        const merged = mergeHc02Mobile(
          {
            ...baseRef.current,
            backendReachable: backendLiveRef.current,
            personCount: Math.max(baseRef.current.personCount, sessionPeakPersonRef.current),
          },
          getPatrolMobileLiveSnapshot(HC02),
          sessionPeakPersonRef,
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
      lastViolationCountRef.current = 0
      lastViolationAtRef.current = 0
      // Giữ sessionPeak khi remount effect (cameraIds đổi) — reset khi unmount hook
      sessionPeakPersonRef.current = 0
    }
  }, [cameraIds.join(','), pollMs])

  return metrics
}
