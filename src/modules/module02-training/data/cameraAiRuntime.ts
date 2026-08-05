import {
  isCameraAiModelEnabled,
  isInModelVideoSegment,
  shouldRunModelOnCamera,
} from '../services/cameraAiConfig.service'

export { isInModelVideoSegment, shouldRunModelOnCamera, isCameraAiModelEnabled }

export function isFaceOverlayCamera(cameraId: string): boolean {
  return isCameraAiModelEnabled(cameraId, 'face_demo')
}

export function isRoadAnalysisCamera(cameraId: string): boolean {
  return isCameraAiModelEnabled(cameraId, 'road_material')
}

export function isRoadAnalysisOverlayCamera(cameraId: string): boolean {
  return isRoadAnalysisCamera(cameraId)
}

export function isCraneProximityCamera(cameraId: string): boolean {
  return isCameraAiModelEnabled(cameraId, 'crane_proximity')
}

export function isPpeCamera(cameraId: string): boolean {
  return isCameraAiModelEnabled(cameraId, 'ppe')
}

export function isPcccCamera(cameraId: string): boolean {
  return isCameraAiModelEnabled(cameraId, 'pccc')
}

export function isWahCamera(cameraId: string): boolean {
  return isCameraAiModelEnabled(cameraId, 'wah')
}

export function isAtgtCamera(cameraId: string): boolean {
  return isCameraAiModelEnabled(cameraId, 'atgt_traffic')
}

export function isMobileSmokingFireCamera(cameraId: string): boolean {
  return isCameraAiModelEnabled(cameraId, 'mobile_smoking_fire')
}

export function isInPpeVideoSegment(currentTimeSec: number): boolean {
  return isInModelVideoSegment('ppe', currentTimeSec)
}

export function isInPcccVideoSegment(currentTimeSec: number): boolean {
  return isInModelVideoSegment('pccc', currentTimeSec)
}

export function isInWahVideoSegment(currentTimeSec: number): boolean {
  return isInModelVideoSegment('wah', currentTimeSec)
}

export function isInAtgtVideoSegment(currentTimeSec: number): boolean {
  return isInModelVideoSegment('atgt_traffic', currentTimeSec)
}

export function shouldRunCraneOnCamera(cameraId: string, currentTimeSec: number): boolean {
  return shouldRunModelOnCamera(cameraId, 'crane_proximity', currentTimeSec)
}

export function shouldRunPpeOnCamera(cameraId: string, currentTimeSec: number): boolean {
  return shouldRunModelOnCamera(cameraId, 'ppe', currentTimeSec)
}

export function shouldRunPcccOnCamera(cameraId: string, currentTimeSec: number): boolean {
  return shouldRunModelOnCamera(cameraId, 'pccc', currentTimeSec)
}

export function shouldRunWahOnCamera(cameraId: string, currentTimeSec: number): boolean {
  return shouldRunModelOnCamera(cameraId, 'wah', currentTimeSec)
}

export function shouldRunAtgtOnCamera(cameraId: string, currentTimeSec: number): boolean {
  return shouldRunModelOnCamera(cameraId, 'atgt_traffic', currentTimeSec)
}

export function shouldRunRoadOnCamera(cameraId: string, currentTimeSec: number): boolean {
  return shouldRunModelOnCamera(cameraId, 'road_material', currentTimeSec)
}

/** Cam có bất kỳ model timed nào (PPE/PCCC/WAH). */
export function isInCam04SpecialSegment(currentTimeSec: number): boolean {
  return isInPpeVideoSegment(currentTimeSec)
    || isInPcccVideoSegment(currentTimeSec)
    || isInWahVideoSegment(currentTimeSec)
}

export function isAiOverlayDisabledCamera(_cameraId: string): boolean {
  return false
}
