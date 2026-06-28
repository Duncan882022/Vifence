import { useState } from 'react'
import { Maximize2, X, Grid2x2, LayoutGrid, Radio } from 'lucide-react'
import { cn } from '@/utils/cn'
import { AccessGateVideoFeed } from './AccessGateVideoFeed'
import {
  ACCESS_AI_OVERLAYS,
  ACCESS_GATE_OPTIONS,
  ACCESS_GATES,
} from '../data/accessCameras'
import type { AccessGate, AccessGateId } from '@/types/access'

const CCTV_SCANLINE = {
  backgroundImage:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
} as const

type ViewMode = 'grid' | 'single'

function GateCell({ gate, compact, onMaximize }: {
  gate: AccessGate
  compact?: boolean
  onMaximize: () => void
}) {
  const detections = ACCESS_AI_OVERLAYS[gate.id]

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg bg-[#060b14] border border-[#1e2433]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
      <AccessGateVideoFeed
        cameraId={gate.cameraId}
        zone={gate.zone}
        src={gate.streamUrl}
        detections={detections}
        compact={compact}
      />
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />

      <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1">
        <span className={cn(
          'bg-red-500/90 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0',
          compact ? 'text-[8px]' : 'text-[10px]',
        )}>
          <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
        <button
          type="button"
          onClick={onMaximize}
          className="p-1 rounded bg-black/50 hover:bg-black/80 text-white transition-colors shrink-0"
          title="Phóng to"
        >
          <Maximize2 className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
        </button>
      </div>

      <div className={cn(
        'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent',
        compact ? 'px-2 pt-5 pb-1.5' : 'px-3 pt-10 pb-3',
      )}>
        <span className={cn(
          'font-semibold text-white tracking-wide truncate block',
          compact ? 'text-[9px]' : 'text-[13px]',
        )}>
          {gate.name}
        </span>
      </div>
    </div>
  )
}

function FullscreenOverlay({ gate, onClose }: { gate: AccessGate | null; onClose: () => void }) {
  if (!gate) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex flex-col gap-2"
        style={{ width: '80vw', height: '75vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-red-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="text-sm font-semibold text-white truncate">{gate.name}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
          <GateCell gate={gate} onMaximize={onClose} />
        </div>
      </div>
    </div>
  )
}

export function AccessLiveCameraPanel() {
  const [gateFilter, setGateFilter] = useState<'all' | AccessGateId>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [focusedGate, setFocusedGate] = useState<AccessGate | null>(null)

  const visibleGates = gateFilter === 'all'
    ? ACCESS_GATES
    : ACCESS_GATES.filter(g => g.id === gateFilter)

  const displayGates = viewMode === 'single' ? visibleGates.slice(0, 1) : visibleGates
  const compact = displayGates.length > 2

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center gap-1 text-[9px] font-bold text-green-400 shrink-0">
              <Radio className="w-3 h-3" />
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
            <select
              value={gateFilter}
              onChange={e => setGateFilter(e.target.value as 'all' | AccessGateId)}
              className="text-[9px] bg-[#1a2235] border border-[#1e2433] rounded px-2 py-1 text-foreground min-w-0 max-w-[140px]"
            >
              {ACCESS_GATE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-1 rounded transition-colors',
                viewMode === 'grid' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
              )}
              title="Lưới 2×2"
            >
              <Grid2x2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className={cn(
                'p-1 rounded transition-colors',
                viewMode === 'single' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
              )}
              title="Một luồng"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-2">
          <div
            className="grid gap-1.5 h-full min-h-[200px] lg:min-h-0"
            style={{
              gridTemplateColumns: displayGates.length === 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gridTemplateRows: displayGates.length <= 2 ? '1fr' : 'repeat(2, minmax(0, 1fr))',
            }}
          >
            {displayGates.map(gate => (
              <div key={gate.id} className="relative min-h-[120px] min-w-0">
                <GateCell gate={gate} compact={compact} onMaximize={() => setFocusedGate(gate)} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 px-3 py-2 border-t border-[#1e2433] shrink-0 text-[8px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-500/60 border border-emerald-400/80" />
            Người đăng ký
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-amber-500/60 border border-amber-400/80" />
            Phương tiện
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500/60 border border-red-400/80" />
            Chưa đăng ký
          </span>
        </div>
      </div>

      <FullscreenOverlay gate={focusedGate} onClose={() => setFocusedGate(null)} />
    </>
  )
}
