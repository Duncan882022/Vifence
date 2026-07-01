import { useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { AiInsightDrawer } from './AiInsightDrawer'
import type { AiInsight, AiSeverity } from '../types'

const SEV_CONFIG: Record<AiSeverity, { label: string; dot: string; row: string; badge: string }> = {
  Critical: {
    label: 'Critical',
    dot: 'bg-red-400',
    row: 'hover:bg-red-500/5 border-l-red-500/50',
    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  High: {
    label: 'High',
    dot: 'bg-orange-400',
    row: 'hover:bg-orange-500/5 border-l-orange-500/50',
    badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  Medium: {
    label: 'Medium',
    dot: 'bg-yellow-400',
    row: 'hover:bg-yellow-500/5 border-l-yellow-500/30',
    badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  },
}

interface Props {
  insights: AiInsight[]
}

export function AiOperationInsightsPanel({ insights }: Props) {
  const [selected, setSelected] = useState<AiInsight | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const criticalCount = insights.filter(i => i.severity === 'Critical').length
  const highCount = insights.filter(i => i.severity === 'High').length

  const handleClick = (insight: AiInsight) => {
    setSelected(insight)
    setDrawerOpen(true)
  }

  return (
    <>
      <Panel
        title="AI Operation Insights"
        headerRight={(
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary/70" />
            {criticalCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[8px] font-bold border border-red-500/30">
                {criticalCount} Critical
              </span>
            )}
            {highCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[8px] font-bold border border-orange-500/30">
                {highCount} High
              </span>
            )}
          </div>
        )}
        className="h-full min-h-0"
      >
        <div className="flex flex-col gap-1 h-full min-h-0 overflow-y-auto">
          {insights.map(insight => {
            const sev = SEV_CONFIG[insight.severity]
            return (
              <button
                key={insight.id}
                type="button"
                onClick={() => handleClick(insight)}
                className={cn(
                  'w-full flex items-start gap-2.5 px-2.5 py-2.5 rounded-lg border border-[#1e2433]/50 border-l-2 transition-colors text-left',
                  'bg-[#0b0f1a]/40',
                  sev.row,
                )}
              >
                {/* Dot */}
                <span className={cn('w-2 h-2 rounded-full mt-1 shrink-0', sev.dot)} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold border', sev.badge)}>
                      {sev.label}
                    </span>
                    <span className="text-[9px] font-semibold text-foreground/80 truncate">
                      {insight.machineOrProject}
                    </span>
                  </div>
                  <p className="text-[10px] font-semibold text-foreground leading-snug">{insight.title}</p>
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5 leading-snug line-clamp-2">
                    {insight.shortDesc}
                  </p>
                </div>

                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mt-1" />
              </button>
            )
          })}
        </div>
      </Panel>

      <AiInsightDrawer
        insight={selected}
        open={drawerOpen}
        onOpenChange={open => !open && setDrawerOpen(false)}
      />
    </>
  )
}
