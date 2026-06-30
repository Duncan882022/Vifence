import type { SafetyStats } from '@/types/safety'
import { User, Building2 } from 'lucide-react'

interface SafetyContractorPanelProps {
  stats: SafetyStats
  periodLabel?: string
  onSelectContractor?: (name: string) => void
  onSelectWorker?: (workerIdOrName: string) => void
}

export function SafetyContractorPanel({
  stats,
  periodLabel = '7 ngày qua',
  onSelectContractor,
  onSelectWorker,
}: SafetyContractorPanelProps) {
  const maxContractor = stats.topContractors[0]?.count ?? 1
  const totalContractorViolations = stats.topContractors.reduce((sum, c) => sum + c.count, 0) || 1

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
      <div className="px-3 py-2 border-b border-[#1e2433] shrink-0">
        <p className="text-[10px] text-muted-foreground">
          <span className="font-semibold text-foreground">{periodLabel}</span>
          <span className="mx-1.5">·</span>
          <span className="tabular-nums">{stats.totalViolations} vi phạm</span>
        </p>
      </div>

      <div className="p-3 space-y-4 flex-1">
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <User className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Top Người Vi Phạm
            </p>
          </div>
          <div className="space-y-2">
            {stats.topViolators.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Không có dữ liệu</p>
            )}
            {stats.topViolators.slice(0, 5).map((item, i) => (
              <div key={item.name} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-[#1a2235]/50 transition-colors group">
                <span className="text-[10px] text-muted-foreground w-4 shrink-0 tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-[10px] mb-0.5 gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectWorker?.(item.name)}
                      className="text-foreground font-medium truncate text-left group-hover:text-primary transition-colors cursor-pointer hover:underline underline-offset-2 decoration-dotted"
                    >
                      {item.name}
                    </button>
                    <span className="text-red-400 font-semibold shrink-0 tabular-nums">{item.count}</span>
                  </div>
                  {item.contractorName ? (
                    <button
                      type="button"
                      onClick={() => onSelectContractor?.(item.contractorName!)}
                      className="text-[8px] text-muted-foreground/70 truncate block max-w-full text-left hover:text-primary hover:underline underline-offset-2 decoration-dotted transition-colors cursor-pointer"
                    >
                      {[item.contractorName, item.teamName].filter(Boolean).join(' · ')}
                    </button>
                  ) : (
                    <p className="text-[8px] text-muted-foreground/70 truncate">
                      {[item.contractorName, item.teamName].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-[#1e2433] pt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Building2 className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Top Nhà Thầu Vi Phạm
            </p>
          </div>
          <div className="space-y-2">
            {stats.topContractors.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Không có dữ liệu</p>
            )}
            {stats.topContractors.slice(0, 5).map((item, i) => {
              const pct = Math.round((item.count / totalContractorViolations) * 100)
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => onSelectContractor?.(item.name)}
                  className="w-full text-left group cursor-pointer rounded-md px-1 py-0.5 hover:bg-[#1a2235]/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-4 shrink-0 tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[10px] mb-1 gap-2">
                        <span className="text-foreground truncate group-hover:text-primary transition-colors">
                          {item.name}
                        </span>
                        <span className="text-red-400 font-semibold shrink-0 tabular-nums">
                          {item.count} <span className="text-muted-foreground/60 font-medium">({pct}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1">
                        <div
                          className="h-full rounded-full bg-red-500 transition-all"
                          style={{ width: `${(item.count / maxContractor) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
