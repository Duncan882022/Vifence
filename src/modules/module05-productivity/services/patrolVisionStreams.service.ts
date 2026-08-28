/**
 * Vision wsUrl cho patrol — không kéo dao-tao cameraStore vào Module 05.
 * Chỉ gọi khi chưa cấu hình MediaMTX (legacy JSMpeg dev).
 */
import { fetchAiWorkers, fetchCameras } from '@/api/camera.api'

export interface PatrolVisionStreamCamera {
  id: string
  rtspUrl?: string
  wsUrl?: string | null
}

function resolveWorkerWsUrl(socket: string): string {
  let socketUrl = socket
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'https:') {
      socketUrl = socketUrl.replace(/^ws:\/\//i, 'wss://')
    } else if (window.location.protocol === 'http:') {
      socketUrl = socketUrl.replace(/^wss:\/\//i, 'ws://')
    }
    if (socketUrl && !socketUrl.startsWith('ws://') && !socketUrl.startsWith('wss://')) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socketUrl = `${protocol}//${socketUrl}`
    }
  }
  return socketUrl
}

export async function fetchPatrolVisionStreamCameras(): Promise<PatrolVisionStreamCamera[]> {
  try {
    const camRes = await fetchCameras({ limit: 100 })
    let workerMap = new Map<string, Awaited<ReturnType<typeof fetchAiWorkers>>['items'][number]>()
    try {
      const workerRes = await fetchAiWorkers()
      workerMap = new Map(workerRes.items.map(w => [w.id, w]))
    } catch {
      // Vision API không có /ai-workers
    }

    return camRes.items.map(cam => {
      const worker = cam.workerId
        ? (workerMap.get(cam.workerId) ?? cam.worker ?? null)
        : (cam.worker ?? null)
      const wsUrl = worker?.socket ? resolveWorkerWsUrl(worker.socket) : null
      return {
        id: cam.id,
        rtspUrl: cam.rtspUrl,
        wsUrl,
      }
    })
  } catch {
    return []
  }
}
