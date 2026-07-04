import { useMemo } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { Machine } from '../types'

function fmtVnd(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)} triệu`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return v.toFixed(0)
}

interface Props {
  machines: Machine[]
}

export function FuelEfficiencyPanel({ machines }: Props) {
  const stats = useMemo(() => {
    const avgLit = machines.reduce((s, m) => s + m.fuelLitresPerHour, 0) / machines.length

    let totalWaste = 0
    let totalSaving = 0
    for (const m of machines) {
      const delta = m.fuelLitresPerHour - m.fuelBaselineLitresPerHour
      if (delta > 0) totalWaste += delta * m.workingHours * m.fuelCostVndPerLitre
      else if (m.actualOutputToday >= m.plannedOutputToday) {
        totalSaving += Math.abs(delta) * m.workingHours * m.fuelCostVndPerLitre
      }
    }

    const sorted = [...machines]
      .map(m => ({
        code: m.code,
        actual: m.fuelLitresPerHour,
        baseline: m.fuelBaselineLitresPerHour,
        variance: Math.round(((m.fuelLitresPerHour - m.fuelBaselineLitresPerHour) / m.fuelBaselineLitresPerHour) * 1000) / 10,
        saving: m.actualOutputToday >= m.plannedOutputToday && m.fuelLitresPerHour < m.fuelBaselineLitresPerHour,
      }))
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 8)

    return { avgLit: Math.round(avgLit * 10) / 10, totalWaste, totalSaving, sorted }
  }, [machines])

  return (
    <Panel title="Hiệu quả nhiên liệu" className="h-full min-h-0" noPadding>
      <div className="flex flex-col h-full min-h-0">
        {/* Fleet stats */}
        <div className="shrink-0 grid grid-cols-3 gap-0 border-b border-[#1e2433] divide-x divide-[#1e2433]">
          {[
            { label: 'TB Lít/giờ', value: `${stats.avgLit} lít/h`, color: 'text-amber-300' },
            { label: 'Lãng phí tổng', value: fmtVnd(stats.totalWaste), color: 'text-red-400' },
            { label: 'Tiết kiệm', value: fmtVnd(stats.totalSaving), color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className="px-2.5 py-2 text-center">
              <p className="text-[7px] text-muted-foreground/60 font-bold uppercase tracking-wider">{s.label}</p>
              <p className={cn('text-[11px] font-black tabular-nums mt-0.5', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-[#0b0f1a]/95 backdrop-blur-sm">
              <tr className="border-b border-[#1e2433]">
                {['Mã máy', 'Thực tế', 'Định mức', 'Chênh lệch'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[8px] font-bold text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.sorted.map((row, i) => {
                const over = row.variance > 0
                const highOver = row.variance > 5
                return (
                  <tr
                    key={row.code}
                    className={cn(
                      'border-b border-[#1e2433]/40 transition-colors',
                      i % 2 === 0 ? 'bg-[#0d1117]/30' : 'bg-transparent',
                      highOver ? 'bg-red-500/5' : row.saving ? 'bg-green-500/5' : '',
                      'hover:bg-[#1a2235]/40',
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className={cn('text-[10px] font-bold', highOver ? 'text-red-400' : row.saving ? 'text-green-400' : 'text-foreground/80')}>
                        {row.code}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('text-[10px] tabular-nums font-semibold', over ? 'text-red-400' : 'text-green-400')}>
                        {row.actual.toFixed(1)} lít/h
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] tabular-nums text-muted-foreground/70">
                        {row.baseline.toFixed(1)} lít/h
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {over
                          ? <TrendingUp className="w-3 h-3 text-red-400" />
                          : <TrendingDown className="w-3 h-3 text-green-400" />
                        }
                        <span className={cn('text-[10px] font-bold tabular-nums', over ? 'text-red-400' : 'text-green-400')}>
                          {over ? '+' : ''}{row.variance.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  )
}
