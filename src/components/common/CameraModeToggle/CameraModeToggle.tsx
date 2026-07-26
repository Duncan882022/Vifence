import { History, Radio } from 'lucide-react'
import { cn } from '@/utils/cn'

export type CameraPanelMode = 'live' | 'playback'

interface CameraModeToggleProps {
  mode: CameraPanelMode
  onChange: (mode: CameraPanelMode) => void
  className?: string
}

export function CameraModeToggle({ mode, onChange, className }: CameraModeToggleProps) {
  const isLive = mode === 'live'

  return (
    <div
      role="group"
      aria-label="Chế độ camera"
      className={cn(
        'relative grid grid-cols-2 rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-0.5 min-w-[152px] shrink-0',
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-md transition-transform duration-200 ease-out',
          isLive
            ? 'translate-x-0 bg-red-500/15 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.25)]'
            : 'translate-x-full bg-amber-500/15 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.25)]',
        )}
      />
      <button
        type="button"
        aria-pressed={isLive}
        onClick={() => onChange('live')}
        className={cn(
          'relative z-10 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wide transition-colors',
          isLive ? 'text-red-400' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span className="relative flex items-center justify-center w-3 h-3">
          <Radio className="w-3 h-3" />
          {isLive && (
            <span className="absolute w-1 h-1 rounded-full bg-red-400 animate-pulse" />
          )}
        </span>
        Live
      </button>
      <button
        type="button"
        aria-pressed={!isLive}
        onClick={() => onChange('playback')}
        className={cn(
          'relative z-10 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wide transition-colors',
          isLive ? 'text-muted-foreground hover:text-foreground' : 'text-amber-400',
        )}
      >
        <History className="w-3 h-3" />
        Playback
      </button>
    </div>
  )
}
