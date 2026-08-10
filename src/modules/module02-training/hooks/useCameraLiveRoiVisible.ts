import { useCallback, useEffect, useState } from 'react'
import {
  CAMERA_AI_CONFIG_CHANGED,
  getCameraLiveRoiVisible,
  toggleCameraLiveRoiVisible,
} from '../services/cameraAiConfig.service'
import {
  CAMERA_BBOX_PREFERENCE_CHANGED,
  getCameraBboxVisible,
  toggleCameraBboxVisible,
} from '../services/cameraBboxPreference.service'

/** Polygon ROI trên live — đọc từ cấu hình cam (A-03 mặc định bật). */
export function useCameraLiveRoiVisible(cameraId: string): [boolean, () => void] {
  const [visible, setVisible] = useState(() => getCameraLiveRoiVisible(cameraId))

  useEffect(() => {
    setVisible(getCameraLiveRoiVisible(cameraId))
  }, [cameraId])

  useEffect(() => {
    const sync = () => setVisible(getCameraLiveRoiVisible(cameraId))
    window.addEventListener(CAMERA_AI_CONFIG_CHANGED, sync)
    return () => window.removeEventListener(CAMERA_AI_CONFIG_CHANGED, sync)
  }, [cameraId])

  const toggle = useCallback(() => {
    setVisible(toggleCameraLiveRoiVisible(cameraId))
  }, [cameraId])

  return [visible, toggle]
}

/** Overlay AI (bbox + ROI khi bật) — nút ScanEye trên toolbar. */
export function useCameraAiOverlayVisible(cameraId: string): [boolean, () => void] {
  const [visible, setVisible] = useState(() => getCameraBboxVisible(cameraId))

  useEffect(() => {
    setVisible(getCameraBboxVisible(cameraId))
  }, [cameraId])

  useEffect(() => {
    const sync = () => setVisible(getCameraBboxVisible(cameraId))
    window.addEventListener(CAMERA_BBOX_PREFERENCE_CHANGED, sync)
    return () => window.removeEventListener(CAMERA_BBOX_PREFERENCE_CHANGED, sync)
  }, [cameraId])

  const toggle = useCallback(() => {
    setVisible(toggleCameraBboxVisible(cameraId))
  }, [cameraId])

  return [visible, toggle]
}
