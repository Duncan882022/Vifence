import { useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import {
  TrendingUp, TrendingDown, Cpu, ClipboardList, Activity, Gem,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { MetricPercentRing } from '@/components/common/MetricPercentRing/MetricPercentRing'
import type { AssetEfficiencyKpi, FleetKpi, PmComplianceKpi, ReliabilityKpi } from '../types'

const STATUS_COLORS = {
  working: '#22c55e',
  standby: '#fbbf24',
  breakdown: '#f87171',
  stored: '#38bdf8',
} as const

const STATUS_LABELS: Record<keyof typeof STATUS_COLORS, string> = {
  working: 'Hoạt động',
  standby: 'Chờ việc',
  breakdown: 'Hỏng hóc',
  stored: 'Lưu kho',
}

const CARD_EASE = [0.22, 1, 0.36, 1] as const

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.45, ease: CARD_EASE },
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
      'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] sm:text-[8px] font-semibold tabular-nums border whitespace-nowrap',
      positive
        ? 'bg-green-500/10 text-green-400 border-green-500/25'
        : 'bg-red-500/10 text-red-400 border-red-500/25',
    )}>
      {positive ? <TrendingUp className="w-2 h-2 shrink-0" /> : <TrendingDown className="w-2 h-2 shrink-0" />}
      {value > 0 ? '+' : ''}{value}{suffix}
      <span className="text-muted-foreground/50 font-normal hidden lg:inline">· {label}</span>
    </span>
  )
}

interface CardTheme {
  accent: string
  accentHover: string
  glow: string
  hoverShadow: string
  iconBg: string
  iconRing: string
  iconColor: string
  heroGradient: string
}

const THEMES = {
  amber: {
    accent: 'border-l-amber-400/80',
    accentHover: 'hover:border-l-amber-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(251,191,36,0.14),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(251,191,36,0.1)]',
    iconBg: 'bg-amber-500/15',
    iconRing: 'ring-amber-400/35 shadow-[0_0_12px_rgba(251,191,36,0.25)]',
    iconColor: 'text-amber-400',
    heroGradient: 'from-white via-amber-50 to-amber-300/90',
  },
  emerald: {
    accent: 'border-l-emerald-400/80',
    accentHover: 'hover:border-l-emerald-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(52,211,153,0.12),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(52,211,153,0.1)]',
    iconBg: 'bg-emerald-500/15',
    iconRing: 'ring-emerald-400/35 shadow-[0_0_12px_rgba(52,211,153,0.25)]',
    iconColor: 'text-emerald-400',
    heroGradient: 'from-emerald-200 via-green-300 to-emerald-500',
  },
  sky: {
    accent: 'border-l-sky-400/80',
    accentHover: 'hover:border-l-sky-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(56,189,248,0.12),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(56,189,248,0.1)]',
    iconBg: 'bg-sky-500/15',
    iconRing: 'ring-sky-400/35 shadow-[0_0_12px_rgba(56,189,248,0.25)]',
    iconColor: 'text-sky-400',
    heroGradient: 'from-sky-200 via-sky-300 to-sky-500',
  },
  violet: {
    accent: 'border-l-violet-400/80',
    accentHover: 'hover:border-l-violet-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(167,139,250,0.12),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(167,139,250,0.1)]',
    iconBg: 'bg-violet-500/15',
    iconRing: 'ring-violet-400/35 shadow-[0_0_12px_rgba(167,139,250,0.25)]',
    iconColor: 'text-violet-400',
    heroGradient: 'from-white via-violet-100 to-violet-300/90',
  },
} as const satisfies Record<string, CardTheme>

