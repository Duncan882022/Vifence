import { useEffect, useRef, useState } from 'react'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import { subscribePatrolMobileLiveSnapshot } from '@/services/patrolMobileMetricsBridge'
import { DEFAULT_PATROL_CAMERA_IDS } from '../data/patrolCameras'
import { isPatrolMetricsCameraId } from '../data/patrolHelmetScope'
import { fetchPatrolHelmetAggregateMetrics } from '../services/patrolLiveEvents.service'
import {
  EMPTY_WORKFORCE_SNAPSHOT,
  fetchWorkforceSnapshot,
} from '../services/workforceState.service'
import type { WorkforceSnapshot } from '../types/workforceHeatmap'
import {
  EMPTY_PATROL_HELMET_LIVE_METRICS,
  hc02MobileSnapshot,
  mergeHc02Mobile,
  type PatrolHelmetLiveMetrics,
} from './patrolHelmetLiveMetricsState'

/** Một nhịp poll cho metrics + workforce — thay 2.2s + 2s riêng lẻ. */
export const PATROL_LIVE_POLL_MS = 2500

export interface PatrolLivePollState {
  liveMetrics: PatrolHelmetLiveMetrics
  workforceSnap: WorkforceSnapshot
}

/** Poll gom metrics mũ/flycam + workforce state trên cùng scheduler. */
export function usePatrolLivePoll(
  metricsCameraIds: readonly string[] = DEFAULT_PATROL_CAMERA_IDS,
  workforceCameras: string[] = ['HC-01', 'HC-02'],
  pollMs = PATROL_LIVE_POLL_MS,
): PatrolLivePollState {
  const [liveMetrics, setLiveMetrics] = useState<PatrolHelmetLiveMetrics>(
    EMPTY_PATROL_HELMET_LIVE_METRICS,
  )
  const [workforceSnap, setWorkforceSnap] = useState<WorkforceSnapshot>(
    EMPTY_WORKFORCE_SNAPSHOT,
  )
  const baseRef = useRef<PatrolHelmetLiveMetrics>(EMPTY_PATROL_HELMET_LIVE_METRICS)

  useEffect(() => {
    const applyMobile = () => {
      setLiveMetrics(mergeHc02Mobile(baseRef.current, hc02MobileSnapshot()))
    }
    applyMobile()
    return subscribePatrolMobileLiveSnapshot(applyMobile)
  }, [])

  useEffect(() => {
    const backendUrl = getMobileAiBackendUrl() || getVmsBackendUrl()
    const ids = metricsCameraIds.filter(isPatrolMetricsCameraId)
    if (!backendUrl || ids.length === 0) return

    let stopped = false
    let timerId = 0

    const applyMetrics = (fromBackend: PatrolHelmetLiveMetrics) => {
      const merged = mergeHc02Mobile(fromBackend, hc02MobileSnapshot())
      baseRef.current = merged
      setLiveMetrics(merged)
    }

    const tick = async () => {
      if (stopped) return
      try {
        const [snapshot, workforce] = await Promise.all([
          fetchPatrolHelmetAggregateMetrics(ids, backendUrl),
          fetchWorkforceSnapshot(workforceCameras, backendUrl),
        ])
        if (stopped) return

        if (workforce) setWorkforceSnap(workforce)

        if (!snapshot) {
          applyMetrics({ ...baseRef.current, backendReachable: false })
          timerId = window.setTimeout(tick, pollMs * 2)
          return
        }

        const streamOnline = Boolean(snapshot.stream_online)
        const perCamera = (snapshot.cameras ?? []).map(row => ({
          ...row,
          stream_online: Boolean(row.stream_online),
          person_count: Math.max(0, Number(row.person_count ?? 0)),
        }))

        applyMetrics({
          backendReachable: Boolean(snapshot.backend_reachable) || streamOnline,
          streamOnline,
          perCamera,
        })
        timerId = window.setTimeout(tick, pollMs)
      } catch {
        if (stopped) return
        applyMetrics(baseRef.current)
        timerId = window.setTimeout(tick, pollMs * 2)
      }
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timerId)
    }
  }, [metricsCameraIds.join(','), workforceCameras.join(','), pollMs])

  return { liveMetrics, workforceSnap }
}
