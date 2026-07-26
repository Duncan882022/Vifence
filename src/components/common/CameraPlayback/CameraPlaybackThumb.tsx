import { Camera, Check, History } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  cameraDisplayLabel,
  cameraMetaLabel,
  streamTypeBadge,
  type TrainingCamera,
} from '@/modules/module02-training/data/trainingCameras'

const CCTV_SCANLINE = {
  backgroundImage:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
} as const

interface CameraPlaybackThumbProps {
  cam: TrainingCamera
  selected: boolean
  onClick: () => void
  compact?: boolean
  strip?: boolean
  variant?: 'live' | 'playback'
}

export function CameraPlaybackThumb({
  cam,
  selected,
  onClick,
  compact = false,
  strip = false,
  variant = 'live',
}: CameraPlaybackThumbProps) {
  const badge = streamTypeBadge(cam)
  const isPlayback = variant === 'playback'
  const statusDot = cam.status === 'online' ? 'bg-green-400' : 'bg-muted-foreground'

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative aspect-video overflow-hidden cursor-pointer border-2 transition-all shrink-0 group',
        strip ? 'w-[72px]' : 'w-full',
        compact ? 'rounded-sm' : 'rounded',
        selected
          ? 'border-primary shadow-[0_0_0_1px] shadow-primary/30'
          : 'border-[#1e2433] hover:border-primary/50',
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-muted-foreground/30">
        <Camera className="w-4 h-4" />
      </div>
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />

      <span className="absolute top-0.5 left-0.5 flex items-center gap-0.5 z-10">
        {isPlayback ? (
          <>
            <History className={cn('text-amber-400', compact ? 'w-2 h-2' : 'w-2.5 h-2.5')} />
            {!compact && (
              <span className="text-[7px] text-amber-400/80 font-bold tracking-tight">REC</span>
            )}
          </>
        ) : (
          <>
            <span className={cn('rounded-full animate-pulse', compact ? 'w-0.5 h-0.5' : 'w-1 h-1', statusDot)} />
            <span className={cn('text-red-400 font-bold tracking-tight', compact ? 'text-[5px]' : 'text-[7px]')}>
              LIVE
            </span>
          </>
        )}
      </span>

      {badge && (
        <span className={cn(
          'absolute font-bold rounded bg-amber-500/30 text-amber-200 border border-amber-500/40 z-10',
          compact ? 'top-0.5 right-5 text-[5px] px-0.5 py-px' : 'top-1 right-7 text-[6px] px-1 py-px',
        )}>
          {badge}
        </span>
      )}

      <div className={cn(
        'absolute top-0.5 right-0.5 rounded-sm border-2 flex items-center justify-center transition-all z-10',
        compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5',
        selected
          ? 'bg-primary border-primary'
          : 'border-white/30 bg-black/30 opacity-0 group-hover:opacity-100',
      )}>
        {selected && <Check className={cn('text-white', compact ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5')} strokeWidth={3} />}
      </div>

      <div className={cn(
        'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent z-10',
        compact ? 'px-1 pb-1 pt-2' : 'px-1.5 pb-1.5 pt-4',
      )}>
        <p className={cn(
          'text-white/90 font-semibold truncate leading-snug',
          compact ? 'text-[6.5px]' : 'text-[9px]',
        )}>
          {cameraDisplayLabel(cam)}
        </p>
        {cameraMetaLabel(cam) && (
          <p className={cn(
            'text-blue-300/80 truncate leading-tight',
            compact ? 'text-[5.5px]' : 'text-[7.5px]',
          )}>
            {cameraMetaLabel(cam)}
          </p>
        )}
      </div>
    </div>
  )
}
