import dayjs from 'dayjs'
import type {
  CameraDetection,
  CameraPlaybackRecord,
  CameraDetectionsResponse,
  CameraPlaybackRecordsResponse,
} from '@/types/cameraPlayback'
import { getAllSafetyRecords } from './safetyDashboard.service'
import { getScenarioName } from '../data/safetyScenarios'
import { SAFETY_CAMERAS } from '../data/safetyCameras'
import { getSafetyTodayDate } from '../data/safetyDemoDate'
import { getViolationFeedUrl, getViolationClipMarker } from '../data/safetyViolationFeeds'
import { groupIdToFeedType, groupIdToViolationType } from '../utils/groupToViolationType'
import { resolveTrainingCameraId } from '../utils/safetyCameraBridge'
import type { SafetyViolationRecord } from '../types/safety.types'
import {
  buildEventPlaybackMeta,
  EVENT_PLAYBACK_CLIP_SEC,
} from '../utils/eventPlaybackClip'

function violationToRecord(v: SafetyViolationRecord): CameraPlaybackRecord {
  const feedType = groupIdToFeedType(v.groupId)
  const violationType = groupIdToViolationType(v.groupId)
  const end = dayjs(v.detectedAt).add(2, 'minute').toISOString()
  const meta = buildEventPlaybackMeta(v)
  return {
    id: v.id,
    name: getScenarioName(v.scenarioId),
    startTime: v.detectedAt,
    endTime: end,
    type: 'event',
    videoUrl: v.playbackUrl ?? getViolationFeedUrl(feedType),
    seekSec: meta.seekSec ?? getViolationClipMarker(violationType ?? feedType),
    clipDurationSec: EVENT_PLAYBACK_CLIP_SEC,
    violationBbox: meta.bbox,
    subjectBbox: meta.subjectBbox,
    relatedBbox: meta.relatedBbox,
    frameWidth: meta.frameWidth,
    frameHeight: meta.frameHeight,
    thumbnailUrl: v.snapshotUrl,
  }
}

function buildContinuousRecord(cameraId: string, date: string): CameraPlaybackRecord {
  const cam = SAFETY_CAMERAS.find(c => c.id === cameraId)
  return {
    id: `${cameraId}-${date}-continuous`,
    name: 'Ghi hình liên tục',
    startTime: `${date}T06:00:00`,
    endTime: `${date}T18:00:00`,
    type: 'continuous',
    videoUrl: cam?.streamUrl,
  }
}

export async function fetchSafetyCameraRecords(
  cameraId: string,
  params: { startDate: string; endDate: string },
): Promise<CameraPlaybackRecordsResponse> {
  const date = dayjs(params.startDate).format('YYYY-MM-DD')
  const violations = getAllSafetyRecords().filter(v => {
    const camId = resolveTrainingCameraId(v.sourceDeviceId, v.sourceType)
    return camId === cameraId && v.detectedAt.startsWith(date)
  })

  const events = violations.map(violationToRecord)
  const items = [buildContinuousRecord(cameraId, date), ...events]
  return { items }
}

export async function fetchSafetyRecordDetections(recordId: string): Promise<CameraDetectionsResponse> {
  const violation = getAllSafetyRecords().find(v => v.id === recordId)
  if (!violation) return { items: [] }

  const items: CameraDetection[] = [
    {
      id: `${recordId}-ai`,
      label: violation.groupId.toLowerCase(),
      confidenceScore: violation.severity === 'CRITICAL' ? 96 : 89,
      detectionResult: violation.description ?? getScenarioName(violation.scenarioId),
      createdAt: violation.detectedAt,
    },
  ]

  if (violation.severity === 'CRITICAL') {
    items.push({
      id: `${recordId}-ai-2`,
      label: 'alert',
      confidenceScore: 92,
      detectionResult: 'Cảnh báo khẩn cấp — cần xử lý ngay',
      createdAt: dayjs(violation.detectedAt).add(2, 'second').toISOString(),
    })
  }

  return { items }
}

export function getSafetyDefaultPlaybackDate(): string {
  return getSafetyTodayDate()
}
