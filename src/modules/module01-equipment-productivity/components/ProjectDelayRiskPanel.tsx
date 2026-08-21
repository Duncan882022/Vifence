import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Map } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { Project, Worksite, PileAssignment, DelayReason } from '../types'
import { ProjectMapModal } from './ProjectMapModal'

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
  'machine-breakdown': 'Hỏng máy',
  'lack-worker': 'Thiếu nhân công',
  'lack-cement': 'Thiếu xi măng',
  'lack-bentonite': 'Thiếu bentonite',
  'lack-concrete': 'Thiếu bê tông',
  'lack-steel-cage': 'Thiếu lồng thép',
  'site-not-ready': 'Mặt bằng chưa sẵn',
  weather: 'Thời tiết',
  'inspection-waiting': 'Chờ nghiệm thu',
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

const RISK_BADGE: Record<RiskLevel, string> = {
  Cao: 'bg-red-500/15 text-red-400 ring-red-500/25',
  'Trung bình': 'bg-amber-500/15 text-amber-400 ring-amber-500/25',
  Thấp: 'bg-green-500/15 text-green-400 ring-green-500/25',
}

function barTone(pct: number): string {
  if (pct >= 70) return 'from-emerald-600 to-green-400'
  if (pct >= 50) return 'from-amber-600 to-amber-400'
  return 'from-red-600 to-red-400'
}

function pctTone(pct: number): string {
  if (pct >= 70) return 'text-green-400'
  if (pct >= 50) return 'text-amber-400'
  return 'text-red-400'
}

export function ProjectDelayRiskPanel({ projects, worksites, piles }: Props) {
  const [mapProject, setMapProject] = useState<Project | null>(null)

  const rows = useMemo<ProjectRow[]>(() => (
    projects
      .map(proj => {
        const ws = worksites.filter(w => w.projectId === proj.id)
        const totalPiles = ws.reduce((s, w) => s + w.plannedPiles, 0)
        const completedPiles = ws.reduce((s, w) => s + w.completedPiles, 0)
        const delayedPiles = ws.reduce((s, w) => s + w.delayedPiles, 0)
        const blockedPiles = ws.reduce((s, w) => s + w.blockedPiles, 0)
        const projPiles = piles.filter(p => ws.some(w => w.id === p.worksiteId))
        return {
          project: proj,
          risk: calcRisk(proj, ws),
          totalPiles,
          delayedPiles,
          blockedPiles,
          completedPct: totalPiles > 0 ? Math.round((completedPiles / totalPiles) * 100) : 0,
          topReason: topDelayReason(projPiles),
        }
      })
      .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk])
  ), [projects, worksites, piles])

  const highRisk = rows.filter(r => r.risk === 'Cao').length

  return (
    <>
      <Panel
        title="Năng suất dự án"
        className="h-full min-h-0"
        noPadding
        headerRight={highRisk > 0 ? (
          <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-500/15 text-red-400 ring-1 ring-red-500/25">
            {highRisk} rủi ro cao
          </span>
        ) : undefined}
      >
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-2 pb-2 pt-1 space-y-1.5">
          {rows.map((row, idx) => {
            const delayedTotal = row.delayedPiles + row.blockedPiles
            const overPlan = row.completedPct > 100
            const displayPct = Math.min(100, row.completedPct)

            return (
              <motion.div
                key={row.project.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.28 }}
                className="group rounded-xl border border-[#1e2433] bg-[#060b14] hover:border-[#2a3855] transition-colors"
              >
                <div className="flex items-start gap-2 p-2.5">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-foreground truncate leading-snug">
                          {row.project.name}
                        </p>
                        <p className="text-[9px] text-muted-foreground/55 mt-0.5">{row.project.code}</p>
                      </div>
                      {overPlan ? (
                        <span className="shrink-0 inline-flex px-2 py-0.5 rounded-full text-[8px] font-bold ring-1 bg-emerald-500/15 text-emerald-400 ring-emerald-500/25">
                          Vượt KH
                        </span>
                      ) : (
                        <span className={cn('shrink-0 inline-flex px-2 py-0.5 rounded-full text-[8px] font-bold ring-1', RISK_BADGE[row.risk])}>
                          {row.risk}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[#1a2030] overflow-hidden">
                        <div
                          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', barTone(displayPct))}
                          style={{ width: `${displayPct}%` }}
                        />
                      </div>
                      <span className={cn('text-[10px] font-bold tabular-nums w-9 text-right shrink-0', overPlan ? 'text-emerald-400' : pctTone(displayPct))}>
                        {row.completedPct}%
                      </span>
                    </div>

                    <p className="text-[9px] text-muted-foreground/55 leading-snug">
                      {delayedTotal > 0 && !overPlan && (
                        <span className="text-red-400/90 font-medium">{delayedTotal} cọc trễ · {row.topReason}</span>
                      )}
                      {overPlan && (
                        <span className="text-emerald-400/90">+{row.completedPct - 100}% so với kế hoạch</span>
                      )}
                      {delayedTotal === 0 && !overPlan && (
                        <span>{row.totalPiles.toLocaleString('vi-VN')} cọc trong kế hoạch</span>
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    title="Xem bản đồ cọc"
                    onClick={() => setMapProject(row.project)}
                    className="shrink-0 mt-0.5 p-2 rounded-lg border border-[#1e2433] text-muted-foreground opacity-70 group-hover:opacity-100 hover:text-violet-400 hover:border-violet-500/30 hover:bg-violet-500/10 transition-all"
                  >
                    <Map className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      </Panel>

      <AnimatePresence>
        {mapProject && (
          <ProjectMapModal
            key={mapProject.id}
            project={mapProject}
            worksites={worksites.filter(w => w.projectId === mapProject.id)}
            onClose={() => setMapProject(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
