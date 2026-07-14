import { useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Cpu, ClipboardList, Activity, Gem,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { AssetEfficiencyKpi, FleetKpi, PmComplianceKpi, ReliabilityKpi } from '../types'

/* ─────────────────────────────────────────────
   Hằng số
───────────────────────────────────────────── */
const STATUS_COLORS = {
  working:   '#22c55e',
  standby:   '#fbbf24',
  breakdown: '#f87171',
  stored:    '#38bdf8',
} as const

const STATUS_VI: Record<keyof typeof STATUS_COLORS, string> = {
  working:   'Đang hoạt động',
  standby:   'Chờ việc',
  breakdown: 'Hỏng hóc',
  stored:    'Lưu kho',
}

const EASE = [0.22, 1, 0.36, 1] as const

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.45, ease: EASE },
  }),
}

/* ─────────────────────────────────────────────
   Theme — giống Module 1
───────────────────────────────────────────── */
interface Theme { accent: string; iconBg: string; iconColor: string }

const THEMES = {
  amber:   { accent: 'border-l-amber-500/50',   iconBg: 'bg-amber-500/10',   iconColor: 'text-amber-400' },
  emerald: { accent: 'border-l-emerald-500/50', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
  sky:     { accent: 'border-l-sky-500/50',     iconBg: 'bg-sky-500/10',     iconColor: 'text-sky-400' },
  violet:  { accent: 'border-l-violet-500/50',  iconBg: 'bg-violet-500/10',  iconColor: 'text-violet-400' },
} as const satisfies Record<string, Theme>

/* ─────────────────────────────────────────────
   KpiShell — layout ngang giống MetricCard Module 1
───────────────────────────────────────────── */
function KpiShell({
  theme, icon, label, hero, children, index,
}: {
  theme: Theme
  icon: ReactNode
  label: string
  hero: ReactNode
  children: ReactNode
  index: number
}) {
  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className={cn(
        'border border-[#1e2433] border-l-2 rounded-lg',
        'hover:border-[#2a3855]/80 transition-colors',
        'p-2.5 sm:p-3 bg-[#0d1117]',
        theme.accent,
      )}
    >
      <div className="flex items-start gap-1.5 sm:gap-2 min-w-0">
        {/* Icon trái */}
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          theme.iconBg,
        )}>
          <span className={theme.iconColor}>{icon}</span>
        </div>

        {/* Nội dung phải */}
        <div className="flex-1 min-w-0">
          {/* Nhãn */}
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate leading-tight">
            {label}
          </p>

          {/* Số hero */}
          <div className="flex items-baseline gap-0.5 sm:gap-1 mt-0.5 flex-wrap">
            {hero}
          </div>

          {/* Thông tin phụ */}
          <div className="mt-1 sm:mt-1.5 min-w-0">
            {children}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────
   Typography — đồng nhất với Module 1
───────────────────────────────────────────── */
function SoLon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(
      'font-bold leading-none tabular-nums tracking-tight text-base sm:text-xl',
      className,
    )}>
      {children}
    </span>
  )
}

function DonVi({ children }: { children: ReactNode }) {
  return (
    <span className="text-[8px] sm:text-[10px] font-medium text-muted-foreground shrink-0">
      {children}
    </span>
  )
}

function ThanhTien({ value, barClass, delay = 0.25 }: {
  value: number; barClass: string; delay?: number
}) {
  return (
    <div className="h-1.5 rounded-full bg-[#1a2030] overflow-hidden">
      <motion.div
        className={cn('h-full rounded-full', barClass)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ delay, duration: 0.8, ease: EASE }}
      />
    </div>
  )
}

