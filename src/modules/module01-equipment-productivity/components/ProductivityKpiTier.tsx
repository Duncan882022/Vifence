import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Fuel, Gauge, HardHat } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Machine, Worksite, PileAssignment } from '../types'

const EASE = [0.22, 1, 0.36, 1] as const

const VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.45, ease: EASE },
  }),
}

interface CardTheme {
  accent: string; accentHover: string; glow: string
  hoverShadow: string; iconBg: string; iconRing: string; iconColor: string
}

const THEMES: Record<string, CardTheme> = {
  sky: {
    accent: 'border-l-sky-400/80', accentHover: 'hover:border-l-sky-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(56,189,248,0.13),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(56,189,248,0.09)]',
    iconBg: 'bg-sky-500/15', iconRing: 'ring-sky-400/35', iconColor: 'text-sky-400',
  },
  violet: {
    accent: 'border-l-violet-400/80', accentHover: 'hover:border-l-violet-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(167,139,250,0.12),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(167,139,250,0.09)]',
    iconBg: 'bg-violet-500/15', iconRing: 'ring-violet-400/35', iconColor: 'text-violet-400',
  },
  emerald: {
    accent: 'border-l-emerald-400/80', accentHover: 'hover:border-l-emerald-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(52,211,153,0.12),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(52,211,153,0.09)]',
    iconBg: 'bg-emerald-500/15', iconRing: 'ring-emerald-400/35', iconColor: 'text-emerald-400',
  },
  amber: {
    accent: 'border-l-amber-400/80', accentHover: 'hover:border-l-amber-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(251,191,36,0.13),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(251,191,36,0.09)]',
    iconBg: 'bg-amber-500/15', iconRing: 'ring-amber-400/35', iconColor: 'text-amber-400',
  },
}

function KpiShell({ theme, icon, title, headerRight, children, index }: {
  theme: CardTheme; icon: ReactNode; title: string
  headerRight?: ReactNode; children: ReactNode; index: number
}) {
  return (
    <motion.div
      custom={index} variants={VARIANTS} initial="hidden" animate="visible"
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-[#1e2433]/90 border-l-[3px]',
        'bg-gradient-to-br from-[#0d1117] via-[#0a0e1a] to-[#060b14]',
        'transition-all duration-300',
        theme.accent, theme.accentHover, theme.hoverShadow,
      )}
    >
      <div className={cn('absolute inset-0 pointer-events-none', theme.glow)} />
      <div className="relative px-3 pt-2.5 pb-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ring-1', theme.iconBg, theme.iconRing)}>
              <span className={theme.iconColor}>{icon}</span>
            </div>
            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>
        {children}
      </div>
    </motion.div>
  )
}

function Bar({ value, color, delay = 0.2 }: { value: number; color: string; delay?: number }) {
  return (
    <motion.div
      className="h-full rounded-full"
      style={{ background: color }}
      initial={{ width: 0 }}
      animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      transition={{ delay, duration: 0.9, ease: EASE }}
    />
  )
}

