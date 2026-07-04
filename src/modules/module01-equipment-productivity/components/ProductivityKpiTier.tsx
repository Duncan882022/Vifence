import { useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Fuel, Gauge, HardHat, TrendingUp } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  DASHBOARD_CHIP_CLASS,
  DASHBOARD_CHIP_ICON_CLASS,
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

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function fmtD(v: number, d = 1): string {
  return v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtVnd(v: number): string {
  if (v >= 1_000_000) return `${fmtD(v / 1_000_000, 0)} triệu`
  return `${Math.round(v / 1_000).toLocaleString('vi-VN')}K`
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
  const idle = machines.filter(m => m.status === 'idle').length
  const broken = machines.filter(m => m.status === 'breakdown').length
  const stored = machines.filter(m => m.status === 'stored').length
  const mobilizedPct = pct(working + idle, total)

  return (
    <MetricCard
      index={index}
      theme={THEMES.sky}
      icon={<Gauge className="w-3.5 h-3.5" />}
      label="Đội máy hôm nay"
      hero={(
        <>
          <HeroValue className="text-green-400">{working.toLocaleString('vi-VN')}</HeroValue>
          <HeroUnit>/</HeroUnit>
          <HeroValue className="text-foreground">{total.toLocaleString('vi-VN')}</HeroValue>
          <HeroUnit>máy đang chạy</HeroUnit>
        </>
      )}
      insight={(
        <div className="flex flex-col gap-1.5">
          <p className="text-[9px] text-muted-foreground/60 leading-snug">
            Huy động <span className="font-semibold text-emerald-400">{mobilizedPct}%</span>
          </p>
          <div className="flex flex-wrap gap-1">
            <InsightChip count={working} label="Chạy" className="bg-green-500/10 text-green-400" />
            <InsightChip count={idle} label="Chờ việc" className="bg-amber-500/10 text-amber-400" />
            <InsightChip count={broken} label="Hỏng" className="bg-red-500/10 text-red-400" />
            <InsightChip count={stored} label="Lưu kho" className="bg-slate-500/10 text-slate-400" />
          </div>
          <ProgressBar
            value={pct(working, total)}
            barClass="bg-gradient-to-r from-green-600 to-emerald-400"
          />
        </div>
      )}
    />
  )
}

/* ── Card 2 ── */
interface ProjectRow { code: string; progressPct: number; hasRisk: boolean }

function PileCard({ projects, worksites, index }: {
  projects: Project[]; worksites: Worksite[]; index: number
}) {
  const rows = useMemo<ProjectRow[]>(() => (
    projects.map(proj => {
      const ws = worksites.filter(w => w.projectId === proj.id)
      const planned = ws.reduce((s, w) => s + w.plannedPiles, 0)
      const completed = ws.reduce((s, w) => s + w.completedPiles, 0)
      const risk = ws.reduce((s, w) => s + w.delayedPiles + w.blockedPiles, 0)
      return { code: proj.code, progressPct: pct(completed, planned), hasRisk: risk > 0 }
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
              <span className={cn(
                'text-[8px] sm:text-[9px] font-semibold tabular-nums w-7 text-right shrink-0',
                projectPctClass(row.progressPct),
              )}>
                {row.progressPct}%
              </span>
              {row.hasRisk && <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
            </div>
          ))}
        </div>
      )}
    />
  )
}

