import { Radio, SwitchCamera } from 'lucide-react'
import { cn } from '@/utils/cn'
import { cameraDisplayLabel, cameraMetaLabel, type TrainingCamera } from '../data/trainingCameras'
import { requestMobileCameraFlip } from '../services/mobileCameraFlip'
import { CameraAiConfigButton } from './CameraAiConfigModal'
import { CameraBboxToggle } from './CameraBboxToggle'
import { BackendConnectionBadge } from './BackendConnectionBadge'
import {
  CAMERA_FLIGHT_MODE_BADGE,
  CAMERA_LIVE_BADGE,
  CAMERA_TOOLBAR_SHELL,
  cameraToolbarBtn,
  cameraToolbarIconSize,
} from './cameraToolbarStyles'
import { isPatrolDroneCameraId, isPatrolDroneRoiMandatory } from '@/modules/module05-productivity/data/patrolDrones'
import { usePatrolDroneFlightMode } from '@/modules/module05-productivity/hooks/usePatrolFlycamFlightModes'
import {
  patrolFlightModeLabel,
  patrolFlightModeShortLabel,
} from '@/modules/module05-productivity/utils/patrolFlightMode'

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

interface CameraFlightModeBadgeProps {
  cameraId: string
  compact?: boolean
}

/** Chế độ bay flycam — chỉ DR-* cạnh badge LIVE. */
export function CameraFlightModeBadge({ cameraId, compact }: CameraFlightModeBadgeProps) {
  const mode = usePatrolDroneFlightMode(cameraId)
  if (!isPatrolDroneCameraId(cameraId) || !mode) return null

  const label = compact ? patrolFlightModeShortLabel(mode) : patrolFlightModeLabel(mode)
  const isProximity = mode === 'proximity'

  return (
    <span
      className={cn(
        CAMERA_FLIGHT_MODE_BADGE,
        compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]',
        isProximity
          ? 'border border-cyan-400/35 text-cyan-300'
          : 'border border-sky-400/35 text-sky-300',
      )}
      title={patrolFlightModeLabel(mode)}
    >
      {label}
    </span>
  )
}

export function CameraOfflineBadge({ compact }: CameraLiveBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded font-bold tracking-wide uppercase border',
      'bg-[#0a0e17]/90 text-muted-foreground border-[#334155]',
      compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]',
    )}>
      OFFLINE
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
  /** Hiện nút đảo cam trước/sau (mobile stream) */
  showFacingToggle?: boolean
}

export function CameraToolbar({
  cameraId,
  compact,
  showFacingToggle,
}: CameraToolbarProps) {
  const droneRoiLocked = isPatrolDroneRoiMandatory(cameraId)

  return (
    <div className={cn(
      'absolute z-[8] pointer-events-auto',
      compact ? 'top-1.5 right-1.5' : 'top-2 right-2',
    )}>
      <div className={CAMERA_TOOLBAR_SHELL}>
        <BackendConnectionBadge
          cameraId={cameraId}
          compact={compact}
          variant="toolbar"
          className={cameraToolbarBtn(compact)}
        />
        {showFacingToggle && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              requestMobileCameraFlip(cameraId)
            }}
            className={cameraToolbarBtn(compact)}
            title="Đảo camera trước / sau"
            aria-label="Đảo camera trước / sau"
          >
            <SwitchCamera className={cameraToolbarIconSize(compact)} aria-hidden />
          </button>
        )}
        <CameraAiConfigButton
          cameraId={cameraId}
          compact={compact}
          className={cameraToolbarBtn(compact)}
        />
        {!droneRoiLocked && (
          <CameraBboxToggle
            cameraId={cameraId}
            compact={compact}
            className={cameraToolbarBtn(compact)}
            activeClassName={cameraToolbarBtn(compact, true)}
          />
        )}
      </div>
    </div>
  )
}

interface CameraChromeProps {
  cam: TrainingCamera
  compact?: boolean
}

/** LIVE + toolbar + thông tin cam — dùng chung mọi luồng. */
export function CameraChrome({ cam, compact }: CameraChromeProps) {
  const isOffline = cam.status === 'offline' && !cam.framesLive

  return (
    <>
      <div className={cn(
        'absolute z-[8] pointer-events-none flex items-center gap-1 flex-wrap max-w-[85%]',
        compact ? 'top-1.5 left-1.5' : 'top-2 left-2',
      )}>
        {isOffline
          ? <CameraOfflineBadge compact={compact} />
          : (
            <>
              <CameraLiveBadge compact={compact} />
              <CameraFlightModeBadge cameraId={cam.id} compact={compact} />
            </>
          )}
      </div>
      <CameraToolbar
        cameraId={cam.id}
        compact={compact}
        showFacingToggle={cam.streamType === 'mobile'}
      />
      <CameraInfoBar cam={cam} compact={compact} />
    </>
  )
}
