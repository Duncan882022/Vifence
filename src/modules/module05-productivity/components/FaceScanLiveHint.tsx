import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Loader2,
  ScanFace,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { LiveScanDirection, LiveScanHint, LiveScanTone } from '../utils/patrolFaceScanGuide'

interface FaceScanLiveHintProps {
  hint: LiveScanHint
  holdProgress?: number
  /** pill = chữ + icon dưới camera; center-arrow = chỉ mũi tên xanh giữa khung */
  variant?: 'pill' | 'center-arrow'
}

function HintIcon({
  direction,
  tone,
  className,
  greenOnly = false,
}: {
  direction: LiveScanDirection
  tone: LiveScanTone
  className?: string
  greenOnly?: boolean
}) {
  const cls = cn(
    'shrink-0',
    className ?? 'w-7 h-7',
    greenOnly
      ? 'text-green-400'
      : cn(
          tone === 'success' && 'text-green-400',
          tone === 'active' && 'text-sky-300',
          tone === 'warn' && 'text-amber-300',
          tone === 'neutral' && 'text-white/70',
        ),
    !greenOnly && (direction === 'left' || direction === 'right') && tone === 'active' && 'animate-pulse',
  )

  switch (direction) {
    case 'left':
      return <ArrowLeft className={cls} aria-hidden />
    case 'right':
      return <ArrowRight className={cls} aria-hidden />
    case 'down':
      return <ArrowDown className={cn(cls, (greenOnly || tone === 'active') && 'animate-bounce')} aria-hidden />
    case 'up':
      return <ArrowUp className={cn(cls, (greenOnly || tone === 'active') && 'animate-bounce')} aria-hidden />
    case 'closer':
      return <ZoomIn className={cls} aria-hidden />
    case 'farther':
      return <ZoomOut className={cls} aria-hidden />
    case 'loading':
      return <Loader2 className={cn(cls, 'animate-spin')} aria-hidden />
    case 'hold':
    case 'front':
    case 'center':
      return <ScanFace className={cls} aria-hidden />
    default:
      return null
  }
}

export function FaceScanLiveHint({
  hint,
  holdProgress = 0,
  variant = 'center-arrow',
}: FaceScanLiveHintProps) {
  const showHoldBar = hint.direction === 'hold' && holdProgress > 0 && holdProgress < 1

  if (variant === 'center-arrow') {
    if (hint.direction === 'none') return null

    return (
      <div
        className="absolute inset-0 z-[45] pointer-events-none flex flex-col items-center justify-center gap-3"
        aria-live="polite"
        aria-atomic="true"
        aria-label={hint.text}
      >
        <HintIcon
          direction={hint.direction}
          tone={hint.tone}
          greenOnly
          className="w-14 h-14 sm:w-16 sm:h-16 drop-shadow-[0_0_14px_rgba(74,222,128,0.9)]"
        />
        {showHoldBar && (
          <div className="w-[min(40vw,140px)] h-1 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-green-400 transition-[width] duration-75 ease-linear"
              style={{ width: `${Math.round(holdProgress * 100)}%` }}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="absolute inset-x-[8%] bottom-[14%] z-[45] pointer-events-none flex flex-col items-center gap-1.5"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={cn(
          'inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border shadow-lg backdrop-blur-md',
          hint.tone === 'success' && 'bg-green-500/25 border-green-400/40 text-green-50',
          hint.tone === 'active' && 'bg-sky-500/20 border-sky-400/35 text-white',
          hint.tone === 'warn' && 'bg-amber-500/20 border-amber-400/35 text-amber-50',
          hint.tone === 'neutral' && 'bg-black/55 border-white/15 text-white/90',
        )}
      >
        <HintIcon direction={hint.direction} tone={hint.tone} />
        <span className="text-sm sm:text-base font-semibold leading-tight">{hint.text}</span>
      </div>

      {showHoldBar && (
        <div className="w-[min(52vw,180px)] h-1 rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full bg-green-400 transition-[width] duration-75 ease-linear"
            style={{ width: `${Math.round(holdProgress * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