function KpiShell({
  theme, icon, title, headerRight, children, index,
}: {
  theme: CardTheme
  icon: ReactNode
  title: string
  headerRight?: ReactNode
  children: React.ReactNode
  index: number
}) {
  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-[#1e2433]/90 border-l-[3px]',
        'bg-gradient-to-br from-[#0d1117] via-[#0a0e1a] to-[#060b14]',
        'transition-all duration-300',
        theme.accent, theme.accentHover, theme.hoverShadow,
      )}
    >
      <div className={cn('absolute inset-0 pointer-events-none', theme.glow)} />
      <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity"
        style={{ background: 'radial-gradient(circle at 100% 0%, rgba(255,255,255,0.04), transparent 70%)' }}
      />

      <div className="relative px-2.5 pt-2 pb-2.5 flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={cn(
              'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ring-1',
              theme.iconBg, theme.iconRing,
            )}>
              <span className={theme.iconColor}>{icon}</span>
            </div>
            <p className="text-[8px] sm:text-[9px] font-bold text-muted-foreground uppercase tracking-widest truncate">
              {title}
            </p>
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>

        {children}
      </div>
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
  const pieData = useMemo(() => (
    (['working', 'standby', 'breakdown', 'stored'] as const).map(key => ({
      name: STATUS_LABELS[key],
      value: fleet.breakdown[key],
      key,
    }))
  ), [fleet.breakdown])

  const idlePct = Math.round((asset.idleAssetValueBillionVnd / asset.totalAssetValueBillionVnd) * 100)
  const activePct = 100 - idlePct
  const availability = reliability.availabilityPct ?? 94.2

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-2.5 items-stretch">

      {/* Card 1 — MMTB Fleet */}
      <KpiShell
        index={0}
        theme={THEMES.amber}
        icon={<Cpu className="w-3 h-3" />}
        title="MMTB — Đội máy"
        headerRight={<TrendPill value={fleet.fleetUtilizationTrendPct} />}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1">
              <span className={cn(
                'font-black leading-none tabular-nums tracking-tight text-[1.65rem] sm:text-[1.85rem]',
                'bg-gradient-to-br bg-clip-text text-transparent',
                THEMES.amber.heroGradient,
              )}>
                {fleet.totalMmtb.toLocaleString('vi-VN')}
              </span>
              <span className="text-[9px] font-semibold text-amber-400/70">máy</span>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-[8px] text-muted-foreground/60 uppercase tracking-wide">Utilization</span>
              <span className="text-[11px] font-black tabular-nums bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
                {fleet.fleetUtilizationPct}%
              </span>
            </div>
          </div>

          <div className="relative w-[68px] h-[68px] shrink-0">
            <div className="absolute inset-[-3px] rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.12)_0%,transparent_70%)]" />
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={22}
                  outerRadius={32}
                  paddingAngle={2.5}
                  dataKey="value"
                  stroke="none"
                  animationBegin={150}
                  animationDuration={900}
                >
                  {pieData.map(entry => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-black text-foreground tabular-nums leading-none">
                {fleet.fleetUtilizationPct}%
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {pieData.map(row => {
            const pct = Math.round(row.value / total * 100)
            const color = STATUS_COLORS[row.key]
            return (
              <div
                key={row.key}
                className="flex flex-col items-center gap-0 px-0.5 py-1 rounded-lg border border-[#1e2433]/60"
                style={{ background: `${color}08` }}
              >
                <span className="w-1 h-1 rounded-full shrink-0 mb-0.5" style={{ background: color }} />
                <span className="text-[11px] font-black tabular-nums leading-none" style={{ color }}>
                  {row.value}
                </span>
                <span className="text-[6px] font-medium text-muted-foreground/60 truncate w-full text-center leading-tight">
                  {row.name}
                </span>
                <span className="text-[6px] tabular-nums text-muted-foreground/40">{pct}%</span>
              </div>
            )
          })}
        </div>
      </KpiShell>

      {/* Card 2 — PM Compliance */}
      <KpiShell
        index={1}
        theme={THEMES.emerald}
        icon={<ClipboardList className="w-3 h-3" />}
        title="Tuân thủ PM"
        headerRight={<TrendPill value={pm.trendPct} />}
      >
        <div className="flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-1">
            <span className={cn(
              'font-black leading-none tabular-nums tracking-tight text-[1.85rem] sm:text-[2rem]',
              'bg-gradient-to-br bg-clip-text text-transparent',
              THEMES.emerald.heroGradient,
            )}>
              {pm.compliancePct}
            </span>
            <span className="text-[14px] font-black text-emerald-400/80">%</span>
          </div>
          <MetricPercentRing
            percent={pm.compliancePct}
            color="#34d399"
            size={42}
            title={`${pm.compliancePct}% tuân thủ PM`}
          />
        </div>

        <div className="relative h-1.5 rounded-full bg-[#1a2030] overflow-hidden ring-1 ring-inset ring-[#2a3855]/25">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-green-300"
            initial={{ width: 0 }}
            animate={{ width: `${pm.compliancePct}%` }}
            transition={{ delay: 0.25, duration: 0.9, ease: CARD_EASE }}
            style={{ boxShadow: '0 0 10px rgba(52,211,153,0.5)' }}
          />
        </div>

        <div className="grid grid-cols-2 gap-1">
          <PmChip color="#22c55e" label="Hoàn thành đúng hạn" value={pm.completedOnTime} />
          <PmChip color="#fbbf24" label="Sắp tới hạn (&lt;50h)" value={pm.upcomingUnder50h} />
          <PmChip color="#f87171" label="PM trễ hạn" value={pm.overdue} />
          <PmChip color="#64748b" label="Tổng kế hoạch PM" value={pm.totalPlanned} muted />
        </div>
      </KpiShell>

      {/* Card 3 — Reliability */}
      <KpiShell
        index={2}
        theme={THEMES.sky}
        icon={<Activity className="w-3 h-3" />}
        title="Độ tin cậy"
      >
        <div className="grid grid-cols-3 gap-1">
          <ReliabilityTile
            label="MTBF"
            value={`${reliability.mtbfHours}h`}
            hint="Giờ giữa hỏng"
            trend={reliability.mtbfTrendPct}
            suffix="%"
            color="sky"
          />
          <ReliabilityTile
            label="MTTR"
            value={`${reliability.mttrHours}h`}
            hint="Thời gian sửa"
            trend={reliability.mttrTrendPct}
            suffix="h"
            invert
            color="amber"
          />
          <ReliabilityTile
            label="MTTF"
            value={`${reliability.mttfHours.toLocaleString('vi-VN')}h`}
            hint="Tuổi thọ TB"
            trend={reliability.mttfTrendPct}
            suffix="%"
            color="emerald"
          />
        </div>

        <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-[#060b14]/80 border border-[#1e2433]/70">
          <div className="flex-1 min-w-0">
            <p className="text-[7px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Availability
            </p>
            <div className="mt-1 h-1 rounded-full bg-[#1a2030] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-sky-600 to-sky-400"
                initial={{ width: 0 }}
                animate={{ width: `${availability}%` }}
                transition={{ delay: 0.35, duration: 0.8, ease: CARD_EASE }}
                style={{ boxShadow: '0 0 6px rgba(56,189,248,0.4)' }}
              />
            </div>
          </div>
          <span className="text-[1.1rem] font-black tabular-nums leading-none bg-gradient-to-r from-sky-300 to-sky-400 bg-clip-text text-transparent shrink-0">
            {availability}%
          </span>
        </div>
      </KpiShell>

      {/* Card 4 — Asset Efficiency */}
      <KpiShell
        index={3}
        theme={THEMES.violet}
        icon={<Gem className="w-3 h-3" />}
        title="Hiệu quả tài sản"
      >
        <div>
          <p className="text-[7px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">
            Tổng giá trị tài sản
          </p>
          <div className="flex items-baseline gap-1">
            <span className={cn(
              'text-[1.5rem] sm:text-[1.65rem] font-black leading-none tabular-nums tracking-tight',
              'bg-gradient-to-br bg-clip-text text-transparent',
              THEMES.violet.heroGradient,
            )}>
              {formatBillionVnd(asset.totalAssetValueBillionVnd)}
            </span>
            <span className="text-[9px] font-bold text-violet-400/60">tỷ VND</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[7px] uppercase tracking-wider text-muted-foreground/60">Phân bổ tài sản</span>
            <span className="text-[8px] tabular-nums text-muted-foreground/50">
              <span className="text-green-400/80">{activePct}%</span>
              {' · '}
              <span className="text-amber-400/80">{idlePct}% idle</span>
            </span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-[#1a2030] ring-1 ring-inset ring-[#2a3855]/25">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-600/80 to-violet-400/70"
              initial={{ width: 0 }}
              animate={{ width: `${activePct}%` }}
              transition={{ delay: 0.3, duration: 0.8, ease: CARD_EASE }}
            />
            <motion.div
              className="h-full bg-gradient-to-r from-amber-600/60 to-amber-400/50"
              initial={{ width: 0 }}
              animate={{ width: `${idlePct}%` }}
              transition={{ delay: 0.45, duration: 0.8, ease: CARD_EASE }}
            />
          </div>
          <div className="flex items-center justify-between gap-1 text-[8px] tabular-nums">
            <span className="text-muted-foreground/50 truncate">
              Nhàn rỗi{' '}
              <span className="font-bold text-amber-400">
                {formatBillionVnd(asset.idleAssetValueBillionVnd)}
              </span>
              {' '}tỷ
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl border border-[#1e2433]/70 bg-[#060b14]/80">
          <div className="min-w-0">
            <p className="text-[7px] uppercase tracking-widest text-muted-foreground/60">Giờ phục vụ / Tỷ VND</p>
            <p className="text-[8px] text-muted-foreground/40 mt-0.5 truncate">ROI vận hành</p>
          </div>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-[1.15rem] font-black tabular-nums leading-none bg-gradient-to-r from-sky-300 to-cyan-400 bg-clip-text text-transparent">
              {asset.serviceHoursPerBillionVnd.toLocaleString('vi-VN')}
            </span>
            <span className="text-[7px] font-bold text-sky-400/60">h/tỷ</span>
          </div>
        </div>
      </KpiShell>
    </div>
  )
}

function PmChip({ color, label, value, muted }: {
  color: string; label: string; value: number; muted?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-1 px-1.5 py-1 rounded-lg border border-[#1e2433]/50',
        muted ? 'bg-[#060b14]/50' : '',
      )}
      style={muted ? undefined : { background: `${color}0a`, borderColor: `${color}28` }}
    >
      <span className="flex items-center gap-1 min-w-0">
        <span className="w-1 h-1 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[7px] text-muted-foreground/70 truncate">{label}</span>
      </span>
      <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: muted ? undefined : color }}>
        {value}
      </span>
    </div>
  )
}

