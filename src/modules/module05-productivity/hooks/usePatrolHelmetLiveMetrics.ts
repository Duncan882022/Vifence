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
  /** Khung hiện tại — detection gate, không phải KPI ngày (xem usePatrolDayBundle). */
  personCount: number
  /** @deprecated alias của personCount — khung hiện tại */
  uniqueWorkers: number
  identifiedWorkers: number
  personEventsToday: number
  workerNames: string[]
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

  const hc02Slice: PatrolHelmetCameraMetricsSlice = {
    camera_id: HC02,
    stream_online: true,
    person_count: Math.max(0, mobile.personCount),
    identified_workers: Math.max(mobile.identifiedWorkers, prevSlice?.identified_workers ?? 0),
    person_events_today: prevSlice?.person_events_today ?? 0,
  }
  if (idxBase >= 0) perCameraBase[idxBase] = { ...perCameraBase[idxBase], ...hc02Slice }
  else perCameraBase.push(hc02Slice)

  const framePersonCount = perCameraBase.reduce(
    (s, c) => s + Math.max(0, Number(c.person_count ?? 0)),
    0,
  )

  const names = [
    ...new Set([...(base.workerNames ?? []), ...mobile.workerNames]),
  ].slice(0, 8)

  const anyOnline = perCameraBase.some(c => Boolean(c.stream_online))

  return {
    ...base,
    backendReachable: true,
    streamOnline: anyOnline,
    connected: anyOnline,
    personCount: framePersonCount,
    uniqueWorkers: framePersonCount,
    identifiedWorkers: Math.max(base.identifiedWorkers, mobile.identifiedWorkers),
    workerNames: names,
    perCamera: perCameraBase,
  }
}

/** Trạng thái luồng live — KPI đếm lấy từ usePatrolDayBundle.stats. */
export function usePatrolHelmetLiveMetrics(
  cameraIds: readonly string[] = DEFAULT_PATROL_CAMERA_IDS,
  pollMs = 2200,
): PatrolHelmetLiveMetrics {
  const [metrics, setMetrics] = useState<PatrolHelmetLiveMetrics>(EMPTY)
  const backendLiveRef = useRef(false)
  const baseRef = useRef<PatrolHelmetLiveMetrics>(EMPTY)

  useEffect(() => {
    const applyMobile = (snap: PatrolMobileLiveSnapshot | null) => {
      setMetrics(
        mergeHc02Mobile(
          baseRef.current,
          snap ?? getPatrolMobileLiveSnapshot(HC02),
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

        const snapshot = await fetchPatrolHelmetAggregateMetrics(ids, backendUrl)
        if (stopped) return

        if (!snapshot) {
          const merged = mergeHc02Mobile(
            { ...baseRef.current, backendReachable: online },
            getPatrolMobileLiveSnapshot(HC02),
          )
          baseRef.current = merged
          setMetrics(merged)
          timerId = window.setTimeout(tick, pollMs * 2)
          return
        }

        const streamOnline = Boolean(snapshot.stream_online)
        const perCamera = (snapshot.cameras ?? []).map(row => ({
          ...row,
          stream_online: Boolean(row.stream_online),
          person_count: Math.max(0, Number(row.person_count ?? 0)),
        }))
        const framePersonCount = perCamera.reduce(
          (s, c) => s + Math.max(0, Number(c.person_count ?? 0)),
          0,
        )

        const fromBackend: PatrolHelmetLiveMetrics = {
          backendReachable: online || Boolean(snapshot.backend_reachable),
          streamOnline,
          connected: streamOnline,
          personCount: framePersonCount,
          uniqueWorkers: framePersonCount,
          identifiedWorkers: Number(snapshot.identified_workers ?? 0),
          personEventsToday: Number(snapshot.person_events_today ?? 0),
          workerNames: snapshot.worker_names ?? [],
          perCamera,
        }
        const merged = mergeHc02Mobile(fromBackend, getPatrolMobileLiveSnapshot(HC02))
        baseRef.current = merged
        setMetrics(merged)
        timerId = window.setTimeout(tick, pollMs)
      } catch {
        if (stopped) return
        const merged = mergeHc02Mobile(
          { ...baseRef.current, backendReachable: backendLiveRef.current },
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
    }
  }, [cameraIds.join(','), pollMs])

  return metrics
}
