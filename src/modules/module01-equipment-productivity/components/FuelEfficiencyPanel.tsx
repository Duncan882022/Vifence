import { useMemo, useState } from 'react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { Machine } from '../types'

function fmtD(v: number, d = 1): string {
  return v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtVnd(v: number): string {
  if (v >= 1_000_000) return `${fmtD(v / 1_000_000, 1)} triệu`
  if (v >= 1_000) return `${Math.round(v / 1_000).toLocaleString('vi-VN')}K`
  return v.toFixed(0)
}

interface Props {
  machines: Machine[]
}

interface FuelRow {
  code: string
  type: string
  actual: number
  baseline: number
  variancePct: number
  isWaste: boolean
  isSaving: boolean
}

export function FuelEfficiencyPanel({ machines }: Props) {
  const [visibleWaste, setVisibleWaste] = useState(5)
  const [visibleSaving, setVisibleSaving] = useState(5)

  const stats = useMemo(() => {
    const avgLit = machines.length > 0
      ? machines.reduce((s, m) => s + m.fuelLitresPerHour, 0) / machines.length
      : 0

    let totalWaste = 0
    let totalSaving = 0
    let wasteCount = 0
    let savingCount = 0

    const rows: FuelRow[] = machines.map(m => {
      const variance = m.fuelLitresPerHour - m.fuelBaselineLitresPerHour
      const variancePct = m.fuelBaselineLitresPerHour > 0
        ? (variance / m.fuelBaselineLitresPerHour) * 100
        : 0
      const isWaste = variance > 0
      const isSaving = variance < 0

      if (isWaste) {
        totalWaste += variance * m.workingHours * m.fuelCostVndPerLitre
        wasteCount++
      } else if (isSaving) {
        totalSaving += Math.abs(variance) * m.workingHours * m.fuelCostVndPerLitre
        savingCount++
      }

      return {
        code: m.code,
        type: m.type,
        actual: m.fuelLitresPerHour,
        baseline: m.fuelBaselineLitresPerHour,
        variancePct: Math.round(variancePct * 10) / 10,
        isWaste,
        isSaving,
      }
    })

    // Sort: wasters (desc by variancePct) → savers (asc by variancePct) → neutral
    rows.sort((a, b) => {
      if (a.isWaste && b.isWaste) return b.variancePct - a.variancePct
      if (a.isWaste) return -1
      if (b.isWaste) return 1
      if (a.isSaving && b.isSaving) return a.variancePct - b.variancePct
      if (a.isSaving) return -1
      if (b.isSaving) return 1
      return 0
    })

    return {
      avgLit: Math.round(avgLit * 10) / 10,
      totalWaste,
      totalSaving,
      wasteCount,
      savingCount,
      wasteRows: rows.filter(r => r.isWaste),
      saveRows: rows.filter(r => r.isSaving),
      neutralRows: rows.filter(r => !r.isWaste && !r.isSaving),
    }
  }, [machines])

  const displayRows = useMemo(() => {
    const wasters = stats.wasteRows.slice(0, visibleWaste)
    const savers = stats.saveRows.slice(0, visibleSaving)
    const neutralSlots = Math.max(0, 15 - wasters.length - savers.length)
    return [...wasters, ...savers, ...stats.neutralRows.slice(0, neutralSlots)]
  }, [stats, visibleWaste, visibleSaving])

  const remaining =
    Math.max(0, stats.wasteRows.length - visibleWaste) +
    Math.max(0, stats.saveRows.length - visibleSaving)
  const hasMore = remaining > 0

  return (
    <Panel title="Hiệu quả nhiên liệu" className="h-full min-h-0" noPadding>
      <div className="flex flex-col h-full min-h-0">
        {/* Summary chips */}
        <div className="shrink-0 grid grid-cols-3 gap-0 border-b border-[#1e2433] divide-x divide-[#1e2433]">
          {[
            { label: 'TB Lít/giờ', value: `${stats.avgLit} lít/h`, color: 'text-amber-300' },
            { label: `Lãng phí (${stats.wasteCount} máy)`, value: fmtVnd(stats.totalWaste), color: 'text-red-400' },
            { label: `Tiết kiệm (${stats.savingCount} máy)`, value: fmtVnd(stats.totalSaving), color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className="px-2 py-2 text-center">
              <p className="text-[7px] text-muted-foreground/60 font-bold uppercase tracking-wider leading-tight">{s.label}</p>
              <p className={cn('text-[11px] font-black tabular-nums mt-0.5', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Machine list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-[#0b0f1a]/95 backdrop-blur-sm">
              <tr className="border-b border-[#1e2433]">
                {['Mã máy / Loại', 'Thực tế', 'Định mức', 'Phân loại'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[8px] font-bold text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr
                  key={row.code}
                  className={cn(
                    'border-b border-[#1e2433]/40 transition-colors',
                    i % 2 === 0 ? 'bg-[#0d1117]/30' : 'bg-transparent',
                    row.isWaste && row.variancePct > 5 ? 'bg-red-500/5' : '',
                    row.isSaving ? 'bg-green-500/5' : '',
                    'hover:bg-[#1a2235]/40',
                  )}
                >
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className={cn(
                        'text-[10px] font-bold',
                        row.isWaste ? 'text-red-400' : row.isSaving ? 'text-green-400' : 'text-foreground/80',
                      )}>
                        {row.code}
                      </span>
                      <span className="text-[8px] text-muted-foreground/50 truncate max-w-[90px] leading-tight">
                        {row.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'text-[10px] tabular-nums font-semibold',
                      row.isWaste ? 'text-red-400' : 'text-green-400',
                    )}>
                      {row.actual.toFixed(1)} lít/h
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] tabular-nums text-muted-foreground/70">
                      {row.baseline.toFixed(1)} lít/h
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.isWaste ? (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 tabular-nums whitespace-nowrap">
                        -{Math.abs(row.variancePct).toFixed(1)}% lãng phí
                      </span>
                    ) : row.isSaving ? (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 tabular-nums whitespace-nowrap">
                        +{Math.abs(row.variancePct).toFixed(1)}% tiết kiệm
                      </span>
                    ) : (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#1e2433] text-muted-foreground/50 whitespace-nowrap">
                        Trong định mức
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <button
              onClick={() => {
                setVisibleWaste(v => v + 5)
                setVisibleSaving(v => v + 5)
              }}
              className="w-full py-2 text-[10px] text-primary hover:text-primary/80 transition-colors text-center border-t border-[#1e2433]"
            >
              Xem thêm ({remaining} còn lại)
            </button>
          )}
        </div>
      </div>
    </Panel>
  )
}
