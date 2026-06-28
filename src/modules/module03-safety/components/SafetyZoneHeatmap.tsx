import { useMemo } from 'react'
import { MapPin } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  computeHeatmapZones,
  getHeatIntensity,
  type HeatmapZoneCell,
} from '../services/safetyHeatmap.service'
import { SAFETY_VIOLATIONS, VIOLATION_SEVERITY_LABELS } from '../data/safetyViolations'

const GRID = 3
const CELL = 68
const GAP = 5
const SCENE = GRID * CELL

interface HeatColors {
  top: string
  front: string
  right: string
}

function getHeatColors(intensity: number, peak: HeatmapZoneCell['peakSeverity']): HeatColors {
  if (intensity === 0) {
    return { top: 'rgb(30,36,51)', front: 'rgb(22,27,40)', right: 'rgb(16,20,32)' }
  }
  if (peak === 'high' || intensity > 0.7) {
    const a = 0.35 + intensity * 0.5
    return {
      top: `rgba(239,68,68,${a})`,
      front: `rgba(180,45,45,${Math.min(1, a + 0.18)})`,
      right: `rgba(130,30,30,${Math.min(1, a + 0.25)})`,
    }
  }
  if (peak === 'medium' || intensity > 0.4) {
    const a = 0.3 + intensity * 0.45
    return {
      top: `rgba(249,115,22,${a})`,
      front: `rgba(190,80,15,${Math.min(1, a + 0.15)})`,
      right: `rgba(140,55,10,${Math.min(1, a + 0.22)})`,
    }
  }
  const a = 0.25 + intensity * 0.4
  return {
    top: `rgba(251,191,36,${a})`,
    front: `rgba(190,140,20,${Math.min(1, a + 0.12)})`,
    right: `rgba(140,100,15,${Math.min(1, a + 0.2)})`,
  }
}

function barHeight(count: number, intensity: number): number {
  if (count === 0) return 4
  return 10 + intensity * 52
}

interface ZoneBlock3DProps {
  zone: HeatmapZoneCell
  intensity: number
  isSelected: boolean
  onSelect: () => void
}

