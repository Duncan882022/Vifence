import { Trophy, Medal } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { ProjectPerformance } from '../types'

const RANK_ICONS = {
  1: <Trophy className="w-3.5 h-3.5 text-yellow-400" />,
  2: <Medal className="w-3.5 h-3.5 text-slate-300" />,
  3: <Medal className="w-3.5 h-3.5 text-amber-600" />,
}

const RANK_COLORS = {
  1: 'text-yellow-400',
  2: 'text-slate-300',
  3: 'text-amber-600',
  4: 'text-slate-500',
  5: 'text-slate-600',
}

const BAR_COLORS = {
  1: 'from-yellow-500/60 to-yellow-400/40',
  2: 'from-slate-400/50 to-slate-300/30',
  3: 'from-amber-600/50 to-amber-500/30',
  4: 'from-sky-500/40 to-sky-400/20',
  5: 'from-violet-500/40 to-violet-400/20',
}

function utilColor(pct: number) {
  if (pct >= 85) return 'text-green-400'
  if (pct >= 75) return 'text-sky-400'
  return 'text-amber-400'
}

interface Props {
  projects: ProjectPerformance[]
}

export function ProjectPerformancePanel({ projects }: Props) {
  const maxOutput = Math.max(...projects.map(p => p.outputMCoc))

  return (
    <Panel title="Xếp hạng dự án" expandable className="h-full min-h-0">
      <div className="flex flex-col gap-2 h-full min-h-0 overflow-y-auto">
        {projects.map(project => {
          const rank = project.rank as 1 | 2 | 3 | 4 | 5
          const barPct = Math.round((project.outputMCoc / maxOutput) * 100)

          return (
            <div
              key={project.id}
              className={cn(
                'relative overflow-hidden rounded-xl border border-[#1e2433]/60 p-2.5 bg-[#0b0f1a]/50',
                'hover:bg-[#1a2235]/40 transition-colors',
              )}
            >
              {/* Gradient bar background */}
              <div
                className={cn('absolute inset-y-0 left-0 rounded-l-xl opacity-40 bg-gradient-to-r', BAR_COLORS[rank])}
                style={{ width: `${barPct}%` }}
              />

              <div className="relative flex items-center gap-2.5">
                {/* Rank */}
                <div className="w-7 h-7 rounded-lg bg-[#0d1117] border border-[#1e2433]/70 flex items-center justify-center shrink-0">
                  {rank <= 3
                    ? RANK_ICONS[rank as 1 | 2 | 3]
                    : <span className={cn('text-[10px] font-black', RANK_COLORS[rank])}>#{rank}</span>
                  }
                </div>

                {/* Project info */}
                <div className="flex-1 min-w-0">
                  <p className={cn('text-[10px] font-bold leading-tight', RANK_COLORS[rank] ?? 'text-foreground')}>
                    {project.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[8px] text-muted-foreground/60">
                      {project.outputMCoc.toLocaleString('vi-VN')} m cọc
                    </span>
                    <span className="text-[7px] text-muted-foreground/30">·</span>
                    <span className={cn('text-[8px] font-semibold tabular-nums', utilColor(project.utilizationPct))}>
                      {project.utilizationPct}%
                    </span>
                    <span className="text-[7px] text-muted-foreground/30">·</span>
                    <span className="text-[8px] text-muted-foreground/60 tabular-nums">
                      {project.fuelEfficiency} lít/m
                    </span>
                  </div>
                </div>

                {/* Output bar */}
                <div className="w-16 shrink-0">
                  <div className="h-1.5 rounded-full bg-[#1a2030] overflow-hidden">
                    <div
                      className={cn('h-full rounded-full bg-gradient-to-r', BAR_COLORS[rank])}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <p className="text-[7px] text-muted-foreground/40 text-right mt-0.5">{barPct}% max</p>
                </div>
              </div>
            </div>
          )
        })}

        {/* Legend */}
        <div className="flex items-center gap-3 mt-1 pt-2 border-t border-[#1e2433]/40">
          {[
            { color: 'text-muted-foreground/60', label: 'Utilization' },
            { color: 'text-muted-foreground/60', label: 'lít/m = hiệu suất NL' },
          ].map(l => (
            <span key={l.label} className={cn('text-[7px]', l.color)}>{l.label}</span>
          ))}
        </div>
      </div>
    </Panel>
  )
}
