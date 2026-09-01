import type { PatrolHelmetCameraMetricsSlice } from '@/modules/module05-productivity/services/patrolLiveEvents.service'
import type { HelmetState } from '@/modules/module05-productivity/types/workforceHeatmap'

export interface PatrolStreamTelemetryBundle {
  serverTimeMs: number | null
  metricsByCamera: Record<string, PatrolHelmetCameraMetricsSlice>
  helmets: Record<string, HelmetState>
}

let bundle: PatrolStreamTelemetryBundle = {
  serverTimeMs: null,
  metricsByCamera: {},
  helmets: {},
}

const listeners = new Set<() => void>()

export function setPatrolStreamTelemetryBundle(next: PatrolStreamTelemetryBundle): void {
  bundle = next
  listeners.forEach(fn => fn())
}

export function getPatrolStreamTelemetryBundle(): PatrolStreamTelemetryBundle {
  return bundle
}

export function subscribePatrolStreamTelemetryBundle(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
