import { cn } from '@/utils/cn'

/** Icon toolbar — đồng bộ LIVE (Radio) + WiFi overlay bên trái. */
export function cameraToolbarIconSize(compact?: boolean) {
  return compact ? 'w-2 h-2' : 'w-2.5 h-2.5'
}

export const CAMERA_TOOLBAR_SHELL = cn(
  'flex items-center gap-0.5 p-0.5 rounded-lg',
  'bg-white/[0.07] backdrop-blur-xl backdrop-saturate-150',
  'border border-white/[0.14]',
  'shadow-md shadow-black/35 ring-1 ring-inset ring-white/[0.05]',
)

export function cameraToolbarBtn(compact?: boolean, active?: boolean) {
  return cn(
    'inline-flex items-center justify-center rounded-md transition-all duration-200',
    'shrink-0 pointer-events-auto',
    compact ? 'p-0.5' : 'p-1',
    active
      ? 'bg-sky-400/18 border border-sky-300/28 text-sky-100 shadow-inner shadow-sky-500/10'
      : cn(
          'border border-transparent text-white/80',
          'hover:text-white hover:bg-white/[0.12] hover:border-white/[0.1]',
          'active:scale-[0.96]',
        ),
  )
}

/** Nút toolbar độc lập (không nằm trong shell). */
export function cameraToolbarBtnStandalone(compact?: boolean, active?: boolean) {
  return cn(
    cameraToolbarBtn(compact, active),
    'bg-black/60 backdrop-blur-md border-white/[0.12]',
  )
}

export const CAMERA_LIVE_BADGE = cn(
  'inline-flex items-center gap-1 rounded-lg font-bold tracking-wide',
  'bg-white/[0.07] backdrop-blur-xl backdrop-saturate-150 border border-red-500/35 text-red-300',
  'shadow-md shadow-black/35 ring-1 ring-inset ring-white/[0.05]',
)

export const CAMERA_FLIGHT_MODE_BADGE = cn(
  'inline-flex items-center rounded-lg font-semibold tracking-wide',
  'bg-white/[0.07] backdrop-blur-xl backdrop-saturate-150',
  'shadow-md shadow-black/35 ring-1 ring-inset ring-white/[0.05]',
)
