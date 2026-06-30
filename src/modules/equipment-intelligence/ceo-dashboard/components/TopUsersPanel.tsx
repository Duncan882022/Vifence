import { GlassCard } from './GlassCard'
import type { UsageUnitRow } from '../types'

export function TopUsersPanel({ units }: { units: UsageUnitRow[] }) {
  return (
    <GlassCard title="Top 10 đơn vị sử dụng MMTB" delay={0.3} noPadding>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="ecc-table-head border-b border-white/[0.06]">
              <th className="px-3 py-2 text-left w-8">#</th>
              <th className="px-3 py-2 text-left">Đơn vị sử dụng</th>
              <th className="px-3 py-2 text-right">Tổng MMTB</th>
              <th className="px-3 py-2 text-left min-w-[110px] pl-4">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u, idx) => (
              <tr
                key={u.name}
                className="ecc-table-row border-b border-white/[0.04]"
                style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : undefined }}
              >
                <td className="px-3 py-2.5">
                  <span className={[
                    'inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold tabular-nums',
                    u.rank <= 3 ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-600',
                  ].join(' ')}>
                    {u.rank}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-medium text-slate-200">{u.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-300 font-semibold">{u.totalMmtb}</td>
                <td className="px-3 py-2.5 pl-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                        style={{ width: `${u.utilizationPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-emerald-400 w-8 text-right font-semibold">
                      {u.utilizationPct}%
                    </span>
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