function Chip({ color, label, count }: { color: string; label: string; count: number }) {
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

/* ─────────────────────────────────────────────
   KpiTier
───────────────────────────────────────────── */
export function KpiTier({
  fleet, pm, reliability, asset,
}: {
  fleet: FleetKpi
  pm: PmComplianceKpi
  reliability: ReliabilityKpi
  asset: AssetEfficiencyKpi
}) {
  const pieData = useMemo(() => (
    (['working', 'standby', 'breakdown', 'stored'] as const).map(key => ({
      key,
      value: fleet.breakdown[key],
      color: STATUS_COLORS[key],
      label: STATUS_VI[key],
    }))
  ), [fleet.breakdown])

  const total       = fleet.totalMmtb
  const working     = fleet.breakdown.working
  const huyDongPct  = Math.round((working + fleet.breakdown.standby) / total * 100)

  const idlePct   = Math.round((asset.idleAssetValueBillionVnd / asset.totalAssetValueBillionVnd) * 100)
  const activePct = 100 - idlePct
  const khadung   = reliability.availabilityPct
    ?? Math.round(reliability.mtbfHours / (reliability.mtbfHours + reliability.mttrHours) * 1000) / 10

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-2.5 items-stretch">

      {/* ── Card 1 — Đội máy ── */}
      <KpiShell
        index={0}
        theme={THEMES.amber}
        icon={<Cpu className="w-3.5 h-3.5" />}
        label="Đội máy"
        hero={(
          <>
            <SoLon className="text-green-400">{(working + fleet.breakdown.standby).toLocaleString('vi-VN')}</SoLon>
            <DonVi>/</DonVi>
            <SoLon className="text-foreground">{total.toLocaleString('vi-VN')}</SoLon>
            <DonVi>máy đang chạy</DonVi>
          </>
        )}
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-[9px] text-muted-foreground/60 leading-snug">
            Huy động{' '}
            <span className="font-semibold text-amber-400">{huyDongPct}%</span>
            {' · '}
            Sử dụng{' '}
            <span className="font-semibold text-green-400">{fleet.fleetUtilizationPct}%</span>
          </p>
          <div className="grid grid-cols-2 gap-1">
            {pieData.map(d => (
              <Chip key={d.key} color={d.color} label={d.label} count={d.value} />
            ))}
          </div>
          <ThanhTien
            value={fleet.fleetUtilizationPct}
            barClass="bg-gradient-to-r from-amber-600 to-amber-400"
          />
        </div>
      </KpiShell>

      {/* ── Card 2 — Tuân thủ bảo dưỡng ── */}
      <KpiShell
        index={1}
        theme={THEMES.emerald}
        icon={<ClipboardList className="w-3.5 h-3.5" />}
        label="Tuân thủ bảo dưỡng"
        hero={(
          <>
            <SoLon className="text-emerald-400">{pm.compliancePct}</SoLon>
            <DonVi>%</DonVi>
          </>
        )}
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-[9px] text-muted-foreground/60">
            {pm.completedOnTime.toLocaleString('vi-VN')} ca đúng hạn · {pm.totalPlanned.toLocaleString('vi-VN')} kế hoạch
          </p>
          <ThanhTien
            value={pm.compliancePct}
            barClass="bg-gradient-to-r from-emerald-600 via-emerald-400 to-green-300"
          />
          <div className="grid grid-cols-3 gap-1">
            <Chip color="#22c55e" label="Đúng hạn" count={pm.completedOnTime} />
            <Chip color="#fbbf24" label="Sắp tới hạn" count={pm.upcomingUnder50h} />
            <Chip color="#f87171" label="Quá hạn" count={pm.overdue} />
          </div>
        </div>
      </KpiShell>

      {/* ── Card 3 — Độ tin cậy ── */}
      <KpiShell
        index={2}
        theme={THEMES.sky}
        icon={<Activity className="w-3.5 h-3.5" />}
        label="Độ tin cậy thiết bị"
        hero={(
          <>
            <SoLon className="text-sky-400">{khadung}</SoLon>
            <DonVi>%</DonVi>
            <DonVi className="ml-0.5">khả dụng</DonVi>
          </>
        )}
      >
        <div className="flex flex-col gap-1.5">
          <ThanhTien
            value={khadung}
            barClass="bg-gradient-to-r from-sky-600 to-sky-400"
            delay={0.35}
          />
          {/* 3 chỉ số kỹ thuật */}
          <div className="grid grid-cols-3 gap-1">
            {[
              { abbr: 'MTBF', vi: 'Giờ TB không hỏng', value: `${reliability.mtbfHours}h`, color: 'text-sky-400', bg: 'bg-sky-500/5 border-sky-500/15' },
              { abbr: 'MTTR', vi: 'Giờ sửa TB',    value: `${reliability.mttrHours}h`, color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/15' },
              { abbr: 'MTTF', vi: 'Tuổi thọ TB',   value: `${reliability.mttfHours.toLocaleString('vi-VN')}h`, color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/15' },
            ].map(m => (
              <div key={m.abbr} className={cn('flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-md border', m.bg)}>
                <p className="text-[6px] font-bold uppercase tracking-widest text-muted-foreground/60">{m.vi}</p>
                <p className={cn('text-[11px] font-bold tabular-nums leading-none', m.color)}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      </KpiShell>

      {/* ── Card 4 — Giá trị tài sản ── */}
      <KpiShell
        index={3}
        theme={THEMES.violet}
        icon={<Gem className="w-3.5 h-3.5" />}
        label="Giá trị tài sản"
        hero={(
          <>
            <SoLon className="text-violet-300">
              {asset.totalAssetValueBillionVnd.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
            </SoLon>
            <DonVi>tỷ VND</DonVi>
          </>
        )}
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-[9px] text-muted-foreground/60">
            <span className="text-green-400/80 font-semibold">{activePct}%</span>
            {' '}đang dùng
            {' · '}
            <span className="text-amber-400/80 font-semibold">{idlePct}%</span>
            {' '}nhàn rỗi
          </p>

          {/* Thanh phân bổ */}
          <div className="flex h-1.5 rounded-full overflow-hidden bg-[#1a2030]">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-600/80 to-violet-400/70"
              initial={{ width: 0 }}
              animate={{ width: `${activePct}%` }}
              transition={{ delay: 0.3, duration: 0.8, ease: EASE }}
            />
            <motion.div
              className="h-full bg-gradient-to-r from-amber-600/60 to-amber-400/50"
              initial={{ width: 0 }}
              animate={{ width: `${idlePct}%` }}
              transition={{ delay: 0.45, duration: 0.8, ease: EASE }}
            />
          </div>

          <div className="grid grid-cols-2 gap-1">
            <div className="flex flex-col gap-0.5 px-1.5 py-1 rounded-md bg-violet-500/5 border border-violet-500/15">
              <p className="text-[7px] text-muted-foreground/50 uppercase tracking-wide">Đang sinh lợi</p>
              <p className="text-[11px] font-bold tabular-nums text-violet-300 leading-none">
                {(asset.totalAssetValueBillionVnd - asset.idleAssetValueBillionVnd).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                <span className="text-[7px] font-semibold text-violet-300/60 ml-0.5">tỷ</span>
              </p>
            </div>
            <div className="flex flex-col gap-0.5 px-1.5 py-1 rounded-md bg-amber-500/5 border border-amber-500/15">
              <p className="text-[7px] text-muted-foreground/50 uppercase tracking-wide">Nhàn rỗi</p>
              <p className="text-[11px] font-bold tabular-nums text-amber-400 leading-none">
                {asset.idleAssetValueBillionVnd.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                <span className="text-[7px] font-semibold text-amber-400/60 ml-0.5">tỷ</span>
              </p>
            </div>
          </div>
        </div>
      </KpiShell>
    </div>
  )
}
