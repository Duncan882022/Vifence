import { useMemo } from 'react'
import { AlertTriangle, MapPin } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  computeHeatmapZones,
} from '../services/safetyHeatmap.service'
import { SAFETY_VIOLATIONS } from '../data/safetyViolations'

interface SafetyZoneHeatmapProps {
  selectedZoneId?: string | null
  onSelectZone?: (zoneId: string | null) => void
}

type RiskLevel = 'none' | 'medium' | 'high'

function getRiskLevel(count: number): RiskLevel {
  if (count === 0) return 'none'
  if (count <= 2) return 'medium'
  return 'high'
}

const RISK_CONFIG: Record<RiskLevel, {
  cardBg: string
  cardBorder: string
  cardBorderHover: string
  accentBorder: string
  countColor: string
  labelColor: string
  sublabelColor: string
  barColor: string
  badgeBg: string
  badgeText: string
  badgeBorder: string
}> = {
  none: {
    cardBg: 'bg-[#0f1520]',
    cardBorder: 'border-[#1e2b3d]',
    cardBorderHover: 'hover:border-[#2d3f58]',
    accentBorder: 'border-l-[#2d3f58]',
    countColor: 'text-slate-500',
    labelColor: 'text-slate-400',
    sublabelColor: 'text-slate-600',
    barColor: 'bg-slate-700',
    badgeBg: '',
    badgeText: '',
    badgeBorder: '',
  },
  medium: {
    cardBg: 'bg-[#161208]',
    cardBorder: 'border-amber-900/40',
    cardBorderHover: 'hover:border-amber-600/50',
    accentBorder: 'border-l-amber-500',
    countColor: 'text-amber-400',
    labelColor: 'text-amber-200/90',
    sublabelColor: 'text-amber-700/80',
    barColor: 'bg-amber-500',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-500/30',
  },
  high: {
    cardBg: 'bg-[#160a0a]',
    cardBorder: 'border-red-900/40',
    cardBorderHover: 'hover:border-red-600/50',
    accentBorder: 'border-l-red-500',
    countColor: 'text-red-400',
    labelColor: 'text-red-200/90',
    sublabelColor: 'text-red-700/80',
    barColor: 'bg-red-500',
    badgeBg: 'bg-red-500/15',
    badgeText: 'text-red-400',
    badgeBorder: 'border-red-500/30',
  },
}

const LEGEND_ITEMS = [
  { color: 'bg-slate-700', label: 'Không vi phạm' },
  { color: 'bg-amber-500', label: '1–2 vi phạm' },
  { color: 'bg-red-500', label: '3+ vi phạm' },
]

export function SafetyZoneHeatmap({ selectedZoneId, onSelectZone }: SafetyZoneHeatmapProps) {
  const zones = useMemo(() => computeHeatmapZones(SAFETY_VIOLATIONS), [])
  const maxCount = useMemo(() => Math.max(...zones.map(z => z.count), 1), [zones])
  const total = useMemo(() => zones.reduce((s, z) => s + z.count, 0), [zones])
  const totalPending = useMemo(() => zones.reduce((s, z) => s + z.pending, 0), [zones])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-header */}
      <div className="px-3 py-2 border-b border-[#1e2433] shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate">
            <span className="font-semibold text-foreground">7 ngày qua</span>
            <span className="mx-1 hidden sm:inline">·</span>
            <span className="tabular-nums hidden sm:inline">{total} vi phạm</span>
            {totalPending > 0 && (
              <>
                <span className="mx-1 hidden md:inline text-muted-foreground/50">·</span>
                <span className="hidden md:inline text-amber-500/80 tabular-nums">{totalPending} chờ xử lý</span>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selectedZoneId && (
            <button
              type="button"
              onClick={() => onSelectZone?.(null)}
              className="text-[9px] text-primary hover:text-primary/80 px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors"
            >
              Bỏ lọc
            </button>
          )}
        </div>
      </div>

      {/* Grid of zone cards */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3 space-y-2 sm:space-y-3">
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          {zones.map(zone => {
            const risk = getRiskLevel(zone.count)
            const cfg = RISK_CONFIG[risk]
            const isSelected = selectedZoneId === zone.id
            const barWidth = zone.count > 0
              ? Math.max(6, Math.round((zone.count / maxCount) * 100))
              : 0

            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => onSelectZone?.(isSelected ? null : zone.id)}
                className={cn(
                  'relative text-left rounded-lg border border-l-4 p-2.5 sm:p-3',
                  'transition-all duration-150 group',
                  cfg.cardBg,
                  cfg.cardBorder,
                  cfg.cardBorderHover,
                  cfg.accentBorder,
                  isSelected && 'ring-1 ring-white/25 !border-white/20',
                  onSelectZone && 'cursor-pointer',
                )}
              >
                {/* Pending badge — top-right */}
                {zone.pending > 0 && (
                  <span className={cn(
                    'absolute top-2 right-2 text-[8px] font-semibold px-1 py-0.5 rounded border',
                    cfg.badgeBg,
                    cfg.badgeText,
                    cfg.badgeBorder,
                  )}>
                    {zone.pending} chờ
                  </span>
                )}

                {/* Zone label */}
                <p className={cn(
                  'text-[10px] sm:text-[11px] font-semibold leading-tight truncate pr-10',
                  cfg.labelColor,
                )}>
                  {zone.label}
                </p>
                {zone.sublabel && (
                  <p className={cn('text-[8px] leading-tight truncate mt-0.5', cfg.sublabelColor)}>
                    {zone.sublabel}
                  </p>
                )}

                {/* Big count */}
                <div className="mt-2 flex items-baseline gap-1">
                  <span className={cn(
                    'text-2xl sm:text-3xl font-bold tabular-nums leading-none',
                    cfg.countColor,
                  )}>
                    {zone.count}
                  </span>
                  <span className="text-[9px] text-muted-foreground/50 leading-none">vi phạm</span>
                </div>

                {/* Risk bar */}
                <div className="mt-2 h-[3px] bg-[#1e2433] rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', cfg.barColor)}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                {/* Selected indicator */}
                {isSelected && (
                  <div className="absolute inset-0 rounded-lg ring-1 ring-white/15 pointer-events-none" />
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 pt-0.5 px-0.5">
          {LEGEND_ITEMS.map(item => (
            <span key={item.label} className="inline-flex items-center gap-1 text-[8px] text-muted-foreground/60">
              <span className={cn('w-2 h-2 rounded-sm shrink-0', item.color)} />
              {item.label}
            </span>
          ))}
          {totalPending > 0 && (
            <span className="inline-flex items-center gap-1 text-[8px] text-amber-600/70 ml-auto">
              <AlertTriangle className="w-2.5 h-2.5" />
              {totalPending} chờ xử lý
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
