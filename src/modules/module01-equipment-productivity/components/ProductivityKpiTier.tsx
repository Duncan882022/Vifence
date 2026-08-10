import { useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Cpu, Fuel, HardHat, TrendingUp } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  DASHBOARD_CHIP_CLASS,
} from '@/modules/module03-safety/components/ViolationTypeChips'
import type { Machine, Worksite, Project } from '../types'

const EASE = [0.22, 1, 0.36, 1] as const

/* ── Shell giống hệt ATLD DailyMetricCard ── */
interface MetricTheme {
  accent: string
  iconBg: string
  iconColor: string
}

const THEMES: Record<string, MetricTheme> = {
  sky:     { accent: 'border-l-sky-500/50',     iconBg: 'bg-sky-500/10',     iconColor: 'text-sky-400' },
  violet:  { accent: 'border-l-violet-500/50',  iconBg: 'bg-violet-500/10',  iconColor: 'text-violet-400' },
  emerald: { accent: 'border-l-emerald-500/50', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
  amber:   { accent: 'border-l-amber-500/50',   iconBg: 'bg-amber-500/10',   iconColor: 'text-amber-400' },
}

function MetricCard({
  theme, icon, label, hero, insight, index,
}: {
  theme: MetricTheme
  icon: ReactNode
  label: string
  hero: ReactNode
  insight: ReactNode
  index: number
}) {
  return (
    <motion.div
      custom={index}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: EASE }}
      className={cn(
        'border border-[#1e2433] border-l-2 rounded-lg flex flex-col gap-1.5',
        'hover:border-[#2a3855]/80 transition-colors',
        'p-2.5 sm:p-3 bg-[#0d1117]',
        theme.accent,
      )}
    >
      <div className="flex items-start gap-1.5 sm:gap-2 min-w-0">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          theme.iconBg,
        )}>
              <span className={theme.iconColor}>{icon}</span>
            </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate leading-tight">
            {label}
          </p>
          <div className="flex items-baseline gap-0.5 sm:gap-1 mt-0.5 flex-wrap">
            {hero}
          </div>
          <div className="mt-0.5 sm:mt-1 min-w-0">
            {insight}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function HeroValue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(
      'font-bold leading-none tabular-nums tracking-tight text-base sm:text-2xl',
      className,
    )}>
      {children}
    </span>
  )
}

function HeroUnit({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-[8px] sm:text-[10px] font-medium text-muted-foreground shrink-0', className)}>
      {children}
    </span>
  )
}

function InsightChip({ count, label, className }: { count?: number; label: string; className: string }) {
  return (
    <span className={cn(DASHBOARD_CHIP_CLASS, className)}>
      {count !== undefined && <span>{count.toLocaleString('vi-VN')}</span>}
      <span>{label}</span>
    </span>
  )
}

function ProgressBar({ value, barClass, delay = 0.25 }: {
  value: number; barClass: string; delay?: number
}) {
  return (
    <div className="h-2 rounded-full bg-[#1a2030] overflow-hidden">
        <motion.div
        className={cn('h-full rounded-full', barClass)}
          initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ delay, duration: 0.8, ease: EASE }}
        />
      </div>
  )
}

