import { useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Cpu, Fuel, HardHat, TrendingUp } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Machine, Worksite, Project } from '../types'

const EASE = [0.22, 1, 0.36, 1] as const

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: EASE },
  }),
}

interface Theme {
  accent: string
  iconBg: string
  iconColor: string
}

const THEMES = {
  amber: { accent: 'border-l-amber-500/50', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400' },
  violet: { accent: 'border-l-violet-500/50', iconBg: 'bg-violet-500/10', iconColor: 'text-violet-400' },
  sky: { accent: 'border-l-sky-500/50', iconBg: 'bg-sky-500/10', iconColor: 'text-sky-400' },
  emerald: { accent: 'border-l-emerald-500/50', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
} as const

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function fmtD(v: number, d = 1): string {
  return v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtM(v: number): string {
  if (v >= 1000) return `${(v / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`
  return v.toLocaleString('vi-VN')
}

function fmtL(v: number): string {
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
}

function barClass(p: number): string {
  if (p >= 75) return 'bg-gradient-to-r from-emerald-600 to-green-400'
  if (p >= 50) return 'bg-gradient-to-r from-amber-600 to-amber-400'
  return 'bg-gradient-to-r from-red-600 to-red-400'
}

function pctColor(p: number): string {
  if (p >= 75) return 'text-green-400'
  if (p >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function KpiShell({
  theme,
  icon,
  label,
  hero,
  children,
  index,
}: {
  theme: Theme
  icon: ReactNode
  label: string
  hero: ReactNode
  children: ReactNode
  index: number
}) {
  return (
    <motion.article
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className={cn(
        'rounded-xl border border-[#1e2433] border-l-[3px] bg-[#0d1117] h-full',
        'hover:border-[#2a3855]/80 transition-colors',
        theme.accent,
      )}
    >
      <div className="flex items-start gap-2.5 p-3 sm:p-3.5 min-h-[112px] h-full">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', theme.iconBg)}>
          <span className={theme.iconColor}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div>
            <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-wide leading-tight">
              {label}
            </p>
            <div className="mt-1 flex items-baseline gap-1 flex-wrap">{hero}</div>
          </div>
          <div className="mt-auto min-w-0">{children}</div>
        </div>
      </div>
    </motion.article>
  )
}

function SoLon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('font-bold leading-none tabular-nums tracking-tight text-xl sm:text-2xl', className)}>
      {children}
    </span>
  )
}

function DonVi({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-[9px] sm:text-[10px] font-medium text-muted-foreground/70', className)}>
      {children}
    </span>
  )
}

function ProgressBar({ value, delay = 0.2 }: { value: number; delay?: number }) {
  return (
    <div className="h-1 rounded-full bg-[#1a2030] overflow-hidden">
      <motion.div
        className={cn('h-full rounded-full', barClass(value))}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ delay, duration: 0.7, ease: EASE }}
      />
    </div>
  )
}

