import { useEffect, useMemo, useState } from 'react'
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
  subscribePatrolHelmetGps,
} from '@/services/patrolHelmetGpsBridge'
import {
  getPatrolStreamTelemetryBundle,
  subscribePatrolStreamTelemetryBundle,
} from '@/services/patrolStreamTelemetryBridge'
import { formatPatrolStreamTelemetryDatetime } from '../utils/patrolStreamTelemetryFormat'
import { resolvePatrolCameraStreamTelemetry } from '../utils/patrolStreamTelemetry'

export interface PatrolCameraStreamTelemetryView {
  datetimeVn: string
  lat: number | null
  lng: number | null
  heading: number | null
  gpsPending: boolean
}

export function usePatrolCameraStreamTelemetry(
  cameraId: string,
  streamOnline: boolean,
): PatrolCameraStreamTelemetryView {
  const [bundleTick, setBundleTick] = useState(0)
  const [gpsTick, setGpsTick] = useState(0)
  const [clockMs, setClockMs] = useState(() => Date.now())

  useEffect(() => subscribePatrolStreamTelemetryBundle(() => {
    setBundleTick(t => t + 1)
  }), [])

  useEffect(() => subscribePatrolHelmetGps(snap => {
    if (snap.cameraId === cameraId) setGpsTick(t => t + 1)
  }), [cameraId])

  useEffect(() => {
    if (!streamOnline) return
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [streamOnline])

  return useMemo(() => {
    const bundle = getPatrolStreamTelemetryBundle()
    const bridge = getPatrolHelmetGps(cameraId) ?? getPatrolHelmetGpsLastKnown(cameraId)
    const resolved = resolvePatrolCameraStreamTelemetry(cameraId, {
      metrics: bundle.metricsByCamera[cameraId] ?? null,
      helmet: bundle.helmets[cameraId] ?? null,
      bridge,
    })

    const anchorMs = bundle.serverTimeMs ?? clockMs
    const elapsed = streamOnline ? Math.max(0, clockMs - (bundle.serverTimeMs ?? clockMs)) : 0
    const displayDate = new Date(anchorMs + elapsed)

    return {
      datetimeVn: formatPatrolStreamTelemetryDatetime(displayDate),
      lat: resolved.lat,
      lng: resolved.lng,
      heading: resolved.heading,
      gpsPending: resolved.gpsPending,
    }
  }, [cameraId, streamOnline, clockMs, bundleTick, gpsTick])
}
