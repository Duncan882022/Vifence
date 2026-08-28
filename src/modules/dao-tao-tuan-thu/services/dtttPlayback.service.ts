import dayjs from 'dayjs'
import { MEDIA_BASE_URL } from '@/config'
import type { CameraRecordItem } from '@/api/camera.api'
import { fetchCameraRecords, fetchDetectedObjects } from '@/api/camera.api'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { CameraDetection, CameraPlaybackRecord } from '@/types/cameraPlayback'
import type { CameraWithWorker } from '../hooks/useCameras'

export function mapDtttCamerasToTraining(cameras: CameraWithWorker[]): TrainingCamera[] {
  return cameras.map(cam => ({
    id: cam.id,
    name: cam.name,
    location: cam.address?.trim() || 'Khác',
    zone: cam.address?.trim() || '',
    status: cam.status === 'stopped' ? 'offline' as const : 'online' as const,
    streamType: 'fixed' as const,
    assignee: cam.worker?.name,
    wsUrl: cam.wsUrl ?? undefined,
  }))
}

function mapDtttRecord(item: CameraRecordItem): CameraPlaybackRecord {
  const type = item.type === 'event' ? 'event' as const : 'continuous' as const
  const videoUrl = item.videoId ? `${MEDIA_BASE_URL}/ai-data/${item.videoId}` : undefined
  const thumbnailUrl = item.thumbnailId ? `${MEDIA_BASE_URL}/ai-data/${item.thumbnailId}` : undefined
  return {
    id: item.id,
    name: item.name || item.description || 'Ghi hình',
    startTime: item.startTime,
    endTime: item.endTime,
    type,
    videoUrl,
    videoId: item.videoId,
    thumbnailUrl,
  }
}

export async function fetchDtttPlaybackRecords(
  cameraId: string,
  params: { startDate: string; endDate: string },
) {
  const start = dayjs(params.startDate).startOf('day').toISOString()
  const end = dayjs(params.endDate).endOf('day').toISOString()
  const res = await fetchCameraRecords(cameraId, { startDate: start, endDate: end })
  return { items: (res.items ?? []).map(mapDtttRecord) }
}

export async function fetchDtttPlaybackDetections(recordId: string) {
  const res = await fetchDetectedObjects(recordId)
  const items: CameraDetection[] = (res.items ?? []).map(item => ({
    id: item.id,
    label: item.label,
    confidenceScore: item.confidenceScore,
    detectionResult: item.detectionResult,
    createdAt: item.createdAt,
  }))
  return { items }
}
