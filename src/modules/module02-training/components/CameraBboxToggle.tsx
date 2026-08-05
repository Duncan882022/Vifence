import { useCallback, useEffect, useState } from 'react'
import { Eye, ScanEye } from 'lucide-react'
import { cn } from '@/utils/cn'
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
        className ?? cn(
          'rounded border transition-colors shrink-0 pointer-events-auto',
          visible
            ? 'bg-sky-500/20 border-sky-500/40 text-sky-200 hover:bg-sky-500/30'
            : 'bg-black/50 border-white/20 text-white/70 hover:bg-black/70 hover:text-white',
          compact ? 'p-0.5' : 'p-1',
        ),
        visible && activeClassName,
      )}
      title={visible ? 'Ẩn ROI detect' : 'Hiện ROI detect'}
      aria-pressed={visible}
      aria-label={visible ? 'Ẩn ROI detect' : 'Hiện ROI detect'}
    >
      {visible
        ? <ScanEye className={cn(compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
        : <Eye className={cn(compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} />}
    </button>
  )
}
