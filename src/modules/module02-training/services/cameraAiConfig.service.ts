import { getDefaultEnabledModels } from '../data/cameraAiDefaultConfig'
import { getCameraAiModel } from '../data/cameraAiModelCatalog'
import { listModelsForCamera } from '../data/cameraAiModelTokens'
import { getDefaultRoiZonesForModel } from '../data/cameraAiRoiDefaults'
import type { CameraAiConfigMap, CameraAiModelId, CameraAiRoiZone } from '../types/cameraAi.types'

const STORAGE_KEY = 'vifence_camera_ai_config'
export const CAMERA_AI_CONFIG_CHANGED = 'vifence-camera-ai-config-changed'

/** Cam mặc định luôn vẽ ROI lòng đường trên live — có thể tắt trong cấu hình cam. */
const DEFAULT_LIVE_ROI_CAMERAS = new Set(['A-03'])

/** A-04 — khi một model người/vi phạm chạy, bật thêm model liên quan trên cùng frame. */
const A04_MULTI_VIOLATION_MODELS: CameraAiModelId[] = ['ppe', 'pccc', 'wah']

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
  const allowed = new Set(listModelsForCamera(cameraId))
  const stored = readAll()[cameraId]?.enabledModels
  const raw = stored && stored.length > 0 ? stored : getDefaultEnabledModels(cameraId)
  const filtered = raw.filter(id => allowed.has(id))
  return filtered.length > 0 ? filtered : getDefaultEnabledModels(cameraId).filter(id => allowed.has(id))
}

export function setEnabledModelsForCamera(cameraId: string, models: CameraAiModelId[]): void {
  const map = readAll()
  const prev = map[cameraId]
  map[cameraId] = {
    ...prev,
    enabledModels: [...new Set(models)],
  }
  writeAll(map)
  notifyCameraAiConfigChanged()
}

export function isCameraAiModelEnabled(cameraId: string, modelId: CameraAiModelId): boolean {
  return getEnabledModelsForCamera(cameraId).includes(modelId)
}

export function getDefaultLiveRoiVisible(cameraId: string): boolean {
  return DEFAULT_LIVE_ROI_CAMERAS.has(cameraId)
}

export function getCameraLiveRoiVisible(cameraId: string): boolean {
  const stored = readAll()[cameraId]?.showLiveRoi
  if (stored !== undefined) return stored
  return getDefaultLiveRoiVisible(cameraId)
}

export function setCameraLiveRoiVisible(cameraId: string, visible: boolean): void {
  const map = readAll()
  const prev = map[cameraId] ?? { enabledModels: getEnabledModelsForCamera(cameraId) }
  map[cameraId] = { ...prev, showLiveRoi: visible }
  writeAll(map)
  notifyCameraAiConfigChanged()
}

export function toggleCameraLiveRoiVisible(cameraId: string): boolean {
  const next = !getCameraLiveRoiVisible(cameraId)
  setCameraLiveRoiVisible(cameraId, next)
  return next
}

export function cameraHasPolygonRoiModels(cameraId: string): boolean {
  return getEnabledModelsForCamera(cameraId).some(id => getCameraAiModel(id)?.needsPolygon)
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
  return segments.some(
    segment => currentTimeSec >= segment.startSec && currentTimeSec < segment.endSec,
  )
}

/** @deprecated Segment không còn gate runtime — dùng getEnabledModelsForCamera. */
export function getActiveTimedModelForCamera(
  cameraId: string,
  _currentTimeSec: number,
): CameraAiModelId | null {
  const enabled = getEnabledModelsForCamera(cameraId)
  const timed = enabled.find(id => {
    const m = getCameraAiModel(id)
    return m?.videoSegments && m.videoSegments.length > 0
  })
  return timed ?? null
}

export function shouldRunModelOnCamera(
  cameraId: string,
  modelId: CameraAiModelId,
  currentTimeSec = 0,
): boolean {
  if (!isCameraAiModelEnabled(cameraId, modelId)) return false
  if (isInModelVideoSegment(modelId, currentTimeSec)) return true
  if (
    cameraId === 'A-04'
    && A04_MULTI_VIOLATION_MODELS.includes(modelId)
  ) {
    return A04_MULTI_VIOLATION_MODELS.some(
      peer => peer !== modelId && isInModelVideoSegment(peer, currentTimeSec),
    )
  }
  return false
}
