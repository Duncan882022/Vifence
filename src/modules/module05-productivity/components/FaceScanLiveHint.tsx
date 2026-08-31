import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
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
}

function HintIcon({ direction, tone }: { direction: LiveScanDirection; tone: LiveScanTone }) {
  const cls = cn(
    'w-7 h-7 shrink-0',
    tone === 'success' && 'text-green-400',
    tone === 'active' && 'text-sky-300',
    tone === 'warn' && 'text-amber-300',
    tone === 'neutral' && 'text-white/70',
    (direction === 'left' || direction === 'right') && tone === 'active' && 'animate-pulse',
  )

  switch (direction) {
    case 'left':
      return <ArrowLeft className={cls} aria-hidden />
    case 'right':
      return <ArrowRight className={cls} aria-hidden />
    case 'down':
      return <ArrowDown className={cn(cls, tone === 'active' && 'animate-bounce')} aria-hidden />
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
      return <ScanFace className={cls} aria-hidden />
  }
}

export function FaceScanLiveHint({ hint, holdProgress = 0 }: FaceScanLiveHintProps) {
  const showHoldBar = hint.direction === 'hold' && holdProgress > 0 && holdProgress < 1

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