function StatGrid({ items }: { items: { label: string; value: ReactNode; tone?: string }[] }) {
  return (
    <div className={cn('grid gap-1.5', items.length > 2 ? 'grid-cols-2' : 'grid-cols-2')}>
      {items.map(item => (
        <div
          key={item.label}
          className="rounded-md border border-[#1e2433]/80 bg-[#060b14]/60 px-2 py-1.5 min-w-0"
        >
          <p className="text-[7px] font-semibold text-muted-foreground/55 uppercase tracking-wide truncate">
            {item.label}
          </p>
          <p className={cn('text-[11px] font-bold tabular-nums leading-tight mt-0.5 truncate', item.tone ?? 'text-foreground/90')}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function FleetCard({ machines, index }: { machines: Machine[]; index: number }) {
  const stats = useMemo(() => {
    const total = machines.length
    const working = machines.filter(m => m.status === 'working').length
    const standby = machines.filter(m => m.status === 'idle').length
    const broken = machines.filter(m => m.status === 'breakdown').length
    const stored = machines.filter(m => m.status === 'stored').length
    const active = working + standby
    return {
      total,
      working,
      standby,
      broken,
      stored,
      active,
      utilizationPct: pct(working, total),
    }
  }, [machines])

  return (
    <KpiShell
      index={index}
      theme={THEMES.amber}
      icon={<Cpu className="w-4 h-4" />}
      label="Đội máy"
      hero={(
        <>
          <SoLon className={pctColor(stats.utilizationPct)}>{stats.utilizationPct}</SoLon>
          <DonVi>% sử dụng</DonVi>
        </>
      )}
    >
      <ProgressBar value={stats.utilizationPct} />
      <div className="mt-2">
        <StatGrid
          items={[
            { label: 'Huy động', value: `${stats.active}/${stats.total} máy`, tone: 'text-amber-300' },
            { label: 'Chờ việc', value: stats.standby, tone: 'text-amber-400' },
            { label: 'Đang chạy', value: stats.working, tone: 'text-green-400' },
            { label: 'Hỏng / Kho', value: `${stats.broken} / ${stats.stored}`, tone: 'text-muted-foreground/80' },
          ]}
        />
      </div>
    </KpiShell>
  )
}

function ProjectPileCard({
  projects,
  worksites,
  index,
}: {
  projects: Project[]
  worksites: Worksite[]
  index: number
}) {
  const stats = useMemo(() => {
    const totalPlanned = worksites.reduce((s, w) => s + w.plannedPiles, 0)
    const totalCompleted = worksites.reduce((s, w) => s + w.completedPiles, 0)
    const inProgress = worksites.reduce((s, w) => s + w.inProgressPiles, 0)
    const portfolioPct = pct(totalCompleted, totalPlanned)
    const atRiskProjects = projects.filter(proj => {
      const ws = worksites.filter(w => w.projectId === proj.id)
      const delayed = ws.reduce((s, w) => s + w.delayedPiles + w.blockedPiles, 0)
      const planned = ws.reduce((s, w) => s + w.plannedPiles, 0)
      return planned > 0 && delayed / planned > 0.15
    }).length

    return { totalPlanned, totalCompleted, inProgress, portfolioPct, atRiskProjects }
  }, [projects, worksites])

  return (
    <KpiShell
      index={index}
      theme={THEMES.violet}
      icon={<HardHat className="w-4 h-4" />}
      label="Tiến độ dự án"
      hero={(
        <>
          <SoLon className={pctColor(stats.portfolioPct)}>{stats.portfolioPct}</SoLon>
          <DonVi>% cọc hoàn thành</DonVi>
        </>
      )}
    >
      <ProgressBar value={stats.portfolioPct} delay={0.25} />
      <div className="mt-2">
        <StatGrid
          items={[
            {
              label: 'Cọc xong / KH',
              value: `${stats.totalCompleted.toLocaleString('vi-VN')} / ${stats.totalPlanned.toLocaleString('vi-VN')}`,
              tone: 'text-violet-300',
            },
            { label: 'Dự án', value: projects.length },
            { label: 'Đang thi công', value: stats.inProgress.toLocaleString('vi-VN'), tone: 'text-sky-400' },
            {
              label: 'Rủi ro trễ',
              value: stats.atRiskProjects > 0 ? stats.atRiskProjects : '—',
              tone: stats.atRiskProjects > 0 ? 'text-amber-400' : 'text-green-400',
            },
          ]}
        />
      </div>
    </KpiShell>
  )
}

function FuelCard({ machines, index }: { machines: Machine[]; index: number }) {
  const stats = useMemo(() => {
    const active = machines.filter(m => m.workingHours > 0)
    const count = active.length

    const avgActual = count > 0
      ? active.reduce((s, m) => s + m.fuelLitresPerHour, 0) / count
      : 0
    const avgBaseline = count > 0
      ? active.reduce((s, m) => s + m.fuelBaselineLitresPerHour, 0) / count
      : 0
    const deltaPerHour = avgActual - avgBaseline

    const totalLitres = active.reduce((s, m) => s + m.fuelLitresPerHour * m.workingHours, 0)
    const netLitres = totalLitres - active.reduce((s, m) => s + m.fuelBaselineLitresPerHour * m.workingHours, 0)
    const overCount = active.filter(m => m.fuelLitresPerHour > m.fuelBaselineLitresPerHour + 0.05).length

    return { avgActual, avgBaseline, deltaPerHour, totalLitres, netLitres, overCount, isOver: deltaPerHour > 0 }
  }, [machines])

  const deltaSign = stats.deltaPerHour > 0 ? '+' : stats.deltaPerHour < 0 ? '−' : ''

  return (
    <KpiShell
      index={index}
      theme={THEMES.sky}
      icon={<Fuel className="w-4 h-4" />}
      label="Hiệu quả nhiên liệu"
      hero={(
        <>
          <SoLon className={stats.isOver ? 'text-red-400' : 'text-sky-300'}>
            {fmtD(stats.avgActual, 1)}
          </SoLon>
          <DonVi>L/giờ TB</DonVi>
        </>
      )}
    >
      <StatGrid
        items={[
          { label: 'Baseline', value: `${fmtD(stats.avgBaseline, 1)} L/giờ` },
          {
            label: 'Chênh TB',
            value: `${deltaSign}${fmtD(Math.abs(stats.deltaPerHour), 1)} L/giờ`,
            tone: stats.isOver ? 'text-red-400' : stats.deltaPerHour < 0 ? 'text-green-400' : 'text-foreground/85',
          },
          { label: 'Tiêu thụ hôm nay', value: `${fmtL(stats.totalLitres)} L`, tone: 'text-sky-300' },
          {
            label: 'Vượt ngưỡng',
            value: stats.overCount > 0 ? `${stats.overCount} máy · +${fmtL(Math.max(0, stats.netLitres))} L` : `${fmtL(Math.abs(stats.netLitres))} L tiết kiệm`,
            tone: stats.overCount > 0 ? 'text-amber-400' : 'text-green-400',
          },
        ]}
      />
    </KpiShell>
  )
}

function TodayOutputCard({
  machines,
  worksites,
  index,
}: {
  machines: Machine[]
  worksites: Worksite[]
  index: number
}) {
  const stats = useMemo(() => {
    const planned = machines.reduce((s, m) => s + m.plannedOutputToday, 0)
    const actual = machines.reduce((s, m) => s + m.actualOutputToday, 0)
    const inProgress = worksites.reduce((s, w) => s + w.inProgressPiles, 0)
    const delayed = worksites.reduce((s, w) => s + w.delayedPiles + w.blockedPiles, 0)
    const gap = Math.max(0, planned - actual)
    return { planned, actual, gap, inProgress, delayed, dailyPct: pct(actual, planned) }
  }, [machines, worksites])

  const behind = stats.actual < stats.planned

  return (
    <KpiShell
      index={index}
      theme={THEMES.emerald}
      icon={<TrendingUp className="w-4 h-4" />}
      label="Sản lượng hôm nay"
      hero={(
        <>
          <SoLon className={pctColor(stats.dailyPct)}>{stats.dailyPct}</SoLon>
          <DonVi>% kế hoạch ngày</DonVi>
        </>
      )}
    >
      <ProgressBar value={stats.dailyPct} delay={0.3} />
      <div className="mt-2">
        <StatGrid
          items={[
            {
              label: 'Thực hiện / KH',
              value: `${fmtM(stats.actual)} / ${fmtM(stats.planned)} m`,
              tone: behind ? 'text-amber-400' : 'text-green-400',
            },
            {
              label: behind ? 'Còn thiếu' : 'Vượt KH',
              value: behind ? `${fmtM(stats.gap)} m` : 'Đạt',
              tone: behind ? 'text-amber-400' : 'text-green-400',
            },
            { label: 'Cọc thi công', value: stats.inProgress.toLocaleString('vi-VN'), tone: 'text-sky-400' },
            {
              label: 'Cọc trễ',
              value: stats.delayed > 0 ? stats.delayed.toLocaleString('vi-VN') : '—',
              tone: stats.delayed > 0 ? 'text-red-400' : 'text-green-400',
            },
          ]}
        />
      </div>
    </KpiShell>
  )
}

export function ProductivityKpiTier({
  machines,
  worksites,
  projects,
}: {
  machines: Machine[]
  worksites: Worksite[]
  projects: Project[]
}) {
  return (
    <div className="grid grid-cols-1 min-[520px]:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3 items-stretch">
      <FleetCard machines={machines} index={0} />
      <ProjectPileCard projects={projects} worksites={worksites} index={1} />
      <FuelCard machines={machines} index={2} />
      <TodayOutputCard machines={machines} worksites={worksites} index={3} />
    </div>
  )
}
