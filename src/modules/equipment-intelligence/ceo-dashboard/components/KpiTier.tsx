import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { cn } from '@/utils/cn'
import { Cpu, ClipboardList, Activity, Gem, Info } from 'lucide-react'
import { GlassCard, TrendBadge, CardIcon } from './GlassCard'
import type { AssetEfficiencyKpi, FleetKpi, PmComplianceKpi, ReliabilityKpi } from '../types'

const STATUS_COLORS = {
  working: '#34d399',
  standby: '#fbbf24',
  breakdown: '#f87171',
  stored: '#38bdf8',
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
  const pieData = [
    { name: 'Working', value: fleet.breakdown.working, key: 'working' },
    { name: 'Standby', value: fleet.breakdown.standby, key: 'standby' },
    { name: 'Breakdown', value: fleet.breakdown.breakdown, key: 'breakdown' },
    { name: 'Stored', value: fleet.breakdown.stored, key: 'stored' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {/* ── MMTB ── */}
      <GlassCard
        title="MMTB"
        subtitle="Tổng số MMTB"
        icon={<CardIcon color="amber"><Cpu className="w-4 h-4" strokeWidth={1.75} /></CardIcon>}
        delay={0}
      >
        {/* Big number */}
        <div className="flex items-baseline gap-2 -mt-1">
          <span className="text-[38px] font-bold text-white tabular-nums leading-none tracking-tight">
            {fleet.totalMmtb.toLocaleString('vi-VN')}
          </span>
          <span className="text-[13px] text-slate-500">máy</span>
        </div>

        {/* Donut + legend */}
        <div className="flex items-center gap-3">
          <div className="relative w-[80px] h-[80px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={26} outerRadius={38} paddingAngle={2} dataKey="value" stroke="none">
                  {pieData.map(entry => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key as keyof typeof STATUS_COLORS]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[11px] font-bold text-white">{fleet.fleetUtilizationPct}%</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {pieData.map(row => {
              const pct = Math.round(row.value / total * 100)
              return (
                <div key={row.name} className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="flex items-center gap-1.5 text-slate-400 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_COLORS[row.key as keyof typeof STATUS_COLORS] }} />
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="font-medium text-slate-300 tabular-nums shrink-0">
                    {row.value} <span className="text-slate-500">({pct},0%)</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Fleet utilization footer */}
        <div className="flex items-center justify-between pt-2.5 mt-auto border-t border-white/[0.06]">
          <span className="text-[11px] text-slate-500">Fleet Utilization</span>
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold text-emerald-400 tabular-nums">{fleet.fleetUtilizationPct}%</span>
            <TrendBadge value={fleet.fleetUtilizationTrendPct} showLabel />
          </div>
        </div>
      </GlassCard>

      {/* ── PM Compliance ── */}
      <GlassCard
        title="PM COMPLIANCE"
        subtitle="PM Compliance"
        icon={<CardIcon color="emerald"><ClipboardList className="w-4 h-4" strokeWidth={1.75} /></CardIcon>}
        delay={0.05}
      >
        <div className="flex items-baseline gap-2 -mt-1">
          <span className="text-[38px] font-bold text-white tabular-nums leading-none">{pm.compliancePct}%</span>
          <TrendBadge value={pm.trendPct} showLabel />
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden -mt-1">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
            style={{ width: `${pm.compliancePct}%` }}
          />
        </div>

        <ul className="space-y-2 text-[11px]">
          <PmRow color="#34d399" label="PM hoàn thành đúng hạn" value={pm.completedOnTime} />
          <PmRow color="#fbbf24" label="PM sắp tới hạn (<50h)" value={pm.upcomingUnder50h} />
          <PmRow color="#f87171" label="PM trễ hạn" value={pm.overdue} />
          <PmRow color="#64748b" label="Tổng kế hoạch PM" value={pm.totalPlanned} />
        </ul>
      </GlassCard>

      {/* ── Độ tin cậy ── */}
      <GlassCard
        title="ĐỘ TIN CẬY THIẾT BỊ"
        subtitle="3 chỉ số độ tin cậy chính"
        icon={<CardIcon color="sky"><Activity className="w-4 h-4" strokeWidth={1.75} /></CardIcon>}
        delay={0.1}
      >
        <div className="grid grid-cols-3 gap-2 flex-1">
          <MetricCol
            label="MTBF"
            value={`${reliability.mtbfHours}h`}
            trend={reliability.mtbfTrendPct}
            suffix="%"
          />
          <MetricCol
            label="MTTR"
            value={`${reliability.mttrHours}h`}
            trend={reliability.mttrTrendPct}
            suffix="h"
            invert
          />
          <MetricCol
            label="MTTF"
            value={`${reliability.mttfHours.toLocaleString('vi-VN')}h`}
            trend={reliability.mttfTrendPct}
            suffix="%"
          />
        </div>

        <div className="flex items-start gap-1.5 pt-2.5 mt-auto border-t border-white/[0.06]">
          <Info className="w-3 h-3 text-slate-600 shrink-0 mt-px" strokeWidth={1.75} />
          <p className="text-[10px] text-slate-600 leading-relaxed italic">
            Dữ liệu tính từ các sự cố mức High &amp; Critical
          </p>
        </div>
      </GlassCard>

      {/* ── Hiệu quả tài sản ── */}
      <GlassCard
        title="HIỆU QUẢ TÀI SẢN"
        icon={<CardIcon color="violet"><Gem className="w-4 h-4" strokeWidth={1.75} /></CardIcon>}
        delay={0.15}
      >
        <div className="space-y-4 flex-1">
          <AssetRow
            label="Tổng giá trị tài sản"
            value={asset.totalAssetValueBillionVnd.toLocaleString('vi-VN')}
            unit="tỷ VND"
          />
          <AssetRow
            label="Giá trị tài sản nhàn rỗi"
            value={asset.idleAssetValueBillionVnd.toLocaleString('vi-VN')}
            unit="tỷ VND"
            variant="warn"
          />
          <AssetRow
            label="Giờ phục vụ / Tỷ VND"
            value={asset.serviceHoursPerBillionVnd.toLocaleString('vi-VN')}
            unit="h / tỷ VND"
            variant="accent"
          />
        </div>
      </GlassCard>
    </div>
  )
}

function PmRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        {label}
      </span>
      <span className="font-bold text-slate-200 tabular-nums">{value}</span>
    </li>
  )
}

