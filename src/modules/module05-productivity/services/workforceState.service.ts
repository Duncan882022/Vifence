/**
 * Poll /patrol/workforce/state — temporary substitute for HELMET/OBJECT/POPULATION/EVENT WS.
 */
import { fetchPatrol, patrolBackendBase } from '@/services/patrolApiClient'
import {
  EMPTY_WORKFORCE_SNAPSHOT,
  type WorkforceSnapshot,
} from '../types/workforceHeatmap'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

let apiAvailable: boolean | null = null

export async function fetchWorkforceSnapshot(
  cameras: string[] = ['HC-01', 'HC-02'],
  backendUrl?: string,
): Promise<WorkforceSnapshot | null> {
  const base = (backendUrl || patrolBackendBase() || '').replace(/\/$/, '')
  if (!base) return null
  if (apiAvailable === false) return null

  const qs = encodeURIComponent(cameras.join(','))
  try {
    const data = await fetchPatrol<WorkforceSnapshot>(
      `/patrol/workforce/state?cameras=${qs}`,
      { headers: TUNNEL_HEADERS },
    )
    if (!data) {
      // Route tồn tại nhưng thiếu JWT — không cache unavailable (auth có thể sửa sau).
      return null
    }
    apiAvailable = true
    return {
      helmets: data.helmets ?? {},
      objects: data.objects ?? {},
      zonePopulation: data.zonePopulation ?? {},
      heatPoints: data.heatPoints ?? [],
      events: data.events ?? [],
      server_time: data.server_time ?? new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export { EMPTY_WORKFORCE_SNAPSHOT }