function MiniTile({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5 rounded-xl border border-[#1e2433]/60 bg-[#060b14]/50">
      <span className="text-[7px] font-bold text-muted-foreground/60 uppercase tracking-wider leading-tight truncate">{label}</span>
      <div className="flex items-baseline gap-0.5">
        <span className="text-[12px] font-black tabular-nums leading-none" style={color ? { color } : undefined}>{value}</span>
        {unit && <span className="text-[7px] text-muted-foreground/50">{unit}</span>}
      </div>
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

/* ── Card 1: Hiệu suất đội máy ── */
function FleetCard({ machines, index }: { machines: Machine[]; index: number }) {
  const total = machines.length
  const working = machines.filter(m => m.status === 'working').length
  const idle = machines.filter(m => m.status === 'idle').length
  const broken = machines.filter(m => m.status === 'breakdown').length
  const stored = machines.filter(m => m.status === 'stored').length
  const avgUtil = Math.round(avg(machines.map(m => m.utilizationPct)) * 10) / 10
  const mobilized = working + idle
  const idlePct = pct(idle, total)
  const mobilePct = pct(mobilized, total)
  const availPct = pct(working, total)

  return (
    <KpiShell index={index} theme={THEMES.sky} icon={<Gauge className="w-3 h-3" />}
      title="Hiệu suất đội máy"
      headerRight={<span className="text-[8px] font-bold text-sky-300">{total} máy</span>}
    >
      <div className="flex items-baseline gap-1">
        <span className="text-[2rem] font-black tabular-nums leading-none bg-gradient-to-br from-sky-200 via-sky-300 to-sky-500 bg-clip-text text-transparent">
          {avgUtil}
        </span>
        <span className="text-[11px] font-bold text-sky-400/70">%</span>
        <span className="text-[9px] text-muted-foreground/60 ml-1">Avg Utilization</span>
      </div>

      {/* Status strip */}
      <p className="text-[8px] text-muted-foreground/60 -mt-1">
        <span className="text-sky-300 font-semibold">{total} máy</span>
        {' · '}
        <span className="text-green-400 font-semibold">{working} chạy</span>
        {' · '}
        <span className="text-amber-400 font-semibold">{idle} chờ việc</span>
        {' · '}
        <span className="text-red-400 font-semibold">{broken} hỏng</span>
        {' · '}
        <span className="text-slate-400 font-semibold">{stored} lưu kho</span>
      </p>

      {/* Stacked bar */}
      <div className="space-y-1">
        <div className="flex h-4 rounded-lg overflow-hidden gap-px bg-[#1a2030]">
          <Bar value={pct(working, total)} color="linear-gradient(to right, #16a34a, #34d399)" delay={0.2} />
          <Bar value={pct(idle, total)} color="linear-gradient(to right, #d97706, #fbbf24)" delay={0.35} />
          <Bar value={pct(broken, total)} color="linear-gradient(to right, #b91c1c, #f87171)" delay={0.5} />
          <Bar value={pct(stored, total)} color="linear-gradient(to right, #334155, #64748b)" delay={0.6} />
        </div>
      </div>

      {/* 3 mini tiles */}
      <div className="grid grid-cols-3 gap-1">
        <MiniTile label="Tỷ lệ chờ việc" value={`${idlePct}%`} color="#fbbf24" />
        <MiniTile label="Tỷ lệ huy động" value={`${mobilePct}%`} color="#34d399" />
        <MiniTile label="Availability" value={`${availPct}%`} color="#38bdf8" />
      </div>
    </KpiShell>
  )
}

/* ── Card 2: KPI Cọc hôm nay ── */
function PileCard({ worksites, piles, index }: { worksites: Worksite[]; piles: PileAssignment[]; index: number }) {
  const totalPlanned = worksites.reduce((s, w) => s + w.plannedPiles, 0)
  const completed = worksites.reduce((s, w) => s + w.completedPiles, 0)
  const inProgress = worksites.reduce((s, w) => s + w.inProgressPiles, 0)
  const delayed = worksites.reduce((s, w) => s + w.delayedPiles, 0)
  const blocked = worksites.reduce((s, w) => s + w.blockedPiles, 0)
  const onPlanPct = pct(completed, totalPlanned)

  const worstPile = piles
    .filter(p => p.delayHours > 0)
    .sort((a, b) => b.delayHours - a.delayHours)[0]

  const chips = [
    { label: 'Hoàn thành', count: completed, color: 'text-green-400', bg: 'bg-green-500/10 ring-green-500/20' },
    { label: 'Đang thi công', count: inProgress, color: 'text-sky-400', bg: 'bg-sky-500/10 ring-sky-500/20' },
    { label: 'Trễ', count: delayed, color: 'text-red-400', bg: 'bg-red-500/10 ring-red-500/20' },
    { label: 'Bị chặn', count: blocked, color: 'text-amber-400', bg: 'bg-amber-500/10 ring-amber-500/20' },
  ]

  return (
    <KpiShell index={index} theme={THEMES.violet} icon={<HardHat className="w-3 h-3" />}
      title="KPI Cọc hôm nay"
    >
      <div className="flex items-baseline gap-1">
        <span className="text-[2rem] font-black tabular-nums leading-none bg-gradient-to-br from-violet-200 via-violet-300 to-violet-500 bg-clip-text text-transparent">
          {completed}
        </span>
        <span className="text-[14px] font-black text-violet-400/50">/{totalPlanned}</span>
        <span className="ml-2 text-[8px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full ring-1 ring-green-500/20 font-bold">
          Đúng KH {onPlanPct}%
        </span>
      </div>

      {/* chips */}
      <div className="flex flex-wrap gap-1">
        {chips.map(c => (
          <span key={c.label} className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ring-1 text-[8px] font-semibold', c.color, c.bg)}>
            <span className="font-black">{c.count}</span> {c.label}
          </span>
        ))}
      </div>

      {worstPile && (
        <p className="text-[8px] text-muted-foreground/60 truncate border-t border-[#1e2433]/40 pt-1">
          Chậm nhất:{' '}
          <span className="text-red-400 font-semibold">SANY-021</span>
          {' · '}
          <span className="text-amber-300 font-semibold">{worstPile.pileCode}</span>
          {' · '}
          <span className="text-foreground/80">+{worstPile.delayHours}h</span>
        </p>
      )}
    </KpiShell>
  )
}

/* ── Card 3: Năng suất cọc ── */
function OutputCard({ machines, index }: { machines: Machine[]; index: number }) {
  const working = machines.filter(m => m.status === 'working')
  const avgOutput = Math.round(avg(machines.filter(m => m.status !== 'stored').map(m => m.outputPerHour)) * 10) / 10
  const perShift = Math.round(avgOutput * 7.5 * 10) / 10
  const totalDay = machines.reduce((s, m) => s + m.actualOutputToday, 0)

  const best = working.reduce((b, m) => m.outputPerHour > (b?.outputPerHour ?? 0) ? m : b, working[0])
  const worst = working.reduce((b, m) => m.outputPerHour < (b?.outputPerHour ?? Infinity) ? m : b, working[0])

  return (
    <KpiShell index={index} theme={THEMES.emerald} icon={<Gauge className="w-3 h-3" />}
      title="Năng suất cọc"
      headerRight={<span className="text-[8px] font-bold text-emerald-300">avg đội máy</span>}
    >
      <div className="flex items-baseline gap-1">
        <span className="text-[2rem] font-black tabular-nums leading-none bg-gradient-to-br from-emerald-200 via-green-300 to-emerald-500 bg-clip-text text-transparent">
          {fmtD(avgOutput)}
        </span>
        <span className="text-[11px] font-bold text-emerald-400/70">m/giờ</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <MiniTile label="Sản lượng/ca" value={fmtD(perShift)} unit="m/ca" color="#34d399" />
        <MiniTile label="Sản lượng/ngày" value={totalDay.toLocaleString('vi-VN')} unit="m" color="#6ee7b7" />
        <MiniTile label="Tốt nhất" value={best ? `${best.code}` : '—'} color="#a7f3d0" />
        <MiniTile label="Thấp nhất" value={worst && worst.code !== best?.code ? `${worst.code}` : '—'} color="#fbbf24" />
      </div>
    </KpiShell>
  )
}

/* ── Card 4: Nhiên liệu & chi phí ── */
function FuelCard({ machines, index }: { machines: Machine[]; index: number }) {
  let totalWasteCost = 0
  let totalSavingCost = 0
  let totalFuelLitres = 0
  let totalFuelCost = 0
  let overCount = 0

  for (const m of machines) {
    const variance = m.fuelLitresPerHour - m.fuelBaselineLitresPerHour
    const cost = m.fuelCostVndPerLitre * m.workingHours
    totalFuelLitres += m.fuelLitresPerHour
    totalFuelCost += m.fuelLitresPerHour * m.fuelCostVndPerLitre

    if (variance > 0) {
      totalWasteCost += variance * m.workingHours * m.fuelCostVndPerLitre
      overCount++
    } else if (m.actualOutputToday >= m.plannedOutputToday) {
      totalSavingCost += Math.abs(variance) * m.workingHours * m.fuelCostVndPerLitre
    }
    void cost
  }

  const avgLitPerHour = Math.round((totalFuelLitres / machines.length) * 10) / 10
  const avgCostPerHour = Math.round(totalFuelCost / machines.length)

  return (
    <KpiShell index={index} theme={THEMES.amber} icon={<Fuel className="w-3 h-3" />}
      title="Nhiên liệu & chi phí"
      headerRight={(
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[7px] font-bold ring-1 ring-red-500/20">
          <AlertTriangle className="w-2.5 h-2.5" />
          XCMG-007 +8.5%
        </span>
      )}
    >
      <div className="flex items-baseline gap-1">
        <span className="text-[2rem] font-black tabular-nums leading-none bg-gradient-to-br from-amber-200 via-orange-300 to-amber-500 bg-clip-text text-transparent">
          {fmtVnd(totalWasteCost)}
        </span>
        <span className="text-[9px] text-muted-foreground/60 ml-1">lãng phí</span>
      </div>
      <p className="text-[8px] text-green-400 font-semibold -mt-1">
        Tiết kiệm {fmtVnd(totalSavingCost)}
      </p>

      <div className="grid grid-cols-3 gap-1">
        <MiniTile label="Lít/giờ avg" value={fmtD(avgLitPerHour)} unit="lít/h" color="#fbbf24" />
        <MiniTile label="Chi phí/giờ" value={fmtVnd(avgCostPerHour)} color="#fb923c" />
        <MiniTile label="Vượt định mức" value={`${overCount}`} unit="máy" color="#f87171" />
      </div>
    </KpiShell>
  )
}

/* ── Export ── */
export function ProductivityKpiTier({
  machines, worksites, piles,
}: {
  machines: Machine[]
  worksites: Worksite[]
  piles: PileAssignment[]
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_0.95fr] gap-2.5 items-stretch">
      <FleetCard machines={machines} index={0} />
      <PileCard worksites={worksites} piles={piles} index={1} />
      <OutputCard machines={machines} index={2} />
      <FuelCard machines={machines} index={3} />
    </div>
  )
}
