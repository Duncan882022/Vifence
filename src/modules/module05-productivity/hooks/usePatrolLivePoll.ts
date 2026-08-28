import { useEffect, useRef, useState } from 'react'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import { subscribePatrolMobileLiveSnapshot } from '@/services/patrolMobileMetricsBridge'
import { DEFAULT_PATROL_CAMERA_IDS } from '../data/patrolCameras'
import { isPatrolMetricsCameraId } from '../data/patrolHelmetScope'
import { createPatrolLiveFeed } from '../services/patrolLiveFeed.service'
import type { PatrolHelmetAggregateMetricsResponse } from '../services/patrolLiveEvents.service'
import type { WorkforceSnapshot } from '../types/workforceHeatmap'
import { EMPTY_WORKFORCE_SNAPSHOT } from '../services/workforceState.service'
import {
  EMPTY_PATROL_HELMET_LIVE_METRICS,
  hc02MobileSnapshot,
  mergeHc02Mobile,
  type PatrolHelmetLiveMetrics,
} from './patrolHelmetLiveMetricsState'

/** Fallback HTTP poll khi WebSocket không khả dụng. */
export const PATROL_LIVE_POLL_MS = 2500

export interface PatrolLivePollState {
  liveMetrics: PatrolHelmetLiveMetrics
  workforceSnap: WorkforceSnapshot
}

function metricsFromSnapshot(snapshot: PatrolHelmetAggregateMetricsResponse): PatrolHelmetLiveMetrics {
  const streamOnline = Boolean(snapshot.stream_online)
  const perCamera = (snapshot.cameras ?? []).map(row => ({
    ...row,
    stream_online: Boolean(row.stream_online),
    person_count: Math.max(0, Number(row.person_count ?? 0)),
  }))
  return {
    backendReachable: Boolean(snapshot.backend_reachable) || streamOnline,
    streamOnline,
    perCamera,
  }
}

/**
 * Live metrics + workforce — ưu tiên WS `/ws/patrol/live`, fallback HTTP live/bundle.
 */
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
    const workforceIds = [...new Set(workforceCameras.map(c => c.trim()).filter(Boolean))]
    const bundleIds = [...new Set([...ids, ...workforceIds])]
    if (!backendUrl || bundleIds.length === 0) return

    const applyMetrics = (fromBackend: PatrolHelmetLiveMetrics) => {
      const merged = mergeHc02Mobile(fromBackend, hc02MobileSnapshot())
      baseRef.current = merged
      setLiveMetrics(merged)
    }

    const feed = createPatrolLiveFeed({
      cameraIds: bundleIds,
      backendUrl,
      pollIntervalMs: pollMs,
      onPayload: ({ metrics, workforce }) => {
        setWorkforceSnap(workforce)
        applyMetrics(metricsFromSnapshot(metrics))
      },
    })

    return () => feed.stop()
  }, [metricsCameraIds.join(','), workforceCameras.join(','), pollMs])

  return { liveMetrics, workforceSnap }
}
