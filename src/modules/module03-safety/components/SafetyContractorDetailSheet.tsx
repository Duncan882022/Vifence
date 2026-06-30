import { Building2, ShieldAlert, User } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/utils/cn'
import type { Event } from '@/types/event'
import { getContractorSummary } from '../services/safetyEntity.service'
import { SAFETY_VIOLATIONS } from '../data/safetyViolations'
import { SafetyViolationHistoryList } from './SafetyViolationHistoryList'

interface SafetyContractorDetailSheetProps {
  contractorName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPlayback?: (event: Event) => void
  onSelectWorker?: (workerIdOrName: string) => void
}

function StatPill({ label, value, tone = 'default' }: {
  label: string
  value: string | number
  tone?: 'default' | 'red' | 'orange' | 'green'
}) {
  const toneClass = {
    default: 'text-foreground',
    red: 'text-red-400',
    orange: 'text-orange-400',
    green: 'text-green-400',
  }[tone]

  return (
    <div className="rounded-lg border border-[#1e2433] bg-[#0b0f1a] px-3 py-2">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn('text-lg font-bold tabular-nums mt-0.5', toneClass)}>{value}</p>
    </div>
  )
}

export function SafetyContractorDetailSheet({
  contractorName,
  open,
  onOpenChange,
  onPlayback,
  onSelectWorker,
}: SafetyContractorDetailSheetProps) {
  if (!contractorName) return null

  const summary = getContractorSummary(contractorName, SAFETY_VIOLATIONS)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto bg-[#0d1117] border-l border-[#1e2433] p-0 gap-0">
        <div className="px-4 pt-4 pb-3 border-b border-[#1e2433]">
          <SheetHeader>
            <SheetTitle className="text-base font-bold">Nhà thầu</SheetTitle>
            <p className="text-[10px] text-muted-foreground">Thông tin & lịch sử vi phạm · 7 ngày qua</p>
          </SheetHeader>
        </div>

        <div className="flex items-start gap-3 px-4 py-4 border-b border-[#1e2433]">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary/70" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-foreground leading-tight">{summary.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {summary.workerCount} nhân sự vi phạm
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-[#1e2433]">
          <StatPill label="Tổng VP" value={summary.totalViolations} tone="orange" />
          <StatPill
            label="Chưa XL"
            value={summary.pendingCount}
            tone={summary.pendingCount > 0 ? 'red' : 'green'}
          />
          <StatPill label="Nhân sự" value={summary.workerCount} />
        </div>

        {summary.topViolators.length > 0 && (
          <div className="px-4 py-3 border-b border-[#1e2433]">
            <div className="flex items-center gap-1.5 mb-2">
              <User className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                Top vi phạm
              </span>
            </div>
            <div className="space-y-1.5">
              {summary.topViolators.map((item, i) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => onSelectWorker?.(item.name)}
                  className="w-full flex items-center gap-2 text-left rounded-md px-2 py-1.5 hover:bg-[#1a2235]/50 transition-colors group"
                >
                  <span className="text-[10px] text-muted-foreground w-4 shrink-0 tabular-nums">{i + 1}</span>
                  <span className="flex-1 text-[10px] text-foreground truncate group-hover:text-primary transition-colors">
                    {item.name}
                  </span>
                  <span className="text-[10px] text-red-400 font-semibold tabular-nums shrink-0">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pt-3">
          <div className="flex items-center gap-1.5 px-4 pb-2">
            <ShieldAlert className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Lịch sử vi phạm
            </span>
            <span className="text-[9px] text-muted-foreground/50 tabular-nums">({summary.totalViolations})</span>
          </div>
          <SafetyViolationHistoryList
            violations={summary.violations}
            onPlayback={onPlayback}
            onSelectWorker={onSelectWorker}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
