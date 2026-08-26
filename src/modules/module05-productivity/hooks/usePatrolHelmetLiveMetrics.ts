import { useEffect, useRef, useState } from 'react'
import { getMobileAiBackendUrl, pingMobileAiBackend } from '@/modules/module02-training/services/mobileAiBackend.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import {
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
  type PatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import { DEFAULT_PATROL_CAMERA_IDS } from '../data/patrolCameras'
import { isPatrolMetricsCameraId } from '../data/patrolHelmetScope'
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
  personEventsToday: number
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
  personEventsToday: 0,
  workerNames: [],
  perCamera: [],
}

const HC02 = 'HC-02'

function mergeHc02Mobile(
  base: PatrolHelmetLiveMetrics,
  mobile: PatrolMobileLiveSnapshot | null,
  sessionPeakRef: { current: number },
): PatrolHelmetLiveMetrics {
  if (!mobile || mobile.cameraId !== HC02) return base
  if (Date.now() - mobile.updatedAt > 45_000) return base

  const perCameraBase = [...base.perCamera]
  const idxBase = perCameraBase.findIndex(c => c.camera_id === HC02)
  const prevSlice = idxBase >= 0 ? perCameraBase[idxBase] : null

  if (!mobile.streamOnline) {
    const hc02Offline: PatrolHelmetCameraMetricsSlice = {
      camera_id: HC02,
      stream_online: false,
      person_count: 0,
      identified_workers: 0,
      person_events_today: prevSlice?.person_events_today ?? 0,
    }
    if (idxBase >= 0) perCameraBase[idxBase] = { ...perCameraBase[idxBase], ...hc02Offline }
    else perCameraBase.push(hc02Offline)

    const anyOtherOnline = perCameraBase.some(
      c => c.camera_id !== HC02 && Boolean(c.stream_online),
    )
    return {
      ...base,
      streamOnline: anyOtherOnline,
      connected: anyOtherOnline,
      perCamera: perCameraBase,
    }
  }

  const hc02Person = Math.max(
    mobile.peakPersonCount,
    mobile.personCount,
    prevSlice?.person_count ?? 0,
  )
  sessionPeakRef.current = Math.max(sessionPeakRef.current, hc02Person)

  const hc02Slice: PatrolHelmetCameraMetricsSlice = {
    camera_id: HC02,
    stream_online: true,
    person_count: Math.max(hc02Person, sessionPeakRef.current),
    identified_workers: Math.max(mobile.identifiedWorkers, prevSlice?.identified_workers ?? 0),
    person_events_today: prevSlice?.person_events_today ?? 0,
  }
  if (idxBase >= 0) perCameraBase[idxBase] = { ...perCameraBase[idxBase], ...hc02Slice }
  else perCameraBase.push(hc02Slice)

  const othersPerson = perCameraBase
    .filter(c => c.camera_id !== HC02)
    .reduce((s, c) => s + Math.max(0, c.person_count), 0)

  const personCount = Math.max(
    sessionPeakRef.current,
    othersPerson + hc02Slice.person_count,
    base.personCount,
  )
  sessionPeakRef.current = personCount

  const names = [
    ...new Set([...(base.workerNames ?? []), ...mobile.workerNames]),
  ].slice(0, 8)

  const anyOnline = perCameraBase.some(c => Boolean(c.stream_online))

  return {
    ...base,
    backendReachable: true,
    streamOnline: anyOnline,
    connected: anyOnline,
    personCount,
    uniqueWorkers: personCount,
    identifiedWorkers: Math.max(base.identifiedWorkers, mobile.identifiedWorkers),
    workerNames: names,
    perCamera: perCameraBase,
  }
}

/** Live KPI Module 05 — backend aggregate + bridge HC-02 mobile cùng tab. */
export function usePatrolHelmetLiveMetrics(
  cameraIds: readonly string[] = DEFAULT_PATROL_CAMERA_IDS,
  pollMs = 2200,
): PatrolHelmetLiveMetrics {
  const [metrics, setMetrics] = useState<PatrolHelmetLiveMetrics>(EMPTY)
  const backendLiveRef = useRef(false)
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

        sessionPeakPersonRef.current = Math.max(
          sessionPeakPersonRef.current,
          rawPersonCount,
        )
        const personCount = Math.max(sessionPeakPersonRef.current, rawPersonCount)

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
          personEventsToday: Number(snapshot.person_events_today ?? 0),
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
      sessionPeakPersonRef.current = 0
    }
  }, [cameraIds.join(','), pollMs])

  return metrics
}
