import { useCallback, useEffect, useState } from 'react'
import {
  CAMERA_AI_CONFIG_CHANGED,
  getEnabledModelsForCamera,
  setEnabledModelsForCamera,
} from '../services/cameraAiConfig.service'
import type { CameraAiModelId } from '../types/cameraAi.types'

export function useCameraAiEnabledModels(cameraId: string): {
  enabledModels: CameraAiModelId[]
  setEnabledModels: (models: CameraAiModelId[]) => void
  toggleModel: (modelId: CameraAiModelId) => void
} {
  const [enabledModels, setLocal] = useState<CameraAiModelId[]>(() =>
    getEnabledModelsForCamera(cameraId),
  )

  useEffect(() => {
    setLocal(getEnabledModelsForCamera(cameraId))
  }, [cameraId])

  useEffect(() => {
    const sync = () => setLocal(getEnabledModelsForCamera(cameraId))
    window.addEventListener(CAMERA_AI_CONFIG_CHANGED, sync)
    return () => window.removeEventListener(CAMERA_AI_CONFIG_CHANGED, sync)
  }, [cameraId])

  const setEnabledModels = useCallback((models: CameraAiModelId[]) => {
    setEnabledModelsForCamera(cameraId, models)
    setLocal(getEnabledModelsForCamera(cameraId))
  }, [cameraId])

  const toggleModel = useCallback((modelId: CameraAiModelId) => {
    const current = getEnabledModelsForCamera(cameraId)
    const next = current.includes(modelId)
      ? current.filter(id => id !== modelId)
      : [...current, modelId]
    setEnabledModelsForCamera(cameraId, next)
    setLocal(getEnabledModelsForCamera(cameraId))
  }, [cameraId])

  return { enabledModels, setEnabledModels, toggleModel }
}
