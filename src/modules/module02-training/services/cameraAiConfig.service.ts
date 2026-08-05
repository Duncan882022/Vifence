import { getDefaultEnabledModels } from '../data/cameraAiDefaultConfig'
import { getCameraAiModel } from '../data/cameraAiModelCatalog'
import { getDefaultRoiZonesForModel } from '../data/cameraAiRoiDefaults'
import type { CameraAiConfigMap, CameraAiModelId, CameraAiRoiZone } from '../types/cameraAi.types'

const STORAGE_KEY = 'vifence_camera_ai_config'
export const CAMERA_AI_CONFIG_CHANGED = 'vifence-camera-ai-config-changed'

function readAll(): CameraAiConfigMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as CameraAiConfigMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(map: CameraAiConfigMap): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function notifyCameraAiConfigChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CAMERA_AI_CONFIG_CHANGED))
}

export function getEnabledModelsForCamera(cameraId: string): CameraAiModelId[] {
  const stored = readAll()[cameraId]?.enabledModels
  if (stored && stored.length > 0) return stored
  return getDefaultEnabledModels(cameraId)
}

export function setEnabledModelsForCamera(cameraId: string, models: CameraAiModelId[]): void {
  const map = readAll()
  map[cameraId] = { enabledModels: [...new Set(models)] }
  writeAll(map)
  notifyCameraAiConfigChanged()
}

export function isCameraAiModelEnabled(cameraId: string, modelId: CameraAiModelId): boolean {
  return getEnabledModelsForCamera(cameraId).includes(modelId)
}

export function getRoiZonesForModel(
  cameraId: string,
  modelId: CameraAiModelId,
): CameraAiRoiZone[] {
  const model = getCameraAiModel(modelId)
  if (!model?.needsPolygon) return []
  return getDefaultRoiZonesForModel(cameraId, modelId)
}

export function isInModelVideoSegment(
  modelId: CameraAiModelId,
  currentTimeSec: number,
): boolean {
  const model = getCameraAiModel(modelId)
  const segments = model?.videoSegments
  if (!segments || segments.length === 0) return true
  return segments.some(s => currentTimeSec >= s.startSec && currentTimeSec < s.endSec)
}

/** Model có segment đang active — ưu tiên segment hẹp hơn (PPE/PCCC trước crane). */
export function getActiveTimedModelForCamera(
  cameraId: string,
  currentTimeSec: number,
): CameraAiModelId | null {
  const enabled = getEnabledModelsForCamera(cameraId)
  const timed = enabled.filter(id => {
    const m = getCameraAiModel(id)
    return m?.videoSegments && m.videoSegments.length > 0
  })
  for (const id of timed) {
    if (isInModelVideoSegment(id, currentTimeSec)) return id
  }
  return null
}

export function shouldRunModelOnCamera(
  cameraId: string,
  modelId: CameraAiModelId,
  currentTimeSec?: number,
): boolean {
  if (!isCameraAiModelEnabled(cameraId, modelId)) return false
  const model = getCameraAiModel(modelId)
  if (!model?.videoSegments?.length) return true
  if (currentTimeSec == null) return true
  return isInModelVideoSegment(modelId, currentTimeSec)
}
