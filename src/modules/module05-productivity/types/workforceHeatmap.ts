/**
 * Module 05 — Realtime Workforce Heatmap types
 * docs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md
 */

export type ObservationMode = 'FULL_BODY' | 'UPPER_BODY' | 'FACE_CLOSEUP' | 'PARTIAL_BODY'
export type IdentityStatus = 'UNKNOWN' | 'VERIFIED' | 'DEDUPLICATED'
export type ObjectLiveStatus = 'ACTIVE' | 'RECENTLY_OBSERVED' | 'EXPIRED'
export type ObservabilityBand = 'HIGH' | 'MEDIUM' | 'LOW'

export type WorkforceEventType =
  | 'POPULATION_OBSERVED'
  | 'POPULATION_CHANGE'
  | 'HIGH_DENSITY'
  | 'IDENTITY_VERIFIED'
  | 'OBJECT_MERGED'
  | 'PPE_VIOLATION'
  | 'MACHINE_STOPPED'

export interface HelmetState {
  type: 'HELMET_STATE'
  helmet_id: string
  timestamp: string
  lat: number | null
  lon: number | null
  heading: number | null
  pitch?: number | null
  roll?: number | null
  zone_id: string
  online: boolean
}

export interface ObjectState {
  type: 'OBJECT_STATE'
  object_id: string
  status: ObjectLiveStatus
  identity_status: IdentityStatus
  worker_id: string | null
  worker_name: string | null
  lat: number | null
  lon: number | null
  position_confidence: number
  observation_mode: ObservationMode
  last_seen: string
  first_seen: string
  helmet_id: string
  zone_id: string
  possible_matches?: Array<{
    candidate_object_id: string
    reid_similarity: number
    spatial_temporal_overlap: number
  }>
}

export interface ZonePopulationState {
  zone_id: string
  timestamp: string
  observed_count: number
  observability: number
  observability_band: ObservabilityBand
  breakdown: {
    full_body_count: number
    upper_body_count: number
    verified_identities: number
    unknown_objects: number
  }
  helmet_references: string[]
  kpi: {
    current: number
    average: number
    peak: number
  }
}

export interface HeatPointState {
  lat: number
  lon: number
  weight: number
  timestamp: string
  zone_id: string
  object_id: string
}

export interface WorkforceEventState {
  type: 'EVENT'
  event_id: string
  event_type: WorkforceEventType
  zone_id: string
  severity: string
  timestamp: string
  title: string
  description: string
  payload: Record<string, unknown>
  helmet_id?: string | null
}

export interface WorkforceSnapshot {
  helmets: Record<string, HelmetState>
  objects: Record<string, ObjectState>
  zonePopulation: Record<string, ZonePopulationState>
  heatPoints: HeatPointState[]
  events: WorkforceEventState[]
  server_time: string
}

export const EMPTY_WORKFORCE_SNAPSHOT: WorkforceSnapshot = {
  helmets: {},
  objects: {},
  zonePopulation: {},
  heatPoints: [],
  events: [],
  server_time: new Date().toISOString(),
}
