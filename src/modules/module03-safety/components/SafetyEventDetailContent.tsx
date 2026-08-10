import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Camera,
  Car,
  Clock,
  MapPin,
  User,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { TagTooltip } from '@/components/common/IconTooltip/IconTooltip'
import { formatDateTime } from '@/utils/format'
import type { SafetyViolationRecord } from '../types/safety.types'
import { getScenarioName, SAFETY_SCENARIO_MAP } from '../data/safetyScenarios'
import { resolveStaticViolationSnapshotUrl, resolveViolationSnapshotUrl } from '../data/safetyViolationSnapshots'
import { RemoteViolationSnapshotImage } from './violations/RemoteViolationSnapshotImage'
import {
  GROUP_BADGE,
  GROUP_COLORS,
  GROUP_ICONS,
  SEVERITY_BADGE,
  SEVERITY_ICONS,
  SEVERITY_LABELS_UI,
  getAlertCardStatusDisplay,
  isIconOnlyHandlingBadge,
  shouldShowAlertHandlingBadge,
} from '../utils/safetyDashboardUi'
import { SafetyGroupIconBadge } from './SafetyGroupIconBadge'
import { getEventSubjectType, getSubject, EVENT_SUBJECT_LABELS, getResponsiblePartyLabel } from '../utils/eventSubject'
import { resolveVehiclePlate } from '../utils/vehiclePlate'
import { displayUnknown } from '../utils/displayUnknown'
import { getEventAreaLabel, getEventSourceLabel } from '../utils/safetyCameraBridge'
import { getScenarioIcon } from '../data/safetyScenarioIcons'
import { isLiveSafetyRecord } from '../services/safetyAiEvents.service'

export function DetailRow({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-2 min-w-0', className)}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/55" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[8px] uppercase tracking-wide text-muted-foreground/65">{label}</p>
        <div className="text-[11px] text-foreground/95 mt-0.5 leading-snug">{children}</div>
      </div>
    </div>
  )
}

function StatusBadge({ record }: { record: SafetyViolationRecord }) {
  const statusDisplay = getAlertCardStatusDisplay(record)
  const StatusIcon = statusDisplay.icon
  if (!shouldShowAlertHandlingBadge(record)) return null

  if (isIconOnlyHandlingBadge(record)) {
    return (
      <TagTooltip content={statusDisplay.label} className="shrink-0">
        <span
          className={cn(
            'w-6 h-6 rounded border inline-flex items-center justify-center',
            statusDisplay.badgeClassName,
          )}
          aria-label={statusDisplay.label}
        >
          <StatusIcon className="w-3 h-3" aria-hidden />
        </span>
      </TagTooltip>
    )
  }

  return (
    <span className={cn(
      'text-[9px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1',
      statusDisplay.badgeClassName,
    )}>
      <StatusIcon className="w-3 h-3" aria-hidden />
      {statusDisplay.label}
    </span>
  )
}

export interface SafetyEventDetailContentProps {
  record: SafetyViolationRecord
  /** modal = snapshot + meta · playback = meta only (video ở tier Camera) */
  variant?: 'modal' | 'playback'
  className?: string
}

