import { cn } from '@/utils/cn'

export const CAMERA_TOOLBAR_SHELL = cn(
  'flex items-center gap-0.5 p-0.5 rounded-lg',
  'bg-black/60 backdrop-blur-md border border-white/10 shadow-lg shadow-black/40',
)

export function cameraToolbarBtn(compact?: boolean, active?: boolean) {
  return cn(
    'inline-flex items-center justify-center rounded-md transition-all duration-150',
    compact ? 'w-6 h-6' : 'w-7 h-7',
    active
      ? 'bg-sky-500/25 border border-sky-400/35 text-sky-100'
      : 'border border-transparent text-white/75 hover:text-white hover:bg-white/10 hover:border-white/10',
  )
}

export const CAMERA_LIVE_BADGE = cn(
  'inline-flex items-center gap-1 rounded-md font-bold tracking-wide',
  'bg-black/60 backdrop-blur-md border border-red-500/35 text-red-300',
)
