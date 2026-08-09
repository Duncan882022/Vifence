import { Maximize2, Minimize2, Radio } from 'lucide-react'
import { cn } from '@/utils/cn'
import { cameraDisplayLabel, cameraMetaLabel, type TrainingCamera } from '../data/trainingCameras'
import { CameraAiConfigButton } from './CameraAiConfigModal'
import { CameraBboxToggle } from './CameraBboxToggle'
import { BackendConnectionBadge } from './BackendConnectionBadge'
import { CAMERA_LIVE_BADGE, CAMERA_TOOLBAR_SHELL, cameraToolbarBtn, cameraToolbarIconSize } from './cameraToolbarStyles'

interface CameraLiveBadgeProps {
  compact?: boolean
}

export function CameraLiveBadge({ compact }: CameraLiveBadgeProps) {
  return (
    <span className={cn(CAMERA_LIVE_BADGE, compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]')}>
      <Radio className={cn(compact ? 'w-2 h-2' : 'w-2.5 h-2.5', 'text-red-400 animate-pulse')} aria-hidden />
      LIVE
    </span>
  )
}

interface CameraInfoBarProps {
  cam: TrainingCamera
  compact?: boolean
}

export function CameraInfoBar({ cam, compact }: CameraInfoBarProps) {
  const meta = cameraMetaLabel(cam)

  return (
    <div className={cn(
      'absolute bottom-0 left-0 right-0 z-[7] pointer-events-none',
      'bg-gradient-to-t from-black/90 via-black/45 to-transparent',
      compact ? 'px-2 pt-5 pb-1.5' : 'px-3 pt-8 pb-2.5',
    )}>
      <p className={cn(
        'font-semibold text-white truncate leading-snug',
        compact ? 'text-[9px]' : 'text-[13px]',
      )}>
        {cameraDisplayLabel(cam)}
      </p>
      {meta && (
        <p className={cn(
          'text-blue-200/75 truncate leading-tight mt-0.5',
          compact ? 'text-[7px]' : 'text-[10px]',
        )}>
          {meta}
        </p>
      )}
    </div>
  )
}

interface CameraToolbarProps {
  cameraId: string
  compact?: boolean
  onMaximize?: () => void
  isMaximized?: boolean
}

export function CameraToolbar({
  cameraId,
  compact,
  onMaximize,
  isMaximized,
}: CameraToolbarProps) {
  return (
    <div className={cn(
      'absolute z-[8] pointer-events-auto',
      compact ? 'top-1.5 right-1.5' : 'top-2 right-2',
    )}>
      <div className={CAMERA_TOOLBAR_SHELL}>
        <CameraAiConfigButton
          cameraId={cameraId}
          compact={compact}
          className={cameraToolbarBtn(compact)}
        />
        <CameraBboxToggle
          cameraId={cameraId}
          compact={compact}
          className={cameraToolbarBtn(compact)}
          activeClassName={cameraToolbarBtn(compact, true)}
        />
        {onMaximize && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              onMaximize()
            }}
            className={cameraToolbarBtn(compact)}
            title={isMaximized ? 'Thu nhỏ' : 'Phóng to'}
            aria-label={isMaximized ? 'Thu nhỏ' : 'Phóng to'}
          >
            {isMaximized
              ? <Minimize2 className={cameraToolbarIconSize(compact)} aria-hidden />
              : <Maximize2 className={cameraToolbarIconSize(compact)} aria-hidden />}
          </button>
        )}
      </div>
    </div>
  )
}

interface CameraChromeProps {
  cam: TrainingCamera
  compact?: boolean
  onMaximize?: () => void
  isMaximized?: boolean
}

/** LIVE + toolbar + thông tin cam — dùng chung mọi luồng. */
export function CameraChrome({ cam, compact, onMaximize, isMaximized }: CameraChromeProps) {
  return (
    <>
      <div className={cn(
        'absolute z-[8] pointer-events-none flex items-center gap-1',
        compact ? 'top-1.5 left-1.5' : 'top-2 left-2',
      )}>
        <CameraLiveBadge compact={compact} />
        <BackendConnectionBadge compact={compact} />
      </div>
      <CameraToolbar
        cameraId={cam.id}
        compact={compact}
        onMaximize={onMaximize}
        isMaximized={isMaximized}
      />
      <CameraInfoBar cam={cam} compact={compact} />
    </>
  )
}
