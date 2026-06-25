import type { TrainingDailySummary } from '../services/trainingKpi.service'

interface Tier1CollapsedSummaryProps {
  summary: TrainingDailySummary
}

export function Tier1CollapsedSummary({ summary }: Tier1CollapsedSummaryProps) {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground tabular-nums overflow-x-auto scrollbar-none min-w-0">
      {summary.metrics.map(metric => (
        <span key={metric.label} className="whitespace-nowrap shrink-0">
          <span className="font-semibold text-foreground">{metric.value}{metric.unit ?? ''}</span>
          <span className="text-muted-foreground/55 ml-1 hidden sm:inline">{metric.label}</span>
        </span>
      ))}
    </div>
  )
}