function MetricCol({
  label, value, trend, suffix, invert,
}: {
  label: string; value: string; trend: number; suffix: string; invert?: boolean
}) {
  const positive = invert ? trend <= 0 : trend >= 0
  return (
    <div className="text-center p-2.5 rounded-lg bg-slate-900/50 border border-white/[0.05]">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-2">{label}</p>
      <p className="text-[15px] font-bold text-white tabular-nums leading-tight">{value}</p>
      <p className={cn('text-[10px] font-semibold mt-1.5 tabular-nums', positive ? 'text-emerald-400' : 'text-red-400')}>
        {trend > 0 ? '+' : ''}{trend}{suffix}
      </p>
      <p className="text-[8px] text-slate-600 mt-0.5">so với th.tr</p>
    </div>
  )
}

function AssetRow({
  label, value, unit, variant,
}: {
  label: string; value: string; unit: string; variant?: 'warn' | 'accent'
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={cn(
        'tabular-nums tracking-tight flex items-baseline gap-1.5',
        variant === 'warn' ? 'text-amber-400' : variant === 'accent' ? 'text-sky-400' : 'text-white',
      )}>
        <span className="text-[20px] font-bold">{value}</span>
        <span className="text-[12px] font-medium text-slate-500">{unit}</span>
      </p>
    </div>
  )
}
