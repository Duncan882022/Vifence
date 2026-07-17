import { create } from 'zustand'
import { fetchCameras, fetchAiWorkers } from '@/api/camera.api'
import { getGhpagesDemoCameras, IS_GHPAGES } from '../services/ghpagesDemo.service'
import type { CameraWithWorker } from './cameraStore.types'

export type CameraFetchStatus = 'idle' | 'loading' | 'success' | 'error'

interface CameraStore {
  cameras: CameraWithWorker[]
  status: CameraFetchStatus
  error: string | null
  fetch: () => Promise<void>
  refetch: () => Promise<void>
}

async function loadCameras(
  set: (partial: Partial<CameraStore>) => void,
) {
  if (IS_GHPAGES) {
    set({ cameras: getGhpagesDemoCameras(), status: 'success', error: null })
    return
  }

  set({ status: 'loading', error: null })
  try {
    const camRes = await fetchCameras({ limit: 100 })

    let workerMap = new Map<string, Awaited<ReturnType<typeof fetchAiWorkers>>['items'][number]>()
    try {
      const workerRes = await fetchAiWorkers()
      workerMap = new Map(workerRes.items.map(w => [w.id, w]))
    } catch {
      // Vision API không có /ai-workers — dùng worker nhúng trong từng camera
    }

    const enriched: CameraWithWorker[] = camRes.items.map(cam => {
      const embedded = cam.worker ?? null
      const worker = cam.workerId
        ? (workerMap.get(cam.workerId) ?? embedded)
        : embedded
      
      let wsUrl: string | null = null
      if (worker?.socket) {
        let socketUrl = worker.socket
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
        const baseSocket = socketUrl.replace(/\/$/, '')
        wsUrl = `${baseSocket}/${cam.id}`
      }
      return { ...cam, worker, wsUrl }
    })

    set({ cameras: enriched, status: 'success', error: null })
  } catch (e) {
    set({
      cameras: [],
      status: 'error',
      error: e instanceof Error ? e.message : 'Lỗi tải danh sách camera',
    })
  }
}

export const useCameraStore = create<CameraStore>((set, get) => ({
  cameras: [],
  status: 'idle',
  error: null,

  fetch: async () => {
    const { status } = get()
    if (status === 'loading' || status === 'success') return
    await loadCameras(set)
  },

  refetch: async () => {
    if (get().status === 'loading') return
    await loadCameras(set)
  },
}))
