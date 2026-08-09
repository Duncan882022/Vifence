import { cn } from '@/utils/cn'

/** Kích icon toolbar — đồng bộ cấu hình / ẩn hiện / phóng to. */
export function cameraToolbarIconSize(compact?: boolean) {
  return compact ? 'w-3 h-3' : 'w-3.5 h-3.5'
}

export const CAMERA_TOOLBAR_SHELL = cn(
  'flex items-center gap-0.5 p-0.5 rounded-xl',
  'bg-white/[0.07] backdrop-blur-xl backdrop-saturate-150',
  'border border-white/[0.14]',
  'shadow-lg shadow-black/45 ring-1 ring-inset ring-white/[0.06]',
)

export function cameraToolbarBtn(compact?: boolean, active?: boolean) {
  return cn(
    'inline-flex items-center justify-center rounded-lg transition-all duration-200',
    'shrink-0 pointer-events-auto',
    compact ? 'w-6 h-6' : 'w-7 h-7',
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
    'bg-white/[0.06] backdrop-blur-md border-white/[0.12]',
  )
}

export const CAMERA_LIVE_BADGE = cn(
  'inline-flex items-center gap-1 rounded-lg font-bold tracking-wide',
  'bg-white/[0.07] backdrop-blur-xl backdrop-saturate-150 border border-red-500/35 text-red-300',
  'shadow-md shadow-black/35 ring-1 ring-inset ring-white/[0.05]',
)
