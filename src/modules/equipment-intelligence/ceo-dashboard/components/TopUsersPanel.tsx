import { GlassCard } from './GlassCard'
import type { UsageUnitRow } from '../types'

export function TopUsersPanel({ units }: { units: UsageUnitRow[] }) {
  return (
    <GlassCard title="Top 10 đơn vị sử dụng MMTB" delay={0.3}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/10 text-[9px] uppercase tracking-wider text-slate-500">
              <th className="py-2 px-2 text-left w-8">#</th>
              <th className="py-2 px-2 text-left">Đơn vị sử dụng</th>
              <th className="py-2 px-2 text-right">Tổng MMTB</th>
              <th className="py-2 px-2 text-left min-w-[100px]">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {units.map(u => (
              <tr key={u.name} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="py-2 px-2 text-slate-500 tabular-nums">{u.rank}</td>
                <td className="py-2 px-2 font-medium text-slate-200">{u.name}</td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-300">{u.totalMmtb}</td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500/70"
                        style={{ width: `${u.utilizationPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-emerald-400 w-8 text-right">{u.utilizationPct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}
