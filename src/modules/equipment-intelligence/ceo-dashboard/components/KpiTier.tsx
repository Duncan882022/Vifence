import { useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import {
  TrendingUp, TrendingDown, Cpu, ClipboardList, Activity, Gem,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { AssetEfficiencyKpi, FleetKpi, PmComplianceKpi, ReliabilityKpi } from '../types'

const STATUS_COLORS = {
  working: '#22c55e',
  standby: '#fbbf24',
  breakdown: '#f87171',
  stored: '#38bdf8',
} as const

const CARD_EASE = [0.22, 1, 0.36, 1] as const

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: CARD_EASE },
  }),
}

function formatBillionVnd(value: number): string {
  return value.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

function TrendPill({ value, suffix = '%', invert, label = 'so với tháng trước' }: {
  value: number; suffix?: string; invert?: boolean; label?: string
}) {
  const positive = invert ? value <= 0 : value >= 0
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-semibold tabular-nums border',
      positive
        ? 'bg-green-500/10 text-green-400 border-green-500/25'
        : 'bg-red-500/10 text-red-400 border-red-500/25',
    )}>
      {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {value > 0 ? '+' : ''}{value}{suffix}
      <span className="text-muted-foreground/60 font-normal hidden sm:inline">· {label}</span>
    </span>
  )
}

function KpiShell({
  accent, accentGlow, icon, iconBg, iconColor, title, children, footer, index,
}: {
  accent: string
  accentGlow: string
  icon: ReactNode
  iconBg: string
  iconColor: string
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  index: number
}) {
  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-[#1e2433]/80 border-l-[3px] flex flex-col',
        'bg-gradient-to-br from-[#0d1117] via-[#0a0e1a] to-[#060b14]',
        'hover:shadow-[0_12px_40px_rgba(0,0,0,0.45)] transition-all duration-300',
        accent,
      )}
    >
      {/* Per-card colored glow */}
      <div className={cn('absolute inset-0 pointer-events-none', accentGlow)} />

      {/* Header */}
      <div className="relative flex items-center gap-3 px-4 pt-4 pb-0">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
          iconBg,
        )}>
          <span className={iconColor}>{icon}</span>
        </div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
      </div>

      {/* Subtle divider under header */}
      <div className="relative mx-4 mt-3 h-px bg-gradient-to-r from-transparent via-[#1e2433] to-transparent" />

      {/* Content */}
      <div className="relative flex-1 px-4 pt-3 pb-0">{children}</div>

      {/* Footer */}
      {footer && (
        <div className="relative mx-4 mb-4 mt-3 pt-3 border-t border-[#1e2433]/60">{footer}</div>
      )}
      {!footer && <div className="pb-4" />}
    </motion.div>
  )
}

