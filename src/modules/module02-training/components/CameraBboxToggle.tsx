import { useCallback, useEffect, useState } from 'react'
import { Eye, ScanEye } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  cameraToolbarBtnStandalone,
  cameraToolbarIconSize,
} from './cameraToolbarStyles'
import {
  CAMERA_BBOX_PREFERENCE_CHANGED,
  getCameraBboxVisible,
  toggleCameraBboxVisible,
} from '../services/cameraBboxPreference.service'

export function useCameraBboxVisible(cameraId: string): [boolean, () => void] {
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

interface CameraBboxToggleProps {
  cameraId: string
  compact?: boolean
  className?: string
  activeClassName?: string
}

/** Bật/tắt khung bbox AI trên luồng camera — lưu theo từng cam. */
export function CameraBboxToggle({ cameraId, compact, className, activeClassName }: CameraBboxToggleProps) {
  const [visible, toggle] = useCameraBboxVisible(cameraId)

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        toggle()
      }}
      className={cn(
        className ?? cameraToolbarBtnStandalone(compact, visible),
        visible && activeClassName,
      )}
      title={visible ? 'Ẩn ROI detect' : 'Hiện ROI detect'}
      aria-pressed={visible}
      aria-label={visible ? 'Ẩn ROI detect' : 'Hiện ROI detect'}
    >
      {visible
        ? <ScanEye className={cameraToolbarIconSize(compact)} aria-hidden />
        : <Eye className={cameraToolbarIconSize(compact)} aria-hidden />}
    </button>
  )
}