function ZoneBlock3D({ zone, intensity, isSelected, onSelect }: ZoneBlock3DProps) {
  const colors = getHeatColors(intensity, zone.peakSeverity)
  const h = barHeight(zone.count, intensity)
  const colSpan = zone.colSpan ?? 1
  const rowSpan = zone.rowSpan ?? 1
  const w = colSpan * CELL - GAP
  const d = rowSpan * CELL - GAP
  const left = (zone.col - 1) * CELL + GAP / 2
  const top = (zone.row - 1) * CELL + GAP / 2

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${zone.label}: ${zone.count} vi phạm`}
      className={cn(
        'absolute p-0 cursor-pointer transition-[filter] duration-200',
        'hover:brightness-110 focus:outline-none',
        isSelected && 'brightness-110',
      )}
      style={{
        left,
        top,
        width: w,
        height: d,
        transformStyle: 'preserve-3d',
        background: 'transparent',
        border: 'none',
      }}
    >
      {/* Mặt trên */}
      <span
        className={cn(
          'absolute inset-0 flex flex-col justify-between p-1.5 pointer-events-none',
          isSelected && 'ring-1 ring-primary ring-offset-0',
        )}
        style={{
          background: colors.top,
          transform: `translateZ(${h}px)`,
          border: isSelected ? '1px solid hsl(var(--primary))' : '1px solid rgba(255,255,255,0.07)',
          boxShadow: isSelected ? '0 0 12px rgba(59,130,246,0.35)' : undefined,
        }}
      >
        <div className="min-w-0 text-left">
          <p className="text-[8px] sm:text-[9px] font-bold text-white/95 leading-tight truncate">{zone.label}</p>
          {zone.sublabel && (
            <p className="text-[6px] sm:text-[7px] text-white/45 truncate hidden sm:block">{zone.sublabel}</p>
          )}
        </div>
        <div className="flex items-end justify-between gap-0.5">
          <span className={cn(
            'text-sm sm:text-base font-bold tabular-nums leading-none',
            zone.count === 0 ? 'text-white/30' : 'text-white',
          )}>
            {zone.count}
          </span>
          {zone.pending > 0 && (
            <span className="text-[6px] font-bold text-red-200 bg-red-600/40 px-0.5 py-px rounded">
              {zone.pending}
            </span>
          )}
        </div>
      </span>

      {/* Mặt trước */}
      <span
        className="absolute left-0 bottom-0 pointer-events-none"
        style={{
          width: '100%',
          height: h,
          background: colors.front,
          transformOrigin: 'bottom center',
          transform: 'rotateX(-90deg)',
        }}
      />

      {/* Mặt phải */}
      <span
        className="absolute right-0 top-0 pointer-events-none"
        style={{
          width: h,
          height: '100%',
          background: colors.right,
          transformOrigin: 'right center',
          transform: 'rotateY(90deg)',
        }}
      />
    </button>
  )
}

interface SafetyZoneHeatmapProps {
  selectedZoneId?: string | null
  onSelectZone?: (zoneId: string | null) => void
}

export function SafetyZoneHeatmap({ selectedZoneId, onSelectZone }: SafetyZoneHeatmapProps) {
  const zones = useMemo(() => computeHeatmapZones(SAFETY_VIOLATIONS), [])
  const maxCount = Math.max(...zones.map(z => z.count), 1)
  const total = zones.reduce((s, z) => s + z.count, 0)

  return (
    <div className="flex flex-col h-full min-h-0 max-lg:min-h-[220px] max-lg:landscape:min-h-[180px]">
      <div className="px-3 py-2 border-b border-[#1e2433] shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground truncate">
            <span className="font-semibold text-foreground">7 ngày qua</span>
            <span className="mx-1.5 hidden sm:inline">·</span>
            <span className="tabular-nums hidden sm:inline">{total} vi phạm</span>
            <span className="mx-1.5 hidden md:inline text-muted-foreground/60">·</span>
            <span className="hidden md:inline text-muted-foreground/60">Mô hình 3D</span>
          </p>
        </div>
        {selectedZoneId && (
          <button
            type="button"
            onClick={() => onSelectZone?.(null)}
            className="text-[9px] text-primary hover:text-primary/80 shrink-0 px-1.5 py-0.5 rounded hover:bg-primary/10"
          >
            Bỏ lọc
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 p-2 sm:p-3 flex flex-col gap-2">
        <div
          className={cn(
            'relative flex-1 min-h-[150px] max-lg:min-h-[160px] max-lg:landscape:min-h-[130px] lg:min-h-[170px]',
            'rounded-lg border border-[#1e2433] bg-[#060912] overflow-hidden',
            'flex items-center justify-center',
          )}
        >
          {/* Nền gradient */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_80%,rgba(30,58,138,0.12),transparent_65%)] pointer-events-none" />

          <div
            className="relative scale-[0.72] sm:scale-[0.82] md:scale-90 lg:scale-100"
            style={{ perspective: '720px', perspectiveOrigin: '50% 42%' }}
          >
            <div
              style={{
                width: SCENE,
                height: SCENE,
                transform: 'rotateX(54deg) rotateZ(-43deg)',
                transformStyle: 'preserve-3d',
                position: 'relative',
              }}
            >
              {/* Sàn công trường */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `
                    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px),
                    #0a0e18
                  `,
                  backgroundSize: `${CELL}px ${CELL}px`,
                  border: '1px solid #1e2433',
                  transform: 'translateZ(-6px)',
                  boxShadow: '0 0 40px rgba(0,0,0,0.45)',
                }}
              />

              {zones.map(zone => {
                const intensity = getHeatIntensity(zone.count, maxCount)
                const isSelected = selectedZoneId === zone.id
                return (
                  <ZoneBlock3D
                    key={zone.id}
                    zone={zone}
                    intensity={intensity}
                    isSelected={isSelected}
                    onSelect={() => onSelectZone?.(isSelected ? null : zone.id)}
                  />
                )
              })}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[8px] sm:text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-[#1e2433]" />
            Không
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-amber-500/40" />
            {VIOLATION_SEVERITY_LABELS.low}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-orange-500/50" />
            TB
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-red-500/60" />
            {VIOLATION_SEVERITY_LABELS.high}
          </span>
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <span className="hidden sm:inline text-muted-foreground/60">Chiều cao = mật độ vi phạm</span>
        </div>
      </div>
    </div>
  )
}
