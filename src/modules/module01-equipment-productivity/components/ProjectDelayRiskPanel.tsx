import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { Project, Worksite, PileAssignment, DelayReason } from '../types'

type RiskLevel = 'Cao' | 'Trung bình' | 'Thấp'

function calcRisk(project: Project, worksites: Worksite[]): RiskLevel {
  const totalPiles = worksites.reduce((s, w) => s + w.plannedPiles, 0)
  const delayedPiles = worksites.reduce((s, w) => s + w.delayedPiles + w.blockedPiles, 0)
  const delayRatio = totalPiles > 0 ? delayedPiles / totalPiles : 0
  const progressRatio = project.plannedOutputM > 0 ? project.actualOutputM / project.plannedOutputM : 0

  if (delayRatio > 0.3 || progressRatio < 0.55) return 'Cao'
  if (delayRatio > 0.15 || progressRatio < 0.75) return 'Trung bình'
  return 'Thấp'
}

const DELAY_REASON_LABELS: Record<DelayReason, string> = {
  'machine-breakdown':   'Hỏng máy',
  'lack-worker':         'Thiếu nhân công',
  'lack-cement':         'Thiếu xi măng',
  'lack-bentonite':      'Thiếu bentonite',
  'lack-concrete':       'Thiếu bê tông',
  'lack-steel-cage':     'Thiếu lồng thép',
  'site-not-ready':      'Mặt bằng chưa sẵn',
  'weather':             'Thời tiết',
  'inspection-waiting':  'Chờ nghiệm thu',
}

function topDelayReason(piles: PileAssignment[]): string {
  const counts: Partial<Record<DelayReason, number>> = {}
  for (const p of piles) {
    if (p.delayReason) counts[p.delayReason] = (counts[p.delayReason] ?? 0) + 1
  }
  const top = Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]
  return top ? DELAY_REASON_LABELS[top[0] as DelayReason] : '—'
}

interface ProjectRow {
  project: Project
  worksites: Worksite[]
  risk: RiskLevel
  totalPiles: number
  delayedPiles: number
  blockedPiles: number
  completedPct: number
  topReason: string
}

interface Props {
  projects: Project[]
  worksites: Worksite[]
  piles: PileAssignment[]
}

const RISK_ORDER: Record<RiskLevel, number> = { Cao: 0, 'Trung bình': 1, Thấp: 2 }
const RISK_COLORS: Record<RiskLevel, { badge: string; row: string; bar: string }> = {
  'Cao':       { badge: 'bg-red-500/15 text-red-400 ring-red-500/25', row: 'border-l-red-500/60',   bar: '#ef4444' },
  'Trung bình': { badge: 'bg-amber-500/15 text-amber-400 ring-amber-500/25', row: 'border-l-amber-500/50', bar: '#f59e0b' },
  'Thấp':      { badge: 'bg-green-500/15 text-green-400 ring-green-500/25', row: 'border-l-green-500/50',  bar: '#22c55e' },
}

export function ProjectDelayRiskPanel({ projects, worksites, piles }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const rows = useMemo<ProjectRow[]>(() => {
    return projects
      .map(proj => {
        const ws = worksites.filter(w => w.projectId === proj.id)
        const totalPiles = ws.reduce((s, w) => s + w.plannedPiles, 0)
        const completedPiles = ws.reduce((s, w) => s + w.completedPiles, 0)
        const delayedPiles = ws.reduce((s, w) => s + w.delayedPiles, 0)
        const blockedPiles = ws.reduce((s, w) => s + w.blockedPiles, 0)
        const projPiles = piles.filter(p => ws.some(w => w.id === p.worksiteId))
        return {
          project: proj,
          worksites: ws,
          risk: calcRisk(proj, ws),
          totalPiles,
          delayedPiles,
          blockedPiles,
          completedPct: totalPiles > 0 ? Math.round((completedPiles / totalPiles) * 100) : 0,
          topReason: topDelayReason(projPiles),
        }
      })
      .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk])
  }, [projects, worksites, piles])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <Panel title="Rủi ro tiến độ dự án" className="h-full min-h-0" noPadding>
      <div className="flex flex-col h-full min-h-0 overflow-y-auto p-2 gap-1.5">
        {rows.map(row => {
          const col = RISK_COLORS[row.risk]
          const isOpen = expanded.has(row.project.id)

          return (
            <div key={row.project.id} className={cn(
              'rounded-lg border border-[#1e2433] border-l-[3px] bg-[#0a0e1a] overflow-hidden transition-colors',
              row.risk === 'Cao' ? 'bg-red-500/5 border-l-red-500/60' : col.row,
            )}>
              {/* Header row */}
              <button
                type="button"
                onClick={() => toggle(row.project.id)}
                className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-white/5 transition-colors text-left"
              >
                {isOpen
                  ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-foreground truncate">{row.project.name}</span>
                    <span className="text-[8px] text-muted-foreground/50">({row.project.code})</span>
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[8px] font-bold ring-1', col.badge)}>
                      {row.risk}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex-1 h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${row.completedPct}%`, background: col.bar }} />
                    </div>
                    <span className="text-[9px] text-foreground/80 tabular-nums shrink-0">{row.completedPct}%</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[8px] text-red-400 font-semibold">{row.delayedPiles + row.blockedPiles} cọc trễ/bị chặn</p>
                  <p className="text-[7px] text-muted-foreground/50 truncate max-w-[80px]">{row.topReason}</p>
                </div>
              </button>

              {/* Accordion — worksite breakdown */}
              {isOpen && (
                <div className="border-t border-[#1e2433]/60 bg-[#060b14]/60 divide-y divide-[#1e2433]/30">
                  {row.worksites.map(ws => {
                    const wsTotal = ws.plannedPiles
                    const wsComp = ws.completedPiles
                    const wsDelay = ws.delayedPiles + ws.blockedPiles
                    const matWorst = Math.min(
                      ws.materialReadiness.bentonitePct,
                      ws.materialReadiness.cementPct,
                      ws.materialReadiness.concretePct,
                    )
                    return (
                      <div key={ws.id} className="px-4 py-2 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-semibold text-foreground/80 truncate">{ws.code}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <div className="flex-1 h-1 rounded-full bg-[#1e2433] overflow-hidden">
                              <div className="h-full rounded-full bg-sky-400/60" style={{ width: `${wsTotal > 0 ? Math.round(wsComp / wsTotal * 100) : 0}%` }} />
                            </div>
                            <span className="text-[8px] text-muted-foreground/60 tabular-nums shrink-0">{wsComp}/{wsTotal}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {wsDelay > 0 && (
                            <span className="text-[8px] text-red-400 font-semibold">{wsDelay} trễ</span>
                          )}
                          <p className={cn(
                            'text-[7px] tabular-nums',
                            matWorst < 70 ? 'text-amber-400' : 'text-muted-foreground/50',
                          )}>
                            VL: {matWorst}%
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
