import { Layers, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/utils/cn'

interface PatrolHeatmapSectionControlsProps {
  flymapActive: boolean
  onFlymapToggle: () => void
  expanded?: boolean
  onExpand?: () => void
  onCloseExpand?: () => void
}

export function PatrolHeatmapSectionControls({
  flymapActive,
  onFlymapToggle,
  expanded = false,
  onExpand,
  onCloseExpand,
}: PatrolHeatmapSectionControlsProps) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={onFlymapToggle}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-medium transition-colors',
          flymapActive
            ? 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30'
            : 'hover:bg-[#1a2235] text-muted-foreground hover:text-foreground',
        )}
        title={flymapActive ? 'Tắt Flymap — về heatmap site' : 'Bật Flymap — xem mật độ flycam'}
        aria-pressed={flymapActive}
        aria-label={flymapActive ? 'Tắt Flymap' : 'Bật Flymap'}
      >
        <Layers className="w-3 h-3 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Flymap</span>
      </button>
      {expanded ? (
        <button
          type="button"
          onClick={onCloseExpand}
          className="p-1 rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors"
          title="Thu nhỏ heatmap"
          aria-label="Thu nhỏ heatmap"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onExpand}
          className="p-1 rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors"
          title="Phóng to heatmap"
          aria-label="Phóng to heatmap"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
