import { useMemo } from 'react'
import { MapPin } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  computeHousekeepingScoreZones,
  getScoreBarHeight,
  getScoreZoneColors,
  type ScoreZoneCell,
} from '../services/housekeepingHeatmap.service'
import { SCORE_TIER_LABELS } from '../data/housekeepingScores'
import type { ScoreTier } from '@/types/housekeeping'

const GRID = 3
const CELL = 68
const GAP = 5
const SCENE = GRID * CELL

interface ZoneBlock3DProps {
  zone: ScoreZoneCell
  isSelected: boolean
  onSelect: () => void
}

function ZoneBlock3D({ zone, isSelected, onSelect }: ZoneBlock3DProps) {
  const colors = getScoreZoneColors(zone.tier)
  const h = getScoreBarHeight(zone.score)
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
      title={`${zone.label}: ${zone.score} điểm`}
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
      <span
        className={cn(
          'absolute inset-0 flex flex-col justify-between p-1.5 pointer-events-none',
          isSelected && 'ring-1 ring-sky-400 ring-offset-0',
        )}
        style={{
          background: colors.top,
          transform: `translateZ(${h}px)`,
          border: isSelected ? '1px solid rgb(56,189,248)' : '1px solid rgba(255,255,255,0.07)',
          boxShadow: isSelected ? '0 0 12px rgba(56,189,248,0.35)' : undefined,
        }}
      >
        <div className="min-w-0 text-left">
          <p className="text-[8px] sm:text-[9px] font-bold text-white/95 leading-tight truncate">{zone.label}</p>
          {zone.sublabel && (
            <p className="text-[6px] sm:text-[7px] text-white/45 truncate hidden sm:block">{zone.sublabel}</p>
          )}
        </div>
        <span className="text-sm sm:text-base font-bold tabular-nums leading-none text-white">
          {zone.score}
        </span>
      </span>

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

const LEGEND: { tier: ScoreTier; color: string; label: string }[] = [
  { tier: 'good', color: 'bg-sky-500/60', label: '≥ 80 — Tốt' },
  { tier: 'average', color: 'bg-orange-500/60', label: '60–79 — Trung bình' },
  { tier: 'poor', color: 'bg-red-500/60', label: '< 60 — Kém' },
]

interface HousekeepingZoneHeatmapProps {
  selectedZoneId?: string | null
  onSelectZone?: (zoneId: string | null) => void
  compact?: boolean
}

export function HousekeepingZoneHeatmap({
  selectedZoneId,
  onSelectZone,
  compact = false,
}: HousekeepingZoneHeatmapProps) {
  const zones = useMemo(() => computeHousekeepingScoreZones(), [])
  const mainZones = zones.filter(z => ['khu-a', 'khu-b', 'khu-c', 'khu-d'].includes(z.id))

  return (
    <div className={cn(
      'flex flex-col h-full min-h-0',
      !compact && 'max-lg:min-h-[220px] max-lg:landscape:min-h-[180px]',
    )}>
      {!compact && (
        <div className="px-3 py-2 border-b border-[#1e2433] shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
            <p className="text-[10px] text-muted-foreground truncate">
              <span className="font-semibold text-foreground">Theo khu vực</span>
              <span className="mx-1.5 hidden sm:inline">·</span>
              <span className="hidden sm:inline text-muted-foreground/60">Mô hình 3D</span>
            </p>
          </div>
          {selectedZoneId && (
            <button
              type="button"
              onClick={() => onSelectZone?.(null)}
              className="text-[9px] text-sky-400 hover:text-sky-300 shrink-0 px-1.5 py-0.5 rounded hover:bg-sky-500/10"
            >
              Bỏ lọc
            </button>
          )}
        </div>
      )}

      <div className={cn('flex-1 min-h-0 flex flex-col gap-2', compact ? 'p-0' : 'p-2 sm:p-3')}>
        <div
          className={cn(
            'relative flex-1 rounded-lg border border-[#1e2433] bg-[#060912] overflow-hidden',
            'flex items-center justify-center',
            compact ? 'min-h-[160px]' : 'min-h-[150px] max-lg:min-h-[160px] lg:min-h-[170px]',
          )}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_80%,rgba(56,189,248,0.1),transparent_65%)] pointer-events-none" />

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
                const isSelected = selectedZoneId === zone.id
                return (
                  <ZoneBlock3D
                    key={zone.id}
                    zone={zone}
                    isSelected={isSelected}
                    onSelect={() => onSelectZone?.(isSelected ? null : zone.id)}
                  />
                )
              })}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[8px] sm:text-[9px] text-muted-foreground">
          {LEGEND.map(item => (
            <span key={item.tier} className="inline-flex items-center gap-1">
              <span className={cn('w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm', item.color)} />
              {item.label}
            </span>
          ))}
        </div>

        {!compact && (
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {mainZones.map(z => (
              <div
                key={z.id}
                className="text-center px-2 py-1 rounded border border-[#1e2433] bg-[#0b0f1a]"
              >
                <p className="text-[8px] text-muted-foreground">{z.label}</p>
                <p className="text-sm font-bold tabular-nums text-foreground">{z.score}</p>
                <p className="text-[7px] text-muted-foreground">{SCORE_TIER_LABELS[z.tier]}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
