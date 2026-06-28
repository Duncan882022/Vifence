import { useMemo } from 'react'
import { MapPin } from 'lucide-react'
import { cn } from '@/utils/cn'
import { SiteDigitalTwinMap } from '@/components/common/SiteDigitalTwinMap'
import {
  getScoreHeatColor,
  getScoreHeatIntensity,
} from '@/components/common/SiteDigitalTwinMap/siteDigitalTwinMap.utils'
import { computeHousekeepingScoreZones } from '../services/housekeepingHeatmap.service'
import { SCORE_TIER_LABELS } from '../data/housekeepingScores'

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

  const digitalZones = useMemo(
    () => zones.map(zone => ({
      id: zone.id,
      label: zone.label,
      sublabel: zone.sublabel,
      intensity: getScoreHeatIntensity(zone.tier, zone.score),
      color: getScoreHeatColor(zone.tier),
      value: zone.score,
    })),
    [zones],
  )

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
              <span className="hidden sm:inline text-muted-foreground/60">Digital Twin</span>
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
            'relative flex-1 rounded-lg border border-[#1e2433] overflow-hidden',
            compact ? 'min-h-[160px]' : 'min-h-[150px] max-lg:min-h-[160px] lg:min-h-[170px]',
          )}
        >
          <SiteDigitalTwinMap
            zones={digitalZones}
            mode="score"
            selectedZoneId={selectedZoneId}
            onSelectZone={onSelectZone}
          />
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
