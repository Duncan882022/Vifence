/**
 * Poll /patrol/workforce/state — temporary substitute for HELMET/OBJECT/POPULATION/EVENT WS.
 */
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
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
  const base = (backendUrl || getMobileAiBackendUrl() || getVmsBackendUrl() || '').replace(/\/$/, '')
  if (!base) return null
  if (apiAvailable === false) return null

  const qs = encodeURIComponent(cameras.join(','))
  try {
    const res = await fetch(`${base}/patrol/workforce/state?cameras=${qs}`, {
      headers: TUNNEL_HEADERS,
      cache: 'no-store',
    })
    if (res.status === 404) {
      apiAvailable = false
      return null
    }
    if (!res.ok) return null
    apiAvailable = true
    const data = (await res.json()) as WorkforceSnapshot
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

export function resetWorkforceApiAvailability(): void {
  apiAvailable = null
}

export { EMPTY_WORKFORCE_SNAPSHOT }
