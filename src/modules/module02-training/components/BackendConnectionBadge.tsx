import { Loader2, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useMobileAiBackendHealth } from '../hooks/useMobileAiBackendHealth'
import { cameraToolbarBtn } from './cameraToolbarStyles'

interface BackendConnectionBadgeProps {
  compact?: boolean
  className?: string
  /** overlay = cạnh LIVE trên video; toolbar = nút toolbar góc phải */
  variant?: 'overlay' | 'toolbar'
}

const STATUS_META = {
  connected: {
    label: 'Backend AI đã kết nối',
    Icon: Wifi,
    iconClass: 'text-green-400',
    shellClass: 'border-green-500/40',
    btnActive: true,
    pulse: true,
  },
  disconnected: {
    label: 'Backend AI mất kết nối — bấm để thử lại',
    Icon: WifiOff,
    iconClass: 'text-red-400',
    shellClass: 'border-red-500/45',
    btnActive: false,
    pulse: false,
  },
  checking: {
    label: 'Đang kiểm tra backend AI…',
    Icon: Loader2,
    iconClass: 'text-sky-400 animate-spin',
    shellClass: 'border-sky-500/35',
    btnActive: false,
    pulse: false,
  },
  unconfigured: {
    label: 'Chưa cấu hình backend — bấm ⚙ góc phải',
    Icon: WifiOff,
    iconClass: 'text-gray-400',
    shellClass: 'border-gray-500/35',
    btnActive: false,
    pulse: false,
  },
} as const

export function BackendConnectionBadge({
  compact,
  className,
  variant = 'overlay',
}: BackendConnectionBadgeProps) {
  const { status, recheck } = useMobileAiBackendHealth()
  const meta = STATUS_META[status]
  const Icon = meta.Icon
  const iconSize = compact ? 'w-2.5 h-2.5' : 'w-3 h-3'

  if (variant === 'toolbar') {
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
        'inline-flex items-center justify-center rounded-md pointer-events-auto',
        'bg-black/60 backdrop-blur-md border',
        meta.shellClass,
        compact ? 'p-0.5' : 'p-1',
        className,
      )}
      title={meta.label}
      aria-label={meta.label}
    >
      {meta.pulse ? (
        <span className="relative inline-flex">
          <span
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"
            aria-hidden
          />
          <Icon className={cn(iconSize, meta.iconClass)} aria-hidden />
        </span>
      ) : (
        <Icon className={cn(iconSize, meta.iconClass)} aria-hidden />
      )}
    </button>
  )
}
