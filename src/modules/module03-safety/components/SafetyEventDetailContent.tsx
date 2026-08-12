import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Building2,
  Camera,
  Car,
  Clock,
  MapPin,
  User,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/format'
import type { SafetyViolationRecord } from '../types/safety.types'
import { resolveStaticViolationSnapshotUrl, resolveViolationSnapshotUrl } from '../data/safetyViolationSnapshots'
import { RemoteViolationSnapshotImage } from './violations/RemoteViolationSnapshotImage'
import {
  GROUP_BADGE,
  GROUP_COLORS,
  GROUP_ICONS,
} from '../utils/safetyDashboardUi'
import { SafetyEventBadgeRow } from './SafetyEventBadgeRow'
import {
  getEventSubjectType,
  getSubject,
  getResponsiblePartyLabel,
  resolveEventScenarioTitle,
  shouldShowEventDescriptionNote,
  shouldShowSubjectDetailRow,
} from '../utils/eventSubject'
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
  const snapshotUrl = resolveViolationSnapshotUrl(record)
  const staticFallback = isLiveSafetyRecord(record) ? undefined : resolveStaticViolationSnapshotUrl(record)
  const GroupIcon = GROUP_ICONS[record.groupId]
  const ScenarioIcon = getScenarioIcon(record.scenarioId) ?? GroupIcon
  const scenarioTitle = resolveEventScenarioTitle(record)
  const showExtraNote = shouldShowEventDescriptionNote(record, scenarioTitle)
  const eventArea = displayUnknown(getEventAreaLabel(record.sourceDeviceId, record.sourceType, record.zoneId))
  const eventSource = displayUnknown(getEventSourceLabel(record.sourceDeviceId, record.sourceType))
  const subject = getSubject(record)
  const eventSubjectType = getEventSubjectType(record)
  const isVehicleEvent = eventSubjectType === 'VEHICLE'
  const isPersonEvent = eventSubjectType === 'PERSON'
  const vehiclePlate = resolveVehiclePlate(subject.vehiclePlate)
  const responsibleParty = getResponsiblePartyLabel(record)
  const showResponsibleParty = !isPersonEvent
    && !isVehicleEvent
    && responsibleParty !== '—'
  const showSnapshot = variant === 'modal'

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      {showSnapshot && (
        <div className="relative aspect-[16/10] sm:aspect-[16/9] bg-black border-b border-[#1e2433] shrink-0">
          <RemoteViolationSnapshotImage
            src={snapshotUrl}
            fallbackSrc={staticFallback && staticFallback !== snapshotUrl ? staticFallback : undefined}
            alt={scenarioTitle}
            className="absolute inset-0 w-full h-full object-contain"
          />
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
                <SafetyEventBadgeRow record={record} />
              </div>
              <p className="text-[12px] font-semibold text-foreground leading-snug">{scenarioTitle}</p>
            </div>
          </div>
        )}

        {showExtraNote && (
          <p className="text-[11px] text-foreground/85 leading-relaxed border-l-2 border-[#2a3855] pl-2.5">
            {record.description?.trim()}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 pt-0.5">
          <div className="space-y-2.5">
            <DetailRow icon={Clock} label="Thời gian phát hiện">
              <span className="tabular-nums">{formatDateTime(record.detectedAt)}</span>
            </DetailRow>
            <DetailRow icon={Camera} label="Nguồn giám sát">
              {eventSource}
            </DetailRow>
            <DetailRow icon={MapPin} label="Khu vực">
              {eventArea}
            </DetailRow>
          </div>

          <div className="space-y-2.5">
            {isVehicleEvent && (
              <DetailRow icon={Car} label="Biển số / phương tiện">
                <span className="font-mono font-semibold tracking-wide">{vehiclePlate}</span>
                <span className="block text-[10px] text-muted-foreground/70 mt-0.5">
                  {displayUnknown(subject.vehicleType)}
                </span>
              </DetailRow>
            )}
            {isPersonEvent && (
              <>
                <DetailRow icon={User} label="Mã nhân sự">
                  {displayUnknown(subject.employeeCode)}
                </DetailRow>
                <DetailRow icon={User} label="Họ tên">
                  {displayUnknown(subject.workerName)}
                </DetailRow>
                <DetailRow icon={Building2} label="Nhà thầu">
                  {responsibleParty}
                </DetailRow>
              </>
            )}
            {showResponsibleParty && (
              <DetailRow icon={Building2} label="Nhà thầu phụ trách">
                {responsibleParty}
              </DetailRow>
            )}
            {variant === 'playback'
              && (eventSubjectType === 'CONSTRUCTION_ACTIVITY'
                || eventSubjectType === 'MANAGEMENT'
                || eventSubjectType === 'SITE_CONDITION')
              && shouldShowSubjectDetailRow(record, scenarioTitle) && (
              <DetailRow icon={User} label="Đối tượng">
                {eventSubjectType === 'CONSTRUCTION_ACTIVITY'
                  ? displayUnknown(subject.workActivity ?? subject.workItem)
                  : eventSubjectType === 'MANAGEMENT'
                    ? displayUnknown(subject.managementUnit ?? subject.responsibleRole)
                    : displayUnknown(subject.workItem)}
              </DetailRow>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
