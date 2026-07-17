import type { CameraApiItem, AiWorkerApiItem } from '@/api/camera.api'

export interface CameraWithWorker extends CameraApiItem {
  worker: AiWorkerApiItem | null
  wsUrl: string | null
}
