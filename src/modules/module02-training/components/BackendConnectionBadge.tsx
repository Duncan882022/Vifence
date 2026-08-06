import { Loader2, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useMobileAiBackendHealth } from '../hooks/useMobileAiBackendHealth'
import { cameraToolbarBtn } from './cameraToolbarStyles'

interface BackendConnectionBadgeProps {
  compact?: boolean
  className?: string
  /** chip = badge cạnh LIVE (dễ thấy); icon = nút toolbar nhỏ */
  variant?: 'chip' | 'icon'
}

const STATUS_META = {
  connected: {
    label: 'Backend AI đã kết nối',
    short: 'AI OK',
    Icon: Wifi,
    iconClass: 'text-green-400',
    chipClass: 'border-green-500/40 text-green-300',
    btnActive: true,
    pulse: true,
  },
  disconnected: {
    label: 'Backend AI mất kết nối — bấm để thử lại',
    short: 'AI OFF',
    Icon: WifiOff,
    iconClass: 'text-red-400',
    chipClass: 'border-red-500/45 text-red-300',
    btnActive: false,
    pulse: false,
  },
  checking: {
    label: 'Đang kiểm tra backend AI…',
    short: 'AI …',
    Icon: Loader2,
    iconClass: 'text-sky-400 animate-spin',
    chipClass: 'border-sky-500/35 text-sky-300',
    btnActive: false,
    pulse: false,
  },
  unconfigured: {
    label: 'Chưa cấu hình backend — bấm ⚙ góc phải',
    short: 'AI —',
    Icon: WifiOff,
    iconClass: 'text-gray-400',
    chipClass: 'border-gray-500/35 text-gray-400',
    btnActive: false,
    pulse: false,
  },
} as const

export function BackendConnectionBadge({
  compact,
  className,
  variant = 'chip',
}: BackendConnectionBadgeProps) {
  const { status, recheck } = useMobileAiBackendHealth()
  const meta = STATUS_META[status]
  const Icon = meta.Icon

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          recheck()
        }}
        className={cn(
          cameraToolbarBtn(compact, meta.btnActive),
          status === 'disconnected' && 'border-red-500/30',
          className,
        )}
        title={meta.label}
        aria-label={meta.label}
      >
        <Icon className={cn(compact ? 'w-3 h-3' : 'w-3.5 h-3.5', meta.iconClass)} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        recheck()
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md font-bold tracking-wide',
        'bg-black/60 backdrop-blur-md border pointer-events-auto',
        meta.chipClass,
        compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]',
        className,
      )}
      title={meta.label}
      aria-label={meta.label}
    >
      {meta.pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" aria-hidden />
      )}
      <Icon className={cn(compact ? 'w-2 h-2' : 'w-2.5 h-2.5', meta.iconClass)} aria-hidden />
      {meta.short}
    </button>
  )
}
