import { IconTooltip } from '@/components/common/IconTooltip/IconTooltip'
import type { SafetyDashboardKpis } from '../../types/safety.types'
import { Camera, ClipboardCheck, Layers, ShieldAlert } from 'lucide-react'

interface SafetyOverviewCollapsedSummaryProps {
  kpis: SafetyDashboardKpis
  groupTotal?: number
}

export function SafetyOverviewCollapsedSummary({ kpis, groupTotal = 0 }: SafetyOverviewCollapsedSummaryProps) {
  const items = [
    {
      icon: Camera,
      color: 'text-sky-400',
      value: kpis.deviceActiveCount,
      label: 'TB',
    },
    {
      icon: ShieldAlert,
      color: 'text-orange-400',
      value: kpis.todayViolations,
      label: 'VP',
    },
    {
      icon: ClipboardCheck,
      color: 'text-green-400',
      value: kpis.handledTotalCount,
      label: 'Xử lý',
    },
    {
      icon: Layers,
      color: 'text-primary',
      value: groupTotal,
      label: 'Nhóm',
    },
  ]

  return (
    <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[10px] tabular-nums overflow-x-auto scrollbar-none min-w-0">
      {items.map(item => (
        <span key={item.label} className="inline-flex items-center gap-1 whitespace-nowrap shrink-0">
          <IconTooltip icon={item.icon} label={item.label} iconClassName={item.color} size="sm" />
          <span className="font-semibold text-foreground">{item.value}</span>
          <span className="text-muted-foreground/60 hidden sm:inline">{item.label}</span>
        </span>
      ))}
    </div>
  )
}
