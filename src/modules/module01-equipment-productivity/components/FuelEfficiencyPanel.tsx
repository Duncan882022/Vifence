import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Fuel, TrendingDown, TrendingUp } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { Machine } from '../types'

function fmtD(v: number, d = 1): string {
  return v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtLit(v: number): string {
  if (v >= 1000) return `${fmtD(v / 1000, 1)}k L`
  return `${fmtD(v, 0)} L`
}

interface Props {
  machines: Machine[]
}

interface FuelRow {
  code: string
  actual: number
  baseline: number
  variancePct: number
  isWaste: boolean
  isSaving: boolean
}

function StatBlock({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string
  tone: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex-1 min-w-0 rounded-lg border border-[#1e2433] bg-[#060b14] px-2 py-2 sm:px-3 sm:py-2.5">
      <div className="flex items-center gap-1 mb-1">
        <span className={cn(tone, 'shrink-0')}>{icon}</span>
        <p className="text-[7px] sm:text-[8px] font-bold text-muted-foreground/65 uppercase tracking-wider truncate">{label}</p>
      </div>
      <p className={cn('text-[11px] sm:text-[13px] font-black tabular-nums truncate', tone)}>{value}</p>
    </div>
  )
}

export function FuelEfficiencyPanel({ machines }: Props) {
  const [limit, setLimit] = useState(6)

  const stats = useMemo(() => {
    const operating = machines.filter(m => m.workingHours > 0)
    const avgLit = operating.length > 0
      ? operating.reduce((s, m) => s + m.fuelLitresPerHour, 0) / operating.length
      : 0

    let totalWasteLitres = 0
    let totalSavingLitres = 0
    let wasteCount = 0
    let savingCount = 0

    const rows: FuelRow[] = machines.map(m => {
      const variance = m.fuelLitresPerHour - m.fuelBaselineLitresPerHour
      const variancePct = m.fuelBaselineLitresPerHour > 0
        ? (variance / m.fuelBaselineLitresPerHour) * 100
        : 0
      const isWaste = variance > 0.05
      const isSaving = variance < -0.05
      const varianceLitres = Math.abs(variance) * m.workingHours

      if (m.workingHours > 0) {
        if (isWaste) {
          totalWasteLitres += varianceLitres
          wasteCount++
        } else if (isSaving) {
          totalSavingLitres += varianceLitres
          savingCount++
        }
      }

      return {
        code: m.code,
        actual: m.fuelLitresPerHour,
        baseline: m.fuelBaselineLitresPerHour,
        variancePct: Math.round(variancePct * 10) / 10,
        isWaste,
        isSaving,
      }
    })

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
      totalWasteLitres,
      totalSavingLitres,
      wasteCount,
      savingCount,
      rows,
    }
  }, [machines])

  const visible = stats.rows.slice(0, limit)
  const remaining = Math.max(0, stats.rows.length - limit)

  return (
    <Panel title="Hiệu quả nhiên liệu" className="h-full min-h-0" noPadding>
      <div className="flex flex-col flex-1 min-h-0 px-2 pb-2 pt-1 gap-2">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 shrink-0">
          <StatBlock
            label="TB lít/giờ"
            value={`${stats.avgLit} lít/h`}
            tone="text-amber-300"
            icon={<Fuel className="w-3 h-3" />}
          />
          <StatBlock
            label={`Lãng phí · ${stats.wasteCount}`}
            value={fmtLit(stats.totalWasteLitres)}
            tone="text-red-400"
            icon={<TrendingUp className="w-3 h-3" />}
          />
          <StatBlock
            label={`Tiết kiệm · ${stats.savingCount}`}
            value={fmtLit(stats.totalSavingLitres)}
            tone="text-green-400"
            icon={<TrendingDown className="w-3 h-3" />}
          />
        </div>

        <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
          {visible.map((row, idx) => (
            <motion.div
              key={row.code}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03, duration: 0.22 }}
              className={cn(
                'flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border border-[#1e2433] bg-[#060b14]',
                'hover:border-[#2a3855] transition-colors',
                row.isWaste && row.variancePct > 5 && 'bg-red-500/[0.04]',
                row.isSaving && 'bg-green-500/[0.04]',
              )}
            >
              <div className="min-w-0">
                <p className={cn(
                  'text-[10px] font-bold truncate',
                  row.isWaste ? 'text-red-400' : row.isSaving ? 'text-green-400' : 'text-foreground/90',
                )}>
                  {row.code}
                </p>
                <p className="text-[9px] text-muted-foreground/50 tabular-nums mt-0.5">
                  {row.actual.toFixed(1)} lít/h · ĐM {row.baseline.toFixed(1)}
                </p>
              </div>
              {row.isWaste ? (
                <span className="shrink-0 text-[9px] font-bold px-2 py-1 rounded-lg bg-red-500/15 text-red-400 tabular-nums">
                  +{Math.abs(row.variancePct).toFixed(1)}%
                </span>
              ) : row.isSaving ? (
                <span className="shrink-0 text-[9px] font-bold px-2 py-1 rounded-lg bg-green-500/15 text-green-400 tabular-nums">
                  {row.variancePct.toFixed(1)}%
                </span>
              ) : (
                <span className="shrink-0 text-[9px] px-2 py-1 rounded-lg bg-[#1e2433]/80 text-muted-foreground/55">
                  OK
                </span>
              )}
            </motion.div>
          ))}

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setLimit(l => l + 6)}
              className="w-full py-2 rounded-xl border border-dashed border-[#1e2433] text-[10px] font-medium text-primary/90 hover:text-primary hover:border-primary/35 transition-colors"
            >
              Xem thêm {remaining} máy
            </button>
          )}
        </div>
      </div>
    </Panel>
  )
}
