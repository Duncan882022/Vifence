import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'
import type { PatrolVisionStreamCamera } from '../services/patrolVisionStreams.service'
import { isHelmetWebrtcAvailable } from './helmetIngest'
import { PATROL_CAMERAS, applyPatrolCameraStreamStatus } from './patrolCameras'
import {
  applyPatrolHelmetEnvLive,
  applyPatrolHelmetMobileLive,
  applyPatrolUnifiedLiveRouting,
  mergePatrolCamerasWithVisionLive,
} from './patrolHelmetStreams'

/**
 * Pipeline live camera tuần tra — một chỗ thay vì 4 transform rải rác trên page.
 */
export function buildPatrolCamerasLive(
  visionCameras: PatrolVisionStreamCamera[],
  perCamera: PatrolHelmetCameraMetricsSlice[],
  framesLiveById?: ReadonlyMap<string, boolean>,
): TrainingCamera[] {
  let cameras: TrainingCamera[] = [...PATROL_CAMERAS]

  if (!isHelmetWebrtcAvailable()) {
    cameras = applyPatrolHelmetMobileLive(
      applyPatrolHelmetEnvLive(
        mergePatrolCamerasWithVisionLive(cameras, visionCameras),
      ),
    ) as TrainingCamera[]
  } else {
    cameras = applyPatrolHelmetMobileLive(cameras) as TrainingCamera[]
  }

  return applyPatrolCameraStreamStatus(
    applyPatrolUnifiedLiveRouting(cameras),
    perCamera,
    framesLiveById,
  )
}