/* ── Card 3 ── */
function OutputCard({ machines, index }: { machines: Machine[]; index: number }) {
  const activeDrillers = machines.filter(m =>
    m.status === 'working' && (m.type.includes('SANY') || m.type.includes('XCMG') || m.type.includes('ép cọc'))
  )
  const allActive = machines.filter(m => m.status === 'working')

  const avgOutput = activeDrillers.length > 0
    ? Math.round(avg(activeDrillers.map(m => m.outputPerHour)) * 10) / 10
    : Math.round(avg(allActive.map(m => m.outputPerHour)) * 10) / 10

  const totalDayM = machines.reduce((s, m) => s + m.actualOutputToday, 0)
  const totalPlannedM = machines.reduce((s, m) => s + m.plannedOutputToday, 0)
  const completionPct = pct(totalDayM, totalPlannedM)

  const best = allActive.reduce<Machine | undefined>((b, m) => !b || m.outputPerHour > b.outputPerHour ? m : b, undefined)
  const worst = allActive.reduce<Machine | undefined>((b, m) => !b || m.outputPerHour < b.outputPerHour ? m : b, undefined)

  return (
    <MetricCard
      index={index}
      theme={THEMES.emerald}
      icon={<TrendingUp className="w-3.5 h-3.5" />}
      label="Sản lượng hôm nay"
      hero={(
        <>
          <HeroValue className="text-emerald-400">{totalDayM.toLocaleString('vi-VN')}</HeroValue>
          <HeroUnit>m thi công</HeroUnit>
        </>
      )}
      insight={(
        <div className="flex flex-col gap-1.5">
          <p className="text-[9px] text-muted-foreground/60 leading-snug">
            Tốc độ TB <span className="font-semibold text-emerald-400">{fmtD(avgOutput)} m/giờ</span>
            {' · '}
            Đạt KH <span className={cn('font-semibold', completionPct >= 100 ? 'text-green-400' : 'text-amber-400')}>
              {completionPct}%
            </span>
          </p>
          <ProgressBar
            value={completionPct}
            barClass={completionPct >= 100
              ? 'bg-gradient-to-r from-green-600 to-emerald-400'
              : 'bg-gradient-to-r from-amber-600 to-amber-400'}
          />
          <div className="flex flex-wrap gap-1">
            {best && (
              <InsightChip label={`Nhanh ${best.code}`} className="bg-emerald-500/10 text-emerald-400" />
            )}
            {worst && worst !== best && (
              <InsightChip label={`Chậm ${worst.code}`} className="bg-amber-500/10 text-amber-400" />
            )}
          </div>
        </div>
      )}
    />
  )
}

/* ── Card 4 ── */
function FuelCard({ machines, index }: { machines: Machine[]; index: number }) {
  let totalWasteVnd = 0
  let totalSavingVnd = 0
  let totalFuelLitresH = 0
  let overCount = 0
  const activeCount = machines.filter(m => m.status === 'working').length

  for (const m of machines) {
    if (m.workingHours <= 0) continue
    const variance = m.fuelLitresPerHour - m.fuelBaselineLitresPerHour
    totalFuelLitresH += m.fuelLitresPerHour
    if (variance > 0) {
      totalWasteVnd += variance * m.workingHours * m.fuelCostVndPerLitre
      overCount++
    } else if (m.actualOutputToday >= m.plannedOutputToday) {
      totalSavingVnd += Math.abs(variance) * m.workingHours * m.fuelCostVndPerLitre
    }
  }

  const countForAvg = machines.filter(m => m.workingHours > 0).length || 1
  const avgLitPerHour = Math.round((totalFuelLitresH / countForAvg) * 10) / 10

  return (
    <MetricCard
      index={index}
      theme={THEMES.amber}
      icon={<Fuel className="w-3.5 h-3.5" />}
      label="Nhiên liệu hôm nay"
      hero={(
        <>
          <HeroValue className="text-red-400">{fmtVnd(totalWasteVnd)}</HeroValue>
          <HeroUnit>lãng phí</HeroUnit>
        </>
      )}
      insight={(
        <div className="flex flex-col gap-1.5">
          <p className="text-[9px] text-muted-foreground/60 leading-snug">
            {overCount} máy vượt định mức · TB{' '}
            <span className="font-semibold text-amber-400">{fmtD(avgLitPerHour)} lít/h</span>
          </p>
          <div className="flex flex-wrap gap-1">
            <span className={cn(DASHBOARD_CHIP_CLASS, 'bg-red-500/10 text-red-400')}>
              <AlertTriangle className={DASHBOARD_CHIP_ICON_CLASS} aria-hidden />
              <span>XCMG-007 +8,5%</span>
            </span>
            <InsightChip
              label={`Tiết kiệm ${fmtVnd(totalSavingVnd)}`}
              className="bg-green-500/10 text-green-400"
            />
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
      <OutputCard machines={machines} index={2} />
      <FuelCard machines={machines} index={3} />
    </div>
  )
}
