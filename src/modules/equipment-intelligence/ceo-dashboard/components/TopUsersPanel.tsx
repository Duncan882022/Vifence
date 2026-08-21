import { motion } from 'framer-motion'
import { Trophy, Medal, ChevronLeft, ChevronRight } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { UsageUnitRow } from '../types'

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400/25 to-amber-600/15 text-amber-400 ring-1 ring-amber-400/30">
        <Trophy className="w-3 h-3" />
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-slate-300/20 to-slate-400/10 text-slate-300 ring-1 ring-slate-400/25">
        <Medal className="w-3 h-3" />
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-orange-400/20 to-orange-600/10 text-orange-400 ring-1 ring-orange-400/25">
        <Medal className="w-3 h-3" />
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#1e2433]/60 text-muted-foreground text-[10px] font-bold tabular-nums">
      {rank}
    </span>
  )
}

function utilBarColor(pct: number): string {
  if (pct >= 75) return 'from-green-500 to-emerald-400'
  if (pct >= 60) return 'from-sky-500 to-cyan-400'
  return 'from-amber-500 to-yellow-400'
}

export function TopUsersPanel({ units, open = true, onToggle }: { units: UsageUnitRow[]; open?: boolean; onToggle?: () => void }) {
  if (!open) {
    return (
      <div className="flex flex-col items-center justify-between py-3 px-1.5 gap-2 bg-[#0d1117] border border-[#1e2433] rounded-lg overflow-hidden select-none shrink-0">
        <span
          className="text-[8px] font-semibold text-muted-foreground/60 uppercase tracking-widest whitespace-nowrap"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Top 10 đơn vị
        </span>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded-lg border border-[#1e2433] bg-[#060b14] text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
            aria-label="Mở rộng top 10 đơn vị"
            title="Mở rộng top 10 đơn vị"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    )
  }

  const collapseBtn = onToggle ? (
    <button
      type="button"
      onClick={onToggle}
      className="p-1 rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Thu gọn top 10 đơn vị"
      title="Thu gọn"
    >
      <ChevronLeft className="w-3.5 h-3.5" />
    </button>
  ) : undefined

  return (
    <Panel title="Top 10 đơn vị sử dụng" noPadding fit expandable headerRight={collapseBtn} className="shrink-0">
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0b0f1a]/95 backdrop-blur-sm border-b border-[#1e2433]">
              <th className="px-3 py-2.5 text-left w-10 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">#</th>
              <th className="px-3 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Đơn vị sử dụng</th>
              <th className="hidden sm:table-cell px-3 py-2.5 text-right text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Tổng MMTB</th>
              <th className="px-3 py-2.5 text-left min-w-[100px] sm:min-w-[120px] pl-2 sm:pl-4 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Sử dụng</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u, i) => (
              <motion.tr
                key={u.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className={cn(
                  'border-b border-[#1e2433]/60 transition-colors',
                  u.rank <= 3 ? 'bg-[#0d1117]/80 hover:bg-[#1a2235]/60' : 'hover:bg-[#1a2235]/40',
                )}
              >
                <td className="px-3 py-3">
                  <RankBadge rank={u.rank} />
                </td>
                <td className={cn(
                  'px-3 py-3 font-medium',
                  u.rank <= 3 ? 'text-foreground font-semibold' : 'text-foreground/90',
                )}>
                  {u.name}
                </td>
                <td className="hidden sm:table-cell px-3 py-3 text-right tabular-nums text-foreground font-bold">{u.totalMmtb}</td>
                <td className="px-3 py-3 pl-2 sm:pl-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-[#1e2433] overflow-hidden">
                      <div
                        className={cn('h-full rounded-full bg-gradient-to-r', utilBarColor(u.utilizationPct))}
                        style={{ width: `${u.utilizationPct}%` }}
                      />
                    </div>
                    <span className={cn(
                      'text-[10px] tabular-nums w-9 text-right font-bold',
                      u.utilizationPct >= 75 ? 'text-green-400' : u.utilizationPct >= 60 ? 'text-sky-400' : 'text-amber-400',
                    )}>
                      {u.utilizationPct}%
                    </span>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