export function KpiTier({
  fleet, pm, reliability, asset,
}: {
  fleet: FleetKpi
  pm: PmComplianceKpi
  reliability: ReliabilityKpi
  asset: AssetEfficiencyKpi
}) {
  const total = fleet.totalMmtb
  const pieData = useMemo(() => [
    { name: 'Working', value: fleet.breakdown.working, key: 'working' as const },
    { name: 'Standby', value: fleet.breakdown.standby, key: 'standby' as const },
    { name: 'Breakdown', value: fleet.breakdown.breakdown, key: 'breakdown' as const },
    { name: 'Stored', value: fleet.breakdown.stored, key: 'stored' as const },
  ], [fleet.breakdown])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">

      {/* ── Card 1: MMTB Fleet ───────────────────────────────────────── */}
      <KpiShell
        index={0}
        accent="border-l-amber-400/70 hover:border-l-amber-400"
        accentGlow="bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,rgba(251,191,36,0.07),transparent_65%)]"
        iconBg="bg-amber-500/15 ring-1 ring-amber-400/30 shadow-[0_0_12px_rgba(251,191,36,0.15)]"
        iconColor="text-amber-400"
        icon={<Cpu className="w-4.5 h-4.5" />}
        title="MMTB — Đội máy"
        footer={(
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-0.5">Fleet Utilization</p>
              <span className="text-base font-bold bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent tabular-nums">
                {fleet.fleetUtilizationPct}%
              </span>
            </div>
            <TrendPill value={fleet.fleetUtilizationTrendPct} />
          </div>
        )}
      >
        {/* Hero number */}
        <div className="flex items-baseline gap-2 mb-3.5">
          <span className="font-black leading-none tabular-nums tracking-tight text-[2.2rem] bg-gradient-to-br from-white via-white to-amber-200/80 bg-clip-text text-transparent">
            {fleet.totalMmtb.toLocaleString('vi-VN')}
          </span>
          <span className="text-xs font-semibold text-amber-400/80">máy</span>
        </div>

        {/* Donut + legend */}
        <div className="flex items-center gap-3">
          <div className="relative w-[88px] h-[88px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={28}
                  outerRadius={42}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                  animationBegin={200}
                  animationDuration={900}
                >
                  {pieData.map(entry => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[12px] font-bold text-foreground tabular-nums">{fleet.fleetUtilizationPct}%</span>
              <span className="text-[7px] text-muted-foreground/70 uppercase tracking-widest">util</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {pieData.map(row => {
              const pct = Math.round(row.value / total * 100)
              return (
                <div key={row.name} className="flex items-center justify-between gap-1 text-[10px]">
                  <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: STATUS_COLORS[row.key] }} />
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="font-bold text-foreground tabular-nums shrink-0">
                    {row.value}
                    <span className="text-muted-foreground/50 font-normal ml-0.5 text-[9px]">({pct}%)</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </KpiShell>

      {/* ── Card 2: PM Compliance ─────────────────────────────────────── */}
      <KpiShell
        index={1}
        accent="border-l-emerald-400/70 hover:border-l-emerald-400"
        accentGlow="bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,rgba(52,211,153,0.07),transparent_65%)]"
        iconBg="bg-emerald-500/15 ring-1 ring-emerald-400/30 shadow-[0_0_12px_rgba(52,211,153,0.15)]"
        iconColor="text-emerald-400"
        icon={<ClipboardList className="w-4.5 h-4.5" />}
        title="PM Compliance"
        footer={<TrendPill value={pm.trendPct} label="so với tháng trước" />}
      >
        {/* Hero % */}
        <div className="flex items-baseline gap-2 mb-3">
          <span className="font-black leading-none tabular-nums tracking-tight text-[2.2rem] bg-gradient-to-br from-emerald-300 via-green-400 to-emerald-500 bg-clip-text text-transparent">
            {pm.compliancePct}%
          </span>
          <span className="text-xs font-medium text-muted-foreground">đúng hạn</span>
        </div>

        {/* Progress bar */}
        <div className="relative h-2.5 rounded-full bg-[#1a2030] overflow-hidden mb-4 ring-1 ring-inset ring-[#2a3855]/30">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-green-300"
            initial={{ width: 0 }}
            animate={{ width: `${pm.compliancePct}%` }}
            transition={{ delay: 0.3, duration: 0.9, ease: CARD_EASE }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none rounded-full" />
        </div>

        {/* PM list */}
        <ul className="space-y-1.5 text-[10px]">
          <PmRow color="#22c55e" label="Hoàn thành đúng hạn" value={pm.completedOnTime} />
          <PmRow color="#fbbf24" label="Sắp tới hạn (&lt;50h)" value={pm.upcomingUnder50h} />
          <PmRow color="#f87171" label="PM trễ hạn" value={pm.overdue} />
          <PmRow color="#64748b" label="Tổng kế hoạch PM" value={pm.totalPlanned} />
        </ul>
      </KpiShell>

      {/* ── Card 3: Reliability ───────────────────────────────────────── */}
      <KpiShell
        index={2}
        accent="border-l-sky-400/70 hover:border-l-sky-400"
        accentGlow="bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,rgba(56,189,248,0.07),transparent_65%)]"
        iconBg="bg-sky-500/15 ring-1 ring-sky-400/30 shadow-[0_0_12px_rgba(56,189,248,0.15)]"
        iconColor="text-sky-400"
        icon={<Activity className="w-4.5 h-4.5" />}
        title="Độ tin cậy thiết bị"
      >
        <div className="grid grid-cols-3 gap-2 mt-1">
          <MetricTile label="MTBF" value={`${reliability.mtbfHours}h`} trend={reliability.mtbfTrendPct} suffix="%" />
          <MetricTile label="MTTR" value={`${reliability.mttrHours}h`} trend={reliability.mttrTrendPct} suffix="h" invert />
          <MetricTile label="MTTF" value={`${reliability.mttfHours.toLocaleString('vi-VN')}h`} trend={reliability.mttfTrendPct} suffix="%" />
        </div>

        {/* Availability score */}
        <div className="mt-3 flex items-center justify-between px-2 py-2 rounded-xl bg-[#060b14]/80 border border-[#1e2433]/60">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Availability Score</span>
          <span className="text-sm font-bold bg-gradient-to-r from-sky-300 to-sky-400 bg-clip-text text-transparent tabular-nums">
            {reliability.availabilityPct ?? 94.2}%
          </span>
        </div>
      </KpiShell>

      {/* ── Card 4: Asset Efficiency ──────────────────────────────────── */}
      <KpiShell
        index={3}
        accent="border-l-violet-400/70 hover:border-l-violet-400"
        accentGlow="bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,rgba(167,139,250,0.07),transparent_65%)]"
        iconBg="bg-violet-500/15 ring-1 ring-violet-400/30 shadow-[0_0_12px_rgba(167,139,250,0.15)]"
        iconColor="text-violet-400"
        icon={<Gem className="w-4.5 h-4.5" />}
        title="Hiệu quả tài sản"
      >
        <div className="space-y-0">
          <AssetRow
            label="Tổng giá trị tài sản"
            value={formatBillionVnd(asset.totalAssetValueBillionVnd)}
            unit="tỷ VND"
            hero
          />
          <div className="my-2.5 h-px bg-gradient-to-r from-transparent via-[#1e2433] to-transparent" />
          <AssetRow
            label="Tài sản nhàn rỗi"
            value={formatBillionVnd(asset.idleAssetValueBillionVnd)}
            unit="tỷ VND"
            variant="warn"
          />
          <div className="my-2.5 h-px bg-gradient-to-r from-transparent via-[#1e2433] to-transparent" />
          <AssetRow
            label="Giờ phục vụ / Tỷ VND"
            value={asset.serviceHoursPerBillionVnd.toLocaleString('vi-VN')}
            unit="h / tỷ"
            variant="accent"
          />
        </div>
      </KpiShell>
    </div>
  )
}

function PmRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        {label}
      </span>
      <span className="font-bold text-foreground tabular-nums">{value}</span>
    </li>
  )
}

function MetricTile({
  label, value, trend, suffix, invert,
}: {
  label: string; value: string; trend: number; suffix: string; invert?: boolean
}) {
  const positive = invert ? trend <= 0 : trend >= 0
  return (
    <div className="flex flex-col items-center gap-0.5 p-2.5 rounded-xl bg-[#060b14]/90 border border-[#1e2433] hover:border-sky-500/25 transition-colors">
      <p className="text-[8px] font-bold uppercase tracking-widest text-sky-400/70">{label}</p>
      <p className="text-[15px] font-black text-foreground tabular-nums leading-tight mt-0.5">{value}</p>
      <p className={cn(
        'inline-flex items-center gap-0.5 text-[9px] font-semibold mt-0.5 tabular-nums',
        positive ? 'text-green-400' : 'text-red-400',
      )}>
        {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
        {trend > 0 ? '+' : ''}{trend}{suffix}
      </p>
    </div>
  )
}

function AssetRow({
  label, value, unit, variant, hero,
}: {
  label: string; value: string; unit: string; variant?: 'warn' | 'accent'; hero?: boolean
}) {
  return (
    <div>
      <p className="text-[8px] uppercase tracking-widest text-muted-foreground/70 mb-1">{label}</p>
      <p className={cn(
        'tabular-nums tracking-tight flex items-baseline gap-1.5',
        variant === 'warn' ? 'text-amber-400' : variant === 'accent' ? 'text-sky-400' : 'text-foreground',
      )}>
        <span className={cn(
          'font-black',
          hero
            ? 'text-2xl sm:text-[1.6rem] bg-gradient-to-r from-white via-white to-violet-200/80 bg-clip-text text-transparent'
            : 'text-lg',
        )}>
          {value}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">{unit}</span>
      </p>
    </div>
  )
}
