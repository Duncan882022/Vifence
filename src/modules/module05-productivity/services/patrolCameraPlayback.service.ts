import dayjs from 'dayjs'
import type {
  CameraDetection,
  CameraPlaybackRecord,
  CameraDetectionsResponse,
  CameraPlaybackRecordsResponse,
} from '@/types/cameraPlayback'
import { getPatrolHelmetStreamUrl } from '../data/patrolHelmetStreams'
import { MOCK_PATROL_EVENTS, type PatrolEvent } from '../data/patrolMockData'
import { PATROL_CAMERAS } from '../data/patrolCameras'

function eventSeekSec(iso: string): number {
  const d = dayjs(iso)
  return d.hour() * 3600 + d.minute() * 60 + d.second()
}

function patrolEventToRecord(ev: PatrolEvent): CameraPlaybackRecord {
  return {
    id: ev.id,
    name: ev.violationLabel,
    startTime: ev.startedAt,
    endTime: ev.endedAt ?? dayjs(ev.lockedAt).add(2, 'minute').toISOString(),
    type: 'event',
    videoUrl: getPatrolHelmetStreamUrl(ev.cameraId),
    seekSec: eventSeekSec(ev.lockedAt),
    clipDurationSec: 20,
    thumbnailUrl: undefined,
  }
}

function buildContinuousRecord(cameraId: string, date: string): CameraPlaybackRecord {
  const cam = PATROL_CAMERAS.find(c => c.id === cameraId)
  return {
    id: `${cameraId}-${date}-continuous`,
    name: 'Ghi hình tuần tra',
    startTime: `${date}T08:00:00+07:00`,
    endTime: `${date}T17:00:00+07:00`,
    type: 'continuous',
    videoUrl: cam?.streamUrl,
  }
}

export function getPatrolDefaultPlaybackDate(): string {
  return '2026-08-20'
}

export async function fetchPatrolCameraRecords(
  cameraId: string,
  params: { startDate: string; endDate: string },
): Promise<CameraPlaybackRecordsResponse> {
  const date = dayjs(params.startDate).format('YYYY-MM-DD')
  const events = MOCK_PATROL_EVENTS
    .filter(ev => ev.cameraId === cameraId && ev.startedAt.startsWith(date.slice(0, 10)))
    .map(patrolEventToRecord)

  return {
    items: [buildContinuousRecord(cameraId, date), ...events],
  }
}

export async function fetchPatrolRecordDetections(recordId: string): Promise<CameraDetectionsResponse> {
  const ev = MOCK_PATROL_EVENTS.find(e => e.id === recordId)
  if (!ev) return { items: [] }

  const items: CameraDetection[] = [
    {
      id: `${ev.id}-det`,
      label: ev.type === 'PERSON_DETECTED' ? 'person' : 'identity',
      confidenceScore: Math.round(ev.confidence * 100),
      detectionResult: ev.violationLabel,
      createdAt: ev.lockedAt,
    },
  ]
  return { items }
}
