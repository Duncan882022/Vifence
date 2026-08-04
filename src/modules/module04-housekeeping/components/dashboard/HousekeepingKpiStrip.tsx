import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Clock,
  Droplets,
  MapPin,
  Percent,
  Route,
  Sparkles,
  Trash2,
  Truck,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { HousekeepingDashboardKpis } from '../../types/housekeepingAi.types'

interface HousekeepingKpiStripProps {
  kpis: HousekeepingDashboardKpis
  embedded?: boolean
}

function KpiCard({
  title,
  value,
  unit,
  icon: Icon,
  iconColor,
  accent,
  embedded,
}: {
  title: string
  value: string | number
  unit?: string
  icon: LucideIcon
  iconColor: string
  accent: string
  embedded?: boolean
}) {
  return (
    <div className={cn(
      'border border-[#1e2433] border-l-2 rounded-lg p-2.5 flex flex-col gap-1 min-w-0',
      embedded ? 'bg-[#0b0f1a]' : 'bg-[#0d1117]',
      accent,
    )}>
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={cn('w-3.5 h-3.5 shrink-0', iconColor)} aria-hidden />
        <p className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
          {title}
        </p>
      </div>
      <p className="text-lg font-bold tabular-nums text-foreground leading-none">
        {value}
        {unit && <span className="text-[10px] font-medium text-muted-foreground ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}

export function HousekeepingKpiStrip({ kpis, embedded }: HousekeepingKpiStripProps) {
  const { logistics, housekeeping } = kpis

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <Truck className="w-3.5 h-3.5 text-amber-400" aria-hidden />
        <h3 className="text-[10px] font-semibold text-foreground/90 uppercase tracking-wide">
          KPI Logistics
        </h3>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiCard
          title="Tuyến bị chiếm dụng"
          value={logistics.occupiedRoutes}
          icon={Route}
          iconColor="text-amber-400"
          accent="border-l-amber-500/50"
          embedded={embedded}
        />
        <KpiCard
          title="TG chiếm dụng TB"
          value={logistics.avgOccupancyMinutes}
          unit="phút"
          icon={Clock}
          iconColor="text-amber-400"
          accent="border-l-amber-500/50"
          embedded={embedded}
        />
        <KpiCard
          title="Vị trí nhiều nhất"
          value={logistics.topOccupancyLocation}
          icon={MapPin}
          iconColor="text-amber-400"
          accent="border-l-amber-500/50"
          embedded={embedded}
        />
        <KpiCard
          title="Chưa xử lý (LOG)"
          value={logistics.unhandledCount}
          icon={AlertTriangle}
          iconColor="text-amber-400"
          accent="border-l-amber-500/50"
          embedded={embedded}
        />
      </div>

      <div className="flex items-center gap-2 px-0.5 pt-1">
        <Sparkles className="w-3.5 h-3.5 text-emerald-400" aria-hidden />
        <h3 className="text-[10px] font-semibold text-foreground/90 uppercase tracking-wide">
          KPI Housekeeping
        </h3>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <KpiCard
          title="Độ sạch đường"
          value={housekeeping.roadCleanlinessPercent}
          unit="%"
          icon={Percent}
          iconColor="text-emerald-400"
          accent="border-l-emerald-500/50"
          embedded={embedded}
        />
        <KpiCard
          title="Diện tích bùn"
          value={housekeeping.mudAreaSqm.toFixed(1)}
          unit="m²"
          icon={AlertTriangle}
          iconColor="text-emerald-400"
          accent="border-l-emerald-500/50"
          embedded={embedded}
        />
        <KpiCard
          title="Diện tích nước"
          value={housekeeping.waterAreaSqm.toFixed(1)}
          unit="m²"
          icon={Droplets}
          iconColor="text-emerald-400"
          accent="border-l-emerald-500/50"
          embedded={embedded}
        />
        <KpiCard
          title="Rác tồn lưu"
          value={housekeeping.trashLocations}
          unit="vị trí"
          icon={Trash2}
          iconColor="text-emerald-400"
          accent="border-l-emerald-500/50"
          embedded={embedded}
        />
        <KpiCard
          title="Vật tư chiếm dụng"
          value={housekeeping.scatteredMaterialLocations}
          unit="vị trí"
          icon={MapPin}
          iconColor="text-emerald-400"
          accent="border-l-emerald-500/50"
          embedded={embedded}
        />
      </div>
    </div>
  )
}