function FleetChip({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div
      className="flex items-center gap-1 px-1.5 py-1 rounded-md border"
      style={{ background: `${color}0a`, borderColor: `${color}28` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[10px] font-bold tabular-nums leading-none" style={{ color }}>
        {count.toLocaleString('vi-VN')}
      </span>
      <span className="text-[7px] text-muted-foreground/60 truncate leading-tight">{label}</span>
    </div>
  )
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function fmtD(v: number, d = 1): string {
  return v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function projectBarClass(p: number): string {
  if (p < 50) return 'bg-gradient-to-r from-red-600 to-red-400'
  if (p < 70) return 'bg-gradient-to-r from-amber-600 to-amber-400'
  return 'bg-gradient-to-r from-green-600 to-emerald-400'
}

function projectPctClass(p: number): string {
  if (p < 50) return 'text-red-400'
  if (p < 70) return 'text-amber-400'
  return 'text-green-400'
}

/* ── Card 1 ── */
function FleetCard({ machines, index }: { machines: Machine[]; index: number }) {
  const total = machines.length
  const working = machines.filter(m => m.status === 'working').length
  const standby = machines.filter(m => m.status === 'idle').length
  const broken = machines.filter(m => m.status === 'breakdown').length
  const stored = machines.filter(m => m.status === 'stored').length
  const huyDongPct = pct(working + standby, total)
  const utilizationPct = pct(working, total)

  return (
    <MetricCard
      index={index}
      theme={THEMES.amber}
      icon={<Cpu className="w-3.5 h-3.5" />}
      label="Đội máy"
      hero={(
        <>
          <HeroValue className="text-green-400">{(working + standby).toLocaleString('vi-VN')}</HeroValue>
          <HeroUnit>/</HeroUnit>
          <HeroValue className="text-foreground">{total.toLocaleString('vi-VN')}</HeroValue>
          <HeroUnit>máy đang chạy</HeroUnit>
        </>
      )}
      insight={(
        <div className="flex flex-col gap-1.5">
          <p className="text-[9px] text-muted-foreground/60 leading-snug">
            Huy động{' '}
            <span className="font-semibold text-amber-400">{huyDongPct}%</span>
            {' · '}
            Sử dụng{' '}
            <span className="font-semibold text-green-400">{utilizationPct}%</span>
          </p>
          <div className="grid grid-cols-2 gap-1">
            <FleetChip color="#22c55e" label="Đang hoạt động" count={working} />
            <FleetChip color="#fbbf24" label="Chờ việc" count={standby} />
            <FleetChip color="#f87171" label="Hỏng hóc" count={broken} />
            <FleetChip color="#38bdf8" label="Lưu kho" count={stored} />
      </div>
          <ProgressBar
            value={utilizationPct}
            barClass="bg-gradient-to-r from-amber-600 to-amber-400"
          />
        </div>
      )}
    />
  )
}

/* ── Card 2 ── */
interface ProjectRow { code: string; progressPct: number; hasRisk: boolean; riskCount: number; totalPiles: number }

function PileCard({ projects, worksites, index }: {
  projects: Project[]; worksites: Worksite[]; index: number
}) {
  const rows = useMemo<ProjectRow[]>(() => (
    projects.map(proj => {
      const ws = worksites.filter(w => w.projectId === proj.id)
      const planned = ws.reduce((s, w) => s + w.plannedPiles, 0)
      const completed = ws.reduce((s, w) => s + w.completedPiles, 0)
      const risk = ws.reduce((s, w) => s + w.delayedPiles + w.blockedPiles, 0)
      return { code: proj.code, progressPct: pct(completed, planned), hasRisk: risk > 0, riskCount: risk, totalPiles: planned }
    }).sort((a, b) => a.progressPct - b.progressPct)
  ), [projects, worksites])

  const totalPlanned = worksites.reduce((s, w) => s + w.plannedPiles, 0)
  const totalCompleted = worksites.reduce((s, w) => s + w.completedPiles, 0)
  const portfolioPct = pct(totalCompleted, totalPlanned)

  return (
    <MetricCard
      index={index}
      theme={THEMES.violet}
      icon={<HardHat className="w-3.5 h-3.5" />}
      label="Tiến độ theo dự án"
      hero={(
        <>
          <HeroValue className="text-violet-300">{totalCompleted.toLocaleString('vi-VN')}</HeroValue>
          <HeroUnit>/ {totalPlanned.toLocaleString('vi-VN')} cọc</HeroUnit>
          <HeroUnit>({portfolioPct}%)</HeroUnit>
        </>
      )}
      insight={(
        <div className="flex flex-col gap-1">
          {rows.map((row, i) => (
            <div key={row.code} className="flex items-center gap-1.5 min-w-0">
              <span className="text-[8px] sm:text-[9px] font-semibold text-muted-foreground w-8 shrink-0">
                {row.code}
              </span>
              <div className="flex-1 h-2 rounded-full bg-[#1a2030] overflow-hidden">
          <motion.div
                  className={cn('h-full rounded-full', projectBarClass(row.progressPct))}
            initial={{ width: 0 }}
                  animate={{ width: `${row.progressPct}%` }}
                  transition={{ delay: 0.15 + i * 0.05, duration: 0.7, ease: EASE }}
          />
        </div>
              <span className="relative group shrink-0">
                <span className={cn(
                  'text-[8px] sm:text-[9px] font-semibold tabular-nums w-7 text-right block',
                  projectPctClass(row.progressPct),
                )}>
                  {row.progressPct}%
                </span>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-zinc-800 text-white text-[9px] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  {row.hasRisk
                    ? `${row.riskCount}/${row.totalPiles} cọc bị trễ / đình trệ`
                    : `${row.progressPct}% hoàn thành`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    />
  )
}

/* ── Card 4 ── */
function TodayProgressCard({ projects, worksites, index }: {
  projects: Project[]; worksites: Worksite[]; index: number
}) {
  const { portfolioPct, totalCompleted, totalInProgress, totalDelayed, totalBlocked, bottomRows } = useMemo(() => {
    const totalPlanned = worksites.reduce((s, w) => s + w.plannedPiles, 0)
    const _totalCompleted = worksites.reduce((s, w) => s + w.completedPiles, 0)
    const _totalDelayed = worksites.reduce((s, w) => s + w.delayedPiles, 0)
    const _totalBlocked = worksites.reduce((s, w) => s + w.blockedPiles, 0)
    const _totalDB = _totalDelayed + _totalBlocked
    const _totalInProgress = worksites.reduce((s, w) => s + w.inProgressPiles, 0)

    const rows = projects.map(proj => {
      const ws = worksites.filter(w => w.projectId === proj.id)
      const planned = ws.reduce((s, w) => s + w.plannedPiles, 0)
      const completed = ws.reduce((s, w) => s + w.completedPiles, 0)
      const delayed = ws.reduce((s, w) => s + w.delayedPiles + w.blockedPiles, 0)
      return { code: proj.code, progressPct: pct(completed, planned), completed, planned, delayed }
    }).sort((a, b) => a.progressPct - b.progressPct)

    const _onTrack = rows.filter(r => r.progressPct >= 70).length

    return {
      portfolioPct: pct(_totalCompleted, totalPlanned),
      onTrackCount: _onTrack,
      totalCompleted: _totalCompleted,
      totalInProgress: _totalInProgress,
      totalDelayed: _totalDelayed,
      totalBlocked: _totalBlocked,
      totalDelayedBlocked: _totalDB,
      bottomRows: rows.slice(0, 3),
    }
  }, [projects, worksites])

  const heroColor = portfolioPct >= 70 ? 'text-green-400' : portfolioPct >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <MetricCard
      index={index}
      theme={THEMES.emerald}
      icon={<TrendingUp className="w-3.5 h-3.5" />}
      label="Tiến độ hôm nay"
      hero={(
        <>
          <HeroValue className={heroColor}>{portfolioPct}%</HeroValue>
          <HeroUnit>hoàn thành hôm nay</HeroUnit>
        </>
      )}
      insight={(
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1">
            <InsightChip
              count={totalCompleted}
              label="cọc hoàn thành"
              className="bg-green-500/10 text-green-400"
            />
            <InsightChip
              count={totalInProgress}
              label="cọc đang thi công"
              className="bg-sky-500/10 text-sky-400"
            />
            {totalDelayed > 0 && (
              <InsightChip
                count={totalDelayed}
                label="cọc bị trễ"
                className="bg-red-500/10 text-red-400"
              />
            )}
            {totalBlocked > 0 && (
              <InsightChip
                count={totalBlocked}
                label="cọc đình trệ"
                className="bg-purple-500/10 text-purple-400"
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            {bottomRows.map((row, i) => (
              <div key={row.code} className="flex items-center gap-1.5 min-w-0">
                <span className="text-[8px] sm:text-[9px] font-semibold text-muted-foreground w-8 shrink-0">
                  {row.code}
        </span>
                <div className="flex-1 h-1.5 rounded-full bg-[#1a2030] overflow-hidden">
                  <motion.div
                    className={cn('h-full rounded-full', projectBarClass(row.progressPct))}
                    initial={{ width: 0 }}
                    animate={{ width: `${row.progressPct}%` }}
                    transition={{ delay: 0.2 + i * 0.05, duration: 0.7, ease: EASE }}
                  />
      </div>
                <span className="relative group shrink-0">
                  <span className={cn(
                    'text-[8px] sm:text-[9px] font-semibold tabular-nums w-7 text-right block',
                    row.delayed > 0 ? 'text-red-400' : projectPctClass(row.progressPct),
                  )}>
                    {row.progressPct}%
                  </span>
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-zinc-800 text-white text-[9px] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    {row.delayed > 0
                      ? `${row.delayed} cọc bị trễ / đình trệ`
                      : `${row.completed}/${row.planned} cọc hoàn thành`}
                  </span>
                </span>
      </div>
            ))}
          </div>
      </div>
      )}
    />
  )
}

/* ── Card 3 ── */
function FuelCard({ machines, index }: { machines: Machine[]; index: number }) {
  const { totalWasteVnd, totalSavingVnd, wasteCount, savingCount, neutralCount, activeCount } = useMemo(() => {
    let _wasteVnd = 0
    let _savingVnd = 0
    let _wasteCount = 0
    let _savingCount = 0
    let _neutralCount = 0
    const _active = machines.filter(m => m.status === 'working' || m.status === 'idle').length

    for (const m of machines) {
      if (m.workingHours <= 0) continue
      const variance = m.fuelLitresPerHour - m.fuelBaselineLitresPerHour
      if (variance > 0) {
        _wasteVnd += variance * m.workingHours * m.fuelCostVndPerLitre
        _wasteCount++
      } else if (variance < 0) {
        _savingVnd += Math.abs(variance) * m.workingHours * m.fuelCostVndPerLitre
        _savingCount++
      } else {
        _neutralCount++
      }
    }

    return {
      totalWasteVnd: _wasteVnd,
      totalSavingVnd: _savingVnd,
      wasteCount: _wasteCount,
      savingCount: _savingCount,
      neutralCount: _neutralCount,
      activeCount: _active,
    }
  }, [machines])

  const netVnd = totalWasteVnd - totalSavingVnd
  const netMillion = netVnd / 1_000_000
  const isNetWaste = netVnd > 0
  const netLabel = isNetWaste ? 'lãng phí ròng hôm nay' : 'tiết kiệm ròng hôm nay'
  const netColor = isNetWaste ? 'text-red-400' : 'text-green-400'
  const wasteMillion = totalWasteVnd / 1_000_000
  const savingMillion = totalSavingVnd / 1_000_000

  return (
    <MetricCard
      index={index}
      theme={THEMES.amber}
      icon={<Fuel className="w-3.5 h-3.5" />}
      label="Nhiên liệu hôm nay"
      hero={(
        <div className="flex flex-col gap-0 mt-0.5">
            <div className="flex items-baseline gap-1">
            <HeroValue className={netColor}>
              {isNetWaste ? '-' : '+'}{fmtD(Math.abs(netMillion), 1)}
            </HeroValue>
            <HeroUnit>triệu VNĐ</HeroUnit>
          </div>
          <p className="text-[8px] text-muted-foreground/60 leading-tight">{netLabel}</p>
            </div>
      )}
      insight={(
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1">
            <span className={cn(DASHBOARD_CHIP_CLASS, 'bg-red-500/10 text-red-400')}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              <span>Lãng phí {fmtD(wasteMillion, 1)}tr ({wasteCount} máy)</span>
            </span>
            <span className={cn(DASHBOARD_CHIP_CLASS, 'bg-green-500/10 text-green-400')}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              <span>Tiết kiệm {fmtD(savingMillion, 1)}tr ({savingCount} máy)</span>
            </span>
            {neutralCount > 0 && (
              <span className={cn(DASHBOARD_CHIP_CLASS, 'bg-zinc-500/10 text-zinc-400')}>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                <span>Trong định mức ({neutralCount} máy)</span>
              </span>
            )}
            <InsightChip count={activeCount} label="Máy chạy" className="bg-sky-500/10 text-sky-400" />
          </div>
      </div>
      )}
    />
  )
}

export function ProductivityKpiTier({
  machines, worksites, projects,
}: {
  machines: Machine[]
  worksites: Worksite[]
  projects: Project[]
}) {
  return (
    <div className="grid grid-cols-2 min-[520px]:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-2.5 lg:gap-3">
      <FleetCard machines={machines} index={0} />
      <PileCard projects={projects} worksites={worksites} index={1} />
      <FuelCard machines={machines} index={2} />
      <TodayProgressCard projects={projects} worksites={worksites} index={3} />
    </div>
  )
}
