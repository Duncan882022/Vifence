import { getHelmetWhepUrl } from '@/modules/module05-productivity/data/helmetIngest'
import { getPatrolHelmetStreamUrl } from '@/modules/module05-productivity/data/patrolHelmetStreams'

export interface H1Endpoints {
  whepUrl?: string
  hlsUrl?: string
}

export function h1Endpoints(helmetId: string): H1Endpoints {
  return { whepUrl: getHelmetWhepUrl(helmetId), hlsUrl: getPatrolHelmetStreamUrl(helmetId) }
}

export interface H1DeviceStatus {
  helmetId: string
  configured: boolean
  online: boolean
  /** Pin / bộ nhớ / sẵn sàng ghi: API thiết bị chưa có — giá trị MOCK. */
  batteryPct: number
  storageFreeGb: number
  recordingReady: boolean
  checkedAt: string
}

/** Online thật = MediaMTX đang có luồng publish của mũ (playlist HLS trả 200). */
export async function probeH1Online(helmetId: string, timeoutMs = 6000): Promise<boolean> {
  const { hlsUrl } = h1Endpoints(helmetId)
  if (!hlsUrl) return false
  try {
    const res = await fetch(hlsUrl, { method: 'GET', mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

export async function readH1Status(helmetId: string): Promise<H1DeviceStatus> {
  const { whepUrl, hlsUrl } = h1Endpoints(helmetId)
  const online = await probeH1Online(helmetId)
  return {
    helmetId,
    configured: Boolean(whepUrl || hlsUrl),
    online,
    batteryPct: 86,
    storageFreeGb: 41.2,
    recordingReady: true,
    checkedAt: new Date().toISOString(),
  }
}
