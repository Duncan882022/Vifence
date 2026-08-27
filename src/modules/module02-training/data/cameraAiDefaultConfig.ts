import type { CameraAiConfigMap, CameraAiModelId } from '../types/cameraAi.types'

/** Cấu hình mặc định — khớp demo hiện tại trước khi user chỉnh. */
export const DEFAULT_CAMERA_AI_ENABLED: Record<string, CameraAiModelId[]> = {
  'A-03': ['road_material', 'atgt_traffic'],
  'A-04': ['crane_proximity', 'ppe', 'pccc', 'wah'],
  'HC-01': ['patrol_person'],
  'HC-02': ['patrol_person'],
  'DR-03': ['patrol_person'],
  'MOB-01': ['mobile_smoking_fire'],
  'MOB-02': ['mobile_smoking_fire'],
}

export function getDefaultEnabledModels(cameraId: string): CameraAiModelId[] {
  if (DEFAULT_CAMERA_AI_ENABLED[cameraId]) {
    return [...DEFAULT_CAMERA_AI_ENABLED[cameraId]]
  }
  return ['face_demo']
}

export function buildDefaultCameraAiConfig(): CameraAiConfigMap {
  const map: CameraAiConfigMap = {}
  for (const [cameraId, models] of Object.entries(DEFAULT_CAMERA_AI_ENABLED)) {
    map[cameraId] = { enabledModels: [...models] }
  }
  return map
}
