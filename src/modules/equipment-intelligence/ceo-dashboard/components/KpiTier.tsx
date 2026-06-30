import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { cn } from '@/utils/cn'
import { GlassCard, TrendBadge } from './GlassCard'
import type { AssetEfficiencyKpi, FleetKpi, PmComplianceKpi, ReliabilityKpi } from '../types'

const STATUS_COLORS = {
  working: '#4ade80',
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
  const pieData = [
    { name: 'Working', value: fleet.breakdown.working, key: 'working' },
    { name: 'Standby', value: fleet.breakdown.standby, key: 'standby' },
    { name: 'Breakdown', value: fleet.breakdown.breakdown, key: 'breakdown' },
    { name: 'Stored', value: fleet.breakdown.stored, key: 'stored' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <GlassCard
        title="MMTB"
        tooltip="Fleet Utilization = Working Hours / Available Hours"
        delay={0}
      >
        <p className="text-2xl font-bold text-white tabular-nums">
          {fleet.totalMmtb.toLocaleString('vi-VN')}
          <span className="text-sm font-medium text-slate-400 ml-1">máy</span>
        </p>
        <div className="flex items-center gap-3 min-h-[100px]">
          <div className="w-[100px] h-[100px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={28} outerRadius={44} paddingAngle={2} dataKey="value" stroke="none">
                  {pieData.map(entry => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key as keyof typeof STATUS_COLORS]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1 text-[10px]">
            {pieData.map(row => (
              <div key={row.name} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[row.key as keyof typeof STATUS_COLORS] }} />
                  {row.name}
                </span>
                <span className="font-semibold text-slate-200 tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-[10px] text-slate-500">Fleet Utilization</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-emerald-400">{fleet.fleetUtilizationPct}%</span>
            <TrendBadge value={fleet.fleetUtilizationTrendPct} />
          </div>
        </div>
      </GlassCard>

      <GlassCard
        title="PM Compliance"
        tooltip="PM Compliance = Completed PM On Time / Total Planned PM"
        delay={0.05}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-white tabular-nums">{pm.compliancePct}%</span>
          <TrendBadge value={pm.trendPct} />
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500/80" style={{ width: `${pm.compliancePct}%` }} />
        </div>
        <ul className="space-y-1.5 text-[11px]">
          <PmRow color="#4ade80" label="PM hoàn thành đúng hạn" value={pm.completedOnTime} />
          <PmRow color="#fbbf24" label="PM sắp tới hạn (&lt;50h)" value={pm.upcomingUnder50h} />
          <PmRow color="#f87171" label="PM trễ hạn" value={pm.overdue} />
          <PmRow color="#64748b" label="Tổng kế hoạch PM" value={pm.totalPlanned} />
        </ul>
      </GlassCard>

      <GlassCard
        title="Độ tin cậy thiết bị"
        tooltip="MTBF = Total Operating Hours / Failure Count · MTTR = Total Repair Duration / Completed Repairs · MTTF = Total Operating Hours / Major Failure Count"
        delay={0.1}
      >
        <div className="grid grid-cols-3 gap-2">
          <MetricCol label="MTBF" value={`${reliability.mtbfHours}h`} trend={reliability.mtbfTrendPct} />
          <MetricCol label="MTTR" value={`${reliability.mttrHours}h`} trend={reliability.mttrTrendPct} invert />
          <MetricCol label="MTTF" value={`${reliability.mttfHours.toLocaleString('vi-VN')}h`} trend={reliability.mttfTrendPct} />
        </div>
        <p className="text-[9px] text-slate-500 pt-2 border-t border-white/10 leading-relaxed">
          Dữ liệu tính từ các sự cố mức High &amp; Critical
        </p>
      </GlassCard>

      <GlassCard
        title="Hiệu quả tài sản"
        tooltip="Service Hours / Billion VND = Total Service Hours / Active Asset Value"
        delay={0.15}
      >
        <div className="space-y-3 flex-1">
          <AssetRow label="Tổng giá trị tài sản" value={`${asset.totalAssetValueBillionVnd.toLocaleString('vi-VN')} tỷ VNĐ`} />
          <AssetRow label="Giá trị tài sản nhàn rỗi" value={`${asset.idleAssetValueBillionVnd.toLocaleString('vi-VN')} tỷ VNĐ`} highlight />
          <AssetRow label="Giờ phục vụ / Tỷ VNĐ" value={`${asset.serviceHoursPerBillionVnd} h/tỷ`} accent />
        </div>
      </GlassCard>
    </div>
  )
}

function PmRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-semibold text-slate-200 tabular-nums">{value}</span>
    </li>
  )
}

function MetricCol({ label, value, trend, invert }: { label: string; value: string; trend: number; invert?: boolean }) {
  const good = invert ? trend <= 0 : trend >= 0
  return (
    <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-white/5">
      <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className="text-sm font-bold text-white tabular-nums">{value}</p>
      <p className={`text-[9px] font-semibold mt-0.5 ${good ? 'text-emerald-400' : 'text-red-400'}`}>
        {trend > 0 ? '+' : ''}{trend}{label === 'MTTR' ? 'h' : '%'}
      </p>
    </div>
  )
}

function AssetRow({ label, value, highlight, accent }: { label: string; value: string; highlight?: boolean; accent?: boolean }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
      <p className={cn(
        'text-sm font-bold tabular-nums',
        highlight ? 'text-amber-400' : accent ? 'text-sky-400' : 'text-white',
      )}>
        {value}
      </p>
    </div>
  )
}
