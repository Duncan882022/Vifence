import { useMemo } from 'react'
import { MapPin } from 'lucide-react'
import { SiteDigitalTwinMap } from '@/components/common/SiteDigitalTwinMap'
import { getViolationHeatColor } from '@/components/common/SiteDigitalTwinMap/siteDigitalTwinMap.utils'
import {
  computeHeatmapZones,
  getHeatIntensity,
} from '../services/safetyHeatmap.service'
import { SAFETY_VIOLATIONS } from '../data/safetyViolations'

interface SafetyZoneHeatmapProps {
  selectedZoneId?: string | null
  onSelectZone?: (zoneId: string | null) => void
}

export function SafetyZoneHeatmap({ selectedZoneId, onSelectZone }: SafetyZoneHeatmapProps) {
  const zones = useMemo(() => computeHeatmapZones(SAFETY_VIOLATIONS), [])
  const maxCount = Math.max(...zones.map(z => z.count), 1)
  const total = zones.reduce((s, z) => s + z.count, 0)

  const digitalZones = useMemo(
    () => zones.map(zone => {
      const intensity = getHeatIntensity(zone.count, maxCount)
      return {
        id: zone.id,
        label: zone.label,
        sublabel: zone.sublabel,
        intensity: intensity || 0.08,
        color: getViolationHeatColor(intensity, zone.peakSeverity),
        value: zone.count,
        badge: zone.pending > 0 ? zone.pending : undefined,
      }
    }),
    [zones, maxCount],
  )

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
            <span className="hidden md:inline text-muted-foreground/60">Digital Twin</span>
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

      <div className="flex-1 min-h-0 p-2 sm:p-3">
        <div className="relative h-full min-h-[150px] max-lg:min-h-[160px] max-lg:landscape:min-h-[130px] lg:min-h-[170px] rounded-lg border border-[#1e2433] overflow-hidden">
          <SiteDigitalTwinMap
            zones={digitalZones}
            mode="violations"
            selectedZoneId={selectedZoneId}
            onSelectZone={onSelectZone}
          />
        </div>
      </div>
    </div>
  )
}
