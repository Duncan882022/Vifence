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
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.5, ease: CARD_EASE },
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
  accent, accentGlow, hoverGlow, icon, iconBg, iconColor, title, children, footer, index,
}: {
  accent: string
  accentGlow: string
  hoverGlow: string
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
        'relative overflow-hidden rounded-xl border border-[#1e2433]/80 border-l-[3px] flex flex-col',
        'bg-gradient-to-br from-[#0d1117] via-[#0a0e1a] to-[#060b14]',
        `transition-all duration-300 ${hoverGlow}`,
        accent,
      )}
    >
      {/* Per-card colored glow */}
      <div className={cn('absolute inset-0 pointer-events-none', accentGlow)} />

      {/* Header */}
      <div className="relative flex items-center gap-2.5 px-3 pt-3 pb-0">
        <div className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
          iconBg,
        )}>
          <span className={iconColor}>{icon}</span>
        </div>
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
      </div>

      {/* Divider */}
      <div className="relative mx-3 mt-2 h-px bg-gradient-to-r from-transparent via-[#1e2433] to-transparent" />

      {/* Content */}
      <div className="relative flex-1 px-3 pt-2 pb-0">{children}</div>

      {/* Footer */}
      {footer && (
        <div className="relative mx-3 mb-3 mt-2 pt-2 border-t border-[#1e2433]/60">{footer}</div>
      )}
      {!footer && <div className="pb-3" />}
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
    { name: 'Hoạt động', value: fleet.breakdown.working, key: 'working' as const },
    { name: 'Chờ việc', value: fleet.breakdown.standby, key: 'standby' as const },
    { name: 'Hỏng hóc', value: fleet.breakdown.breakdown, key: 'breakdown' as const },
    { name: 'Lưu kho', value: fleet.breakdown.stored, key: 'stored' as const },
  ], [fleet.breakdown])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">

      {/* ── Card 1: MMTB Fleet ───────────────────────────────────────── */}
      <KpiShell
        index={0}
        accent="border-l-amber-400/70 hover:border-l-amber-400"
        accentGlow="bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,rgba(251,191,36,0.1),transparent_65%)]"
        hoverGlow="hover:shadow-[0_0_32px_rgba(251,191,36,0.12)]"
        iconBg="bg-amber-500/15 ring-1 ring-amber-400/30 shadow-[0_0_16px_rgba(251,191,36,0.2)]"
        iconColor="text-amber-400"
        icon={<Cpu className="w-3.5 h-3.5" />}
        title="MMTB — Đội máy"
        footer={(
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-0.5">Fleet Utilization</p>
              <span className="text-xl font-black bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent tabular-nums">
                {fleet.fleetUtilizationPct}%
              </span>
            </div>
            <TrendPill value={fleet.fleetUtilizationTrendPct} />
          </div>
        )}
      >
        {/* Hero number */}
        <div className="flex items-baseline gap-2 mb-2.5">
          <span className="font-black leading-none tabular-nums tracking-tight text-[2rem] bg-gradient-to-br from-white via-white to-amber-200/80 bg-clip-text text-transparent">
            {fleet.totalMmtb.toLocaleString('vi-VN')}
          </span>
          <span className="text-[10px] font-semibold text-amber-400/80">máy</span>
        </div>

        {/* Donut + status pills */}
        <div className="flex items-center gap-3">
          {/* Donut with glow ring */}
          <div className="relative w-[86px] h-[86px] shrink-0">
            <div className="absolute inset-[-4px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.08) 0%, transparent 70%)' }}
            />
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={26}
                  outerRadius={40}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                  animationBegin={200}
                  animationDuration={1000}
                >
                  {pieData.map(entry => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[11px] font-black text-foreground tabular-nums leading-none">{fleet.fleetUtilizationPct}%</span>
              <span className="text-[6px] text-muted-foreground/60 uppercase tracking-widest mt-0.5">util</span>
            </div>
          </div>

          {/* Status pills */}
          <div className="flex-1 grid grid-cols-2 gap-1">
            {pieData.map(row => {
              const pct = Math.round(row.value / total * 100)
              const color = STATUS_COLORS[row.key]
              return (
                <div
                  key={row.name}
                  className="flex flex-col gap-0.5 px-1.5 py-1 rounded-lg border"
                  style={{
                    background: `${color}0d`,
                    borderColor: `${color}33`,
                  }}
                >
                  <span className="text-[7px] font-medium truncate" style={{ color: `${color}cc` }}>
                    {row.name}
                  </span>
                  <span className="text-[11px] font-black tabular-nums leading-none" style={{ color }}>
                    {row.value}
                  </span>
                  <span className="text-[7px] tabular-nums text-muted-foreground/50">{pct}%</span>
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
        accentGlow="bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,rgba(52,211,153,0.09),transparent_65%)]"
        hoverGlow="hover:shadow-[0_0_32px_rgba(52,211,153,0.12)]"
        iconBg="bg-emerald-500/15 ring-1 ring-emerald-400/30 shadow-[0_0_16px_rgba(52,211,153,0.2)]"
        iconColor="text-emerald-400"
        icon={<ClipboardList className="w-3.5 h-3.5" />}
        title="PM Compliance"
        footer={<TrendPill value={pm.trendPct} label="so với tháng trước" />}
      >
        {/* Hero % + inline badge */}
        <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
          <span className="font-black leading-none tabular-nums tracking-tight text-[2.2rem] bg-gradient-to-br from-emerald-300 via-green-300 to-emerald-500 bg-clip-text text-transparent">
            {pm.compliancePct}%
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium text-muted-foreground leading-none">đúng hạn</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 whitespace-nowrap">
              <TrendingUp className="w-2 h-2" />
              +{pm.trendPct}% tháng trước
            </span>
          </div>
        </div>

        {/* Glowing progress bar */}
        <div className="relative h-2 rounded-full bg-[#1a2030] overflow-visible mb-3 ring-1 ring-inset ring-[#2a3855]/30">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-green-300"
            initial={{ width: 0 }}
            animate={{ width: `${pm.compliancePct}%` }}
            transition={{ delay: 0.3, duration: 1.0, ease: CARD_EASE }}
            style={{ boxShadow: '0 0 8px rgba(52,211,153,0.6), 0 0 16px rgba(52,211,153,0.2)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none rounded-full" />
        </div>

        {/* PM list with colored left border */}
        <ul className="space-y-1 text-[10px]">
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
        accentGlow="bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,rgba(56,189,248,0.09),transparent_65%)]"
        hoverGlow="hover:shadow-[0_0_32px_rgba(56,189,248,0.12)]"
        iconBg="bg-sky-500/15 ring-1 ring-sky-400/30 shadow-[0_0_16px_rgba(56,189,248,0.2)]"
        iconColor="text-sky-400"
        icon={<Activity className="w-3.5 h-3.5" />}
        title="Độ tin cậy"
      >
        <div className="grid grid-cols-3 gap-1.5 mt-0.5">
          <MetricTile
            label="MTBF"
            value={`${reliability.mtbfHours}h`}
            trend={reliability.mtbfTrendPct}
            suffix="%"
            accentColor="sky"
            description="Giờ giữa hỏng"
          />
          <MetricTile
            label="MTTR"
            value={`${reliability.mttrHours}h`}
            trend={reliability.mttrTrendPct}
            suffix="h"
            invert
            accentColor="amber"
            description="Thời gian sửa"
          />
          <MetricTile
            label="MTTF"
            value={`${reliability.mttfHours.toLocaleString('vi-VN')}h`}
            trend={reliability.mttfTrendPct}
            suffix="%"
            accentColor="emerald"
            description="Tuổi thọ TB"
          />
        </div>

        {/* Availability score */}
        <div className="mt-2 flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#060b14]/90 border border-[#1e2433]/80"
          style={{ boxShadow: 'inset 0 1px 0 rgba(56,189,248,0.06)' }}
        >
          <div>
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Availability Score</p>
            <p className="text-[8px] text-muted-foreground/50 mt-0.5">Tỉ lệ khả dụng toàn đội</p>
          </div>
          <span className="text-[1.2rem] font-black bg-gradient-to-r from-sky-300 to-sky-400 bg-clip-text text-transparent tabular-nums leading-none">
            {reliability.availabilityPct ?? 94.2}%
          </span>
        </div>
      </KpiShell>

      {/* ── Card 4: Asset Efficiency ──────────────────────────────────── */}
      <KpiShell
        index={3}
        accent="border-l-violet-400/70 hover:border-l-violet-400"
        accentGlow="bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,rgba(167,139,250,0.09),transparent_65%)]"
        hoverGlow="hover:shadow-[0_0_32px_rgba(167,139,250,0.12)]"
        iconBg="bg-violet-500/15 ring-1 ring-violet-400/30 shadow-[0_0_16px_rgba(167,139,250,0.2)]"
        iconColor="text-violet-400"
        icon={<Gem className="w-3.5 h-3.5" />}
        title="Hiệu quả tài sản"
      >
        <div className="space-y-0">
          {/* Hero asset value */}
          <div className="mb-2">
            <p className="text-[8px] uppercase tracking-widest text-muted-foreground/70 mb-0.5">Tổng giá trị tài sản</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[1.75rem] font-black leading-none tabular-nums bg-gradient-to-r from-white via-white to-violet-200/80 bg-clip-text text-transparent tracking-tight">
                {formatBillionVnd(asset.totalAssetValueBillionVnd)}
              </span>
              <span className="text-[10px] font-bold text-violet-400/70">tỷ VND</span>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-[#1e2433] to-transparent my-1.5" />

          {/* Idle asset */}
          <div className="mb-1.5">
            <p className="text-[8px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Tài sản nhàn rỗi</p>
            <div className="flex items-baseline gap-1">
              <span className="text-[1.1rem] font-black tabular-nums text-amber-400 leading-none">
                {formatBillionVnd(asset.idleAssetValueBillionVnd)}
              </span>
              <span className="text-[9px] font-medium text-muted-foreground">tỷ VND</span>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-[#1e2433] to-transparent my-1.5" />

          {/* ROI metric */}
          <div>
            <p className="text-[8px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Giờ phục vụ / Tỷ VND</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[1.3rem] font-black tabular-nums leading-none bg-gradient-to-r from-sky-300 to-sky-400 bg-clip-text text-transparent">
                {asset.serviceHoursPerBillionVnd.toLocaleString('vi-VN')}
              </span>
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-bold border"
                style={{ background: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.25)', color: '#38bdf8' }}
              >
                h / tỷ
              </span>
            </div>
          </div>
        </div>
      </KpiShell>
    </div>
  )
}

function PmRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-2 pl-2 border-l-2 rounded-sm" style={{ borderColor: color }}>
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="font-bold text-foreground tabular-nums shrink-0">{value}</span>
    </li>
  )
}

function MetricTile({
  label, value, trend, suffix, invert, accentColor, description,
}: {
  label: string; value: string; trend: number; suffix: string; invert?: boolean
  accentColor: 'sky' | 'amber' | 'emerald'
  description?: string
}) {
  const positive = invert ? trend <= 0 : trend >= 0
  const colorMap = {
    sky: { text: 'text-sky-400', border: 'hover:border-sky-500/30', label: 'text-sky-400/70', bg: 'bg-sky-500/5' },
    amber: { text: 'text-amber-400', border: 'hover:border-amber-500/30', label: 'text-amber-400/70', bg: 'bg-amber-500/5' },
    emerald: { text: 'text-emerald-400', border: 'hover:border-emerald-500/30', label: 'text-emerald-400/70', bg: 'bg-emerald-500/5' },
  }
  const c = colorMap[accentColor]

  return (
    <div className={cn(
      'flex flex-col items-center gap-0.5 p-2 rounded-lg bg-[#060b14]/90 border border-[#1e2433] transition-colors',
      c.border, c.bg,
    )}>
      <p className={cn('text-[7px] font-bold uppercase tracking-widest', c.label)}>{label}</p>
      <p className={cn('text-[14px] font-black tabular-nums leading-tight mt-0.5', c.text)}>{value}</p>
      {description && (
        <p className="text-[6px] text-muted-foreground/40 text-center leading-tight">{description}</p>
      )}
      <p className={cn(
        'inline-flex items-center gap-0.5 text-[8px] font-semibold mt-0.5 tabular-nums',
        positive ? 'text-green-400' : 'text-red-400',
      )}>
        {positive ? <TrendingUp className="w-2 h-2" /> : <TrendingDown className="w-2 h-2" />}
        {trend > 0 ? '+' : ''}{trend}{suffix}
      </p>
    </div>
  )
}
