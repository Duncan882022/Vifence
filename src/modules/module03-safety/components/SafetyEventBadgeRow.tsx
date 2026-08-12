import type { LucideIcon } from 'lucide-react'
import { TagTooltip } from '@/components/common/IconTooltip/IconTooltip'
import { cn } from '@/utils/cn'
import type { AlertSeverity, SafetyViolationRecord } from '../types/safety.types'
import {
  getAlertCardStatusDisplay,
  SEVERITY_BADGE,
  SEVERITY_ICONS,
  SEVERITY_LABELS_UI,
  shouldShowAlertHandlingBadge,
} from '../utils/safetyDashboardUi'
import { SafetyGroupIconBadge } from './SafetyGroupIconBadge'

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const Icon = SEVERITY_ICONS[severity]
  return (
    <TagTooltip content={SEVERITY_LABELS_UI[severity]} className="shrink-0">
      <span
        className={cn(
          'w-5 h-5 rounded border inline-flex items-center justify-center',
          SEVERITY_BADGE[severity],
        )}
        aria-label={SEVERITY_LABELS_UI[severity]}
      >
        <Icon className="w-2.5 h-2.5 shrink-0" aria-hidden />
      </span>
    </TagTooltip>
  )
}

function HandlingBadge({
  label,
  badgeClassName,
  icon: StatusIcon,
}: {
  label: string
  badgeClassName: string
  icon: LucideIcon
}) {
  return (
    <TagTooltip content={label} className="shrink-0">
      <span
        className={cn(
          'w-5 h-5 rounded border inline-flex items-center justify-center',
          badgeClassName,
        )}
        aria-label={label}
      >
        <StatusIcon className="w-2.5 h-2.5 shrink-0" aria-hidden />
      </span>
    </TagTooltip>
  )
}

/** Nhóm ATLĐ + mức độ vi phạm + trạng thái xử lý — đồng bộ listing / popup. */
export function SafetyEventBadgeRow({
  record,
  className,
}: {
  record: SafetyViolationRecord
  className?: string
}) {
  const statusDisplay = getAlertCardStatusDisplay(record)

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <SafetyGroupIconBadge groupId={record.groupId} size="sm" showLabel />
      <SeverityBadge severity={record.severity} />
      {shouldShowAlertHandlingBadge(record) && (
        <HandlingBadge
          label={statusDisplay.label}
          badgeClassName={statusDisplay.badgeClassName}
          icon={statusDisplay.icon}
        />
      )}
    </div>
  )
}