function ReliabilityTile({
  label, value, hint, trend, suffix, invert, color,
}: {
  label: string
  value: string
  hint?: string
  trend: number
  suffix: string
  invert?: boolean
  color: 'sky' | 'amber' | 'emerald'
}) {
  const positive = invert ? trend <= 0 : trend >= 0
  const palette = {
    sky: { value: 'text-sky-400', label: 'text-sky-400/60', bg: 'bg-sky-500/5 border-sky-500/15' },
    amber: { value: 'text-amber-400', label: 'text-amber-400/60', bg: 'bg-amber-500/5 border-amber-500/15' },
    emerald: { value: 'text-emerald-400', label: 'text-emerald-400/60', bg: 'bg-emerald-500/5 border-emerald-500/15' },
  }[color]

  return (
    <div className={cn(
      'flex flex-col items-center gap-0 px-1 py-1.5 rounded-lg border border-[#1e2433]/60',
      palette.bg,
    )}>
      <p className={cn('text-[6px] font-bold uppercase tracking-widest', palette.label)}>{label}</p>
      <p className={cn('text-[12px] font-black tabular-nums leading-none mt-0.5', palette.value)}>{value}</p>
      {hint && <span className="text-[5px] text-muted-foreground/40 text-center leading-tight line-clamp-1">{hint}</span>}
      <span className={cn(
        'inline-flex items-center gap-0.5 text-[7px] font-semibold mt-0.5 tabular-nums',
        positive ? 'text-green-400' : 'text-red-400',
      )}>
        {positive ? <TrendingUp className="w-1.5 h-1.5" /> : <TrendingDown className="w-1.5 h-1.5" />}
        {trend > 0 ? '+' : ''}{trend}{suffix}
      </span>
    </div>
  )
}
