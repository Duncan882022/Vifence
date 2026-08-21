import type { Event } from '@/types/event'
import type { SafetyViolationRecord } from '../types/safety.types'
import { getScenarioName, SAFETY_SCENARIO_MAP } from '../data/safetyScenarios'
import { SAFETY_GROUP_MAP } from '../data/safetyGroups'
import { getViolationFeedUrl } from '../data/safetyViolationFeeds'
import { resolveViolationSnapshotUrl } from '../data/safetyViolationSnapshots'
import { groupIdToFeedType } from './groupToViolationType'
import { getSubject } from './eventSubject'
import {
  getEventAreaLabel,
  getEventSourceLabel,
  getSafetyCamera,
  resolveTrainingCameraId,
} from './safetyCameraBridge'
import { isLiveSafetyRecord } from '../services/safetyAiEvents.service'
import { buildEventPlaybackMeta, EVENT_PLAYBACK_CLIP_SEC } from './eventPlaybackClip'
import { formatMachineRoiBadge } from './roiOverlayCode'

export function violationRecordToEvent(v: SafetyViolationRecord): Event {
  const scenario = SAFETY_SCENARIO_MAP.get(v.scenarioId)
  const group = SAFETY_GROUP_MAP.get(v.groupId)
  const subject = getSubject(v)
  const trainingCamId = resolveTrainingCameraId(v.sourceDeviceId, v.sourceType)
  const trainingCam = getSafetyCamera(trainingCamId)
  const liveCameraFeed = isLiveSafetyRecord(v) ? trainingCam?.streamUrl : undefined
  const playbackMeta = buildEventPlaybackMeta(v)

  return {
    id: v.id,
    type: group?.name ?? v.groupId,
    scenario: getScenarioName(v.scenarioId),
    scenarioId: v.scenarioId,
    violationCategory: v.groupId,
    description: v.description ?? scenario?.description ?? getScenarioName(v.scenarioId),
    timestamp: v.detectedAt,
    cameraId: trainingCam?.id ?? v.sourceDeviceId,
    cameraName: getEventSourceLabel(v.sourceDeviceId, v.sourceType),
    location: getEventAreaLabel(v.sourceDeviceId, v.sourceType, v.zoneId),
    workerId: subject.workerId,
    workerName: subject.workerName,
    contractorName: subject.contractorName ?? subject.siteContractor ?? subject.constructionUnit ?? v.contractorName,
    vehiclePlate: subject.vehiclePlate,
    vehicleType: subject.vehicleType,
    imageUrl: v.snapshotUrl ?? resolveViolationSnapshotUrl(v),
    // VMS clip ưu tiên — nếu không có thì dùng live feed hoặc demo video
    videoUrl: v.clipUrl ?? v.playbackUrl ?? liveCameraFeed ?? getViolationFeedUrl(groupIdToFeedType(v.groupId)),
    playbackSeekSec: v.clipUrl ? 0 : playbackMeta.seekSec,
    clipDurationSec: v.clipDurationSec ?? EVENT_PLAYBACK_CLIP_SEC,
    violationBbox: playbackMeta.bbox,
    subjectBbox: playbackMeta.subjectBbox,
    relatedBbox: playbackMeta.relatedBbox,
    relatedRoiLabel: playbackMeta.relatedBbox && v.scenarioId === 'DZ-003'
      ? formatMachineRoiBadge('sany_drill', v.confidence)
      : undefined,
    frameWidth: playbackMeta.frameWidth,
    frameHeight: playbackMeta.frameHeight,
    status: v.status === 'CLOSED' ? 'processed' : 'pending',
    severity: v.severity === 'CRITICAL' ? 'critical' : 'warning',
    module: 'safety',
  }
}
