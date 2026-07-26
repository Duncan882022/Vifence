import type { Event } from '@/types/event'
import type { SafetyViolationRecord } from '../types/safety.types'
import { getScenarioName, SAFETY_SCENARIO_MAP } from '../data/safetyScenarios'
import { getZoneName } from '../data/safetyZones'
import { SAFETY_GROUP_MAP } from '../data/safetyGroups'
import { DEVICE_TYPE_LABELS } from '../data/monitoringDevices'
import { getViolationFeedUrl } from '../data/safetyViolationFeeds'
import { resolveViolationSnapshotUrl } from '../data/safetyViolationSnapshots'
import { groupIdToFeedType } from './groupToViolationType'
import { getSubject } from './eventSubject'
import {
  getSafetyCamera,
  getSafetyCameraDisplayName,
  resolveTrainingCameraId,
} from './safetyCameraBridge'

export function violationRecordToEvent(v: SafetyViolationRecord): Event {
  const scenario = SAFETY_SCENARIO_MAP.get(v.scenarioId)
  const group = SAFETY_GROUP_MAP.get(v.groupId)
  const subject = getSubject(v)
  const trainingCamId = resolveTrainingCameraId(v.sourceDeviceId, v.sourceType)
  const trainingCam = getSafetyCamera(trainingCamId)

  return {
    id: v.id,
    type: group?.name ?? v.groupId,
    scenario: getScenarioName(v.scenarioId),
    violationCategory: v.groupId,
    description: v.description ?? scenario?.description ?? getScenarioName(v.scenarioId),
    timestamp: v.detectedAt,
    cameraId: trainingCam?.id ?? v.sourceDeviceId,
    cameraName: trainingCam
      ? getSafetyCameraDisplayName(trainingCam.id)
      : DEVICE_TYPE_LABELS[v.sourceType] ?? v.sourceDeviceId,
    location: getZoneName(v.zoneId),
    workerId: subject.workerId,
    workerName: subject.workerName,
    contractorName: subject.contractorName ?? subject.siteContractor ?? subject.constructionUnit ?? v.contractorName,
    vehiclePlate: subject.vehiclePlate,
    vehicleType: subject.vehicleType,
    imageUrl: v.snapshotUrl ?? resolveViolationSnapshotUrl(v),
    videoUrl: v.playbackUrl ?? getViolationFeedUrl(groupIdToFeedType(v.groupId)),
    status: v.status === 'CLOSED' ? 'processed' : 'pending',
    severity: v.severity === 'CRITICAL' ? 'critical' : 'warning',
    module: 'safety',
  }
}
