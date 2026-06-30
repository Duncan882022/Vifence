import { Building2, MapPin, Phone, ShieldAlert, User } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Avatar } from '@/components/common/Avatar/Avatar'
import { getPersonAvatarColor, getPersonAvatarUrl } from '@/data/personAvatars'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/format'
import type { Event } from '@/types/event'
import { getWorkerSummary } from '../services/safetyEntity.service'
import { SAFETY_VIOLATIONS } from '../data/safetyViolations'
import { SafetyViolationHistoryList } from './SafetyViolationHistoryList'

interface SafetyWorkerDetailSheetProps {
  workerIdOrName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPlayback?: (event: Event) => void
  onSelectContractor?: (contractorName: string) => void
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

export function SafetyWorkerDetailSheet({
  workerIdOrName,
  open,
  onOpenChange,
  onPlayback,
  onSelectContractor,
}: SafetyWorkerDetailSheetProps) {
  if (!workerIdOrName) return null

  const summary = getWorkerSummary(workerIdOrName, SAFETY_VIOLATIONS)
  if (!summary) return null

  const { profile } = summary
  const avatarColor = getPersonAvatarColor(profile.name)
  const avatarSrc = getPersonAvatarUrl(profile.workerId, profile.name)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto bg-[#0d1117] border-l border-[#1e2433] p-0 gap-0">
        <div className="px-4 pt-4 pb-3 border-b border-[#1e2433]">
          <SheetHeader>
            <SheetTitle className="text-base font-bold">Thông tin nhân sự</SheetTitle>
            <p className="text-[10px] text-muted-foreground">Lịch sử vi phạm an toàn lao động</p>
          </SheetHeader>
        </div>

        <div className="flex items-start gap-3 px-4 py-4 border-b border-[#1e2433]">
          <Avatar name={profile.name} color={avatarColor} src={avatarSrc} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-foreground leading-tight">{profile.name}</p>
            {profile.employeeCode && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{profile.employeeCode}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">{profile.role}</p>
            {profile.contractorName && (
              <button
                type="button"
                onClick={() => onSelectContractor?.(profile.contractorName!)}
                className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-primary/80 hover:text-primary hover:underline underline-offset-2 decoration-dotted transition-colors"
              >
                <Building2 className="w-3 h-3 shrink-0" />
                {profile.contractorName}
                {profile.teamName ? ` · ${profile.teamName}` : ''}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-[#1e2433]">
          <StatPill label="Tổng vi phạm" value={summary.totalViolations} tone="orange" />
          <StatPill
            label="Chưa xử lý"
            value={summary.pendingCount}
            tone={summary.pendingCount > 0 ? 'red' : 'green'}
          />
        </div>

        <div className="px-4 py-2 border-b border-[#1e2433] space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <MapPin className="w-3 h-3 shrink-0" />
            <span>{profile.site}</span>
          </div>
          {profile.phone && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Phone className="w-3 h-3 shrink-0" />
              <span className="tabular-nums">{profile.phone}</span>
            </div>
          )}
          {summary.lastViolationAt && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <ShieldAlert className="w-3 h-3 shrink-0 text-orange-400" />
              <span>
                Vi phạm gần nhất:{' '}
                <span className="text-foreground tabular-nums">{formatDateTime(summary.lastViolationAt)}</span>
              </span>
            </div>
          )}
        </div>

        <div className="pt-3">
          <div className="flex items-center gap-1.5 px-4 pb-2">
            <User className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Lịch sử vi phạm
            </span>
            <span className="text-[9px] text-muted-foreground/50 tabular-nums">({summary.totalViolations})</span>
          </div>
          <SafetyViolationHistoryList
            violations={summary.violations}
            onPlayback={onPlayback}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