/** Nội dung chi tiết sự kiện ATLĐ — dùng chung popup & playback tier. */
export function SafetyEventDetailContent({
  record,
  variant = 'modal',
  className,
}: SafetyEventDetailContentProps) {
  const scenario = SAFETY_SCENARIO_MAP.get(record.scenarioId)
  const snapshotUrl = resolveViolationSnapshotUrl(record)
  const staticFallback = isLiveSafetyRecord(record) ? undefined : resolveStaticViolationSnapshotUrl(record)
  const SeverityIcon = SEVERITY_ICONS[record.severity]
  const GroupIcon = GROUP_ICONS[record.groupId]
  const ScenarioIcon = getScenarioIcon(record.scenarioId) ?? GroupIcon
  const scenarioTitle =
    (isLiveSafetyRecord(record) && record.description?.trim())
      ? record.description.trim()
      : getScenarioName(record.scenarioId)
  const extraNote = record.description?.trim()
  const showExtraNote = Boolean(
    extraNote
    && extraNote !== scenarioTitle
    && extraNote !== scenario?.description?.trim()
    && extraNote !== scenario?.name?.trim(),
  )
  const eventArea = displayUnknown(getEventAreaLabel(record.sourceDeviceId, record.sourceType, record.zoneId))
  const eventSource = displayUnknown(getEventSourceLabel(record.sourceDeviceId, record.sourceType))
  const subject = getSubject(record)
  const eventSubjectType = getEventSubjectType(record)
  const isVehicleEvent = eventSubjectType === 'VEHICLE'
  const vehiclePlate = resolveVehiclePlate(subject.vehiclePlate)
  const showSnapshot = variant === 'modal'

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      {showSnapshot && (
        <div className="relative aspect-[16/10] sm:aspect-[16/9] bg-black border-b border-[#1e2433] shrink-0">
          <RemoteViolationSnapshotImage
            src={snapshotUrl}
            fallbackSrc={staticFallback && staticFallback !== snapshotUrl ? staticFallback : undefined}
            alt={getScenarioName(record.scenarioId)}
            className="absolute inset-0 w-full h-full object-contain"
          />
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white/90 border border-white/10 font-mono">
              {record.scenarioId}
            </span>
          </div>
        </div>
      )}

      <div className={cn('px-3 sm:px-4 py-3 space-y-3', variant === 'playback' && 'pt-2.5')}>
        {variant === 'playback' && (
          <div className="flex items-start gap-2 min-w-0">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
              GROUP_BADGE[record.groupId],
            )}>
              <ScenarioIcon className={cn('w-3.5 h-3.5', GROUP_COLORS[record.groupId])} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-[#1a2235] text-muted-foreground border border-[#1e2433]">
                  {record.scenarioId}
                </span>
                <SafetyGroupIconBadge groupId={record.groupId} size="sm" showLabel />
              </div>
              <p className="text-[12px] font-semibold text-foreground leading-snug">{scenarioTitle}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {variant === 'modal' && <SafetyGroupIconBadge groupId={record.groupId} size="sm" showLabel />}
          <TagTooltip content={SEVERITY_LABELS_UI[record.severity]} className="shrink-0">
            <span
              className={cn(
                'w-6 h-6 rounded border inline-flex items-center justify-center',
                SEVERITY_BADGE[record.severity],
              )}
              aria-label={SEVERITY_LABELS_UI[record.severity]}
            >
              <SeverityIcon className="w-3 h-3" aria-hidden />
            </span>
          </TagTooltip>
          <StatusBadge record={record} />
          {variant === 'modal' && (
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[#1a2235] text-muted-foreground border border-[#1e2433] ml-auto">
              {record.scenarioId}
            </span>
          )}
        </div>

        {showExtraNote && (
          <p className="text-[11px] text-foreground/85 leading-relaxed border-l-2 border-[#2a3855] pl-2.5">
            {extraNote}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 pt-0.5">
          <DetailRow icon={Clock} label="Thời gian phát hiện">
            <span className="tabular-nums">{formatDateTime(record.detectedAt)}</span>
          </DetailRow>
          <DetailRow icon={MapPin} label="Khu vực">
            {eventArea}
          </DetailRow>
          <DetailRow icon={Camera} label="Nguồn giám sát">
            {eventSource}
          </DetailRow>
          {isVehicleEvent && (
            <DetailRow icon={Car} label="Biển số / phương tiện">
              <span className="font-mono font-semibold tracking-wide">{vehiclePlate}</span>
              <span className="block text-[10px] text-muted-foreground/70 mt-0.5">
                {displayUnknown(subject.vehicleType)}
              </span>
            </DetailRow>
          )}
          {eventSubjectType === 'PERSON' && (
            <>
              <DetailRow icon={User} label="Họ tên">
                {displayUnknown(subject.workerName)}
              </DetailRow>
              <DetailRow icon={User} label="Mã nhân sự">
                {displayUnknown(subject.employeeCode)}
              </DetailRow>
              <DetailRow icon={User} label="Nhà thầu">
                {getResponsiblePartyLabel(record)}
              </DetailRow>
            </>
          )}
          {(eventSubjectType === 'CONSTRUCTION_ACTIVITY'
            || eventSubjectType === 'MANAGEMENT'
            || eventSubjectType === 'SITE_CONDITION') && (
            <DetailRow icon={User} label="Đối tượng">
              {EVENT_SUBJECT_LABELS[eventSubjectType]}
            </DetailRow>
          )}
        </div>
      </div>
    </div>
  )
}
