import dayjs from 'dayjs'
import type {
  CameraDetection,
  CameraPlaybackRecord,
  CameraPlaybackRecordsResponse,
  CameraDetectionsResponse,
} from '@/types/cameraPlayback'
import { MOCK_TRAINING_CAMERAS } from '@/modules/module02-training/data/trainingCameras'

const DEMO_DATE = '2026-06-24'

function buildContinuousRecord(cameraId: string, date: string, videoUrl?: string): CameraPlaybackRecord {
  return {
    id: `${cameraId}-${date}-continuous`,
    name: 'Ghi hình liên tục',
    startTime: `${date}T06:00:00`,
    endTime: `${date}T18:00:00`,
    type: 'continuous',
    videoUrl,
  }
}

function buildTrainingEventRecords(cameraId: string, date: string): CameraPlaybackRecord[] {
  const cam = MOCK_TRAINING_CAMERAS.find(c => c.id === cameraId)
  if (!cam) return []

  const events: CameraPlaybackRecord[] = []
  if (cam.courseName) {
    events.push({
      id: `${cameraId}-${date}-checkin`,
      name: `Check-in · ${cam.courseName}`,
      startTime: `${date}T07:58:00`,
      endTime: `${date}T08:02:00`,
      type: 'event',
      videoUrl: cam.streamUrl,
      seekSec: 30,
    })
    events.push({
      id: `${cameraId}-${date}-session`,
      name: `Ca học · ${cam.courseName}`,
      startTime: `${date}T08:15:00`,
      endTime: `${date}T08:25:00`,
      type: 'event',
      videoUrl: cam.streamUrl,
      seekSec: 45,
    })
  }

  return events
}

export async function fetchCameraRecords(
  cameraId: string,
  params: { startDate: string; endDate: string },
): Promise<CameraPlaybackRecordsResponse> {
  const date = dayjs(params.startDate).format('YYYY-MM-DD')
  const cam = MOCK_TRAINING_CAMERAS.find(c => c.id === cameraId)
  const videoUrl = cam?.streamUrl

  const items: CameraPlaybackRecord[] = [
    buildContinuousRecord(cameraId, date, videoUrl),
    ...buildTrainingEventRecords(cameraId, date),
  ]

  return { items }
}

export async function fetchRecordDetections(recordId: string): Promise<CameraDetectionsResponse> {
  if (recordId.includes('checkin') || recordId.includes('session')) {
    const items: CameraDetection[] = [
      {
        id: `${recordId}-d1`,
        label: 'person',
        confidenceScore: 94,
        detectionResult: 'Nhận diện học viên tại khu vực đào tạo',
        createdAt: dayjs().hour(8).minute(0).second(12).toISOString(),
      },
      {
        id: `${recordId}-d2`,
        label: 'helmet',
        confidenceScore: 88,
        detectionResult: 'Đội mũ bảo hộ đúng quy định',
        createdAt: dayjs().hour(8).minute(0).second(18).toISOString(),
      },
    ]
    return { items }
  }

  return { items: [] }
}

export function getDefaultPlaybackDate(): string {
  return DEMO_DATE
}
