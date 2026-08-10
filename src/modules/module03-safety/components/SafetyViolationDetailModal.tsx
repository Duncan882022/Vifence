import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Camera,
  Car,
  Clock,
  MapPin,
  Play,
  User,
  X,
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

interface SafetyViolationDetailModalProps {
  record: SafetyViolationRecord | null
  onClose: () => void
  onPlayback?: (record: SafetyViolationRecord) => void
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/60" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
        <div className="text-[11px] text-foreground/95 mt-0.5">{children}</div>
      </div>
    </div>
  )
}

/** Popup chi tiết vi phạm — mở khi bấm snapshot trong bảng / thẻ sự kiện. */
export function SafetyViolationDetailModal({
  record,
  onClose,
  onPlayback,
}: SafetyViolationDetailModalProps) {
  useEffect(() => {
    if (!record) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [record, onClose])

  if (!record) return null

  const scenario = SAFETY_SCENARIO_MAP.get(record.scenarioId)
  const snapshotUrl = resolveViolationSnapshotUrl(record)
  const staticFallback = isLiveSafetyRecord(record) ? undefined : resolveStaticViolationSnapshotUrl(record)
  const statusDisplay = getAlertCardStatusDisplay(record)
  const StatusIcon = statusDisplay.icon
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

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex flex-col overflow-hidden w-full max-w-md sm:max-w-2xl max-h-[90vh] rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-violation-detail-title"
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border',
              GROUP_BADGE[record.groupId],
            )}>
              <ScenarioIcon className={cn('w-4 h-4', GROUP_COLORS[record.groupId])} aria-hidden />
            </div>
            <div className="min-w-0">
              <p id="safety-violation-detail-title" className="text-sm font-semibold text-foreground leading-snug">
                {scenarioTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#1e2433] text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="relative aspect-[16/10] sm:aspect-[16/9] bg-black border-b border-[#1e2433]">
            <RemoteViolationSnapshotImage
              src={snapshotUrl}
              fallbackSrc={staticFallback && staticFallback !== snapshotUrl ? staticFallback : undefined}
              alt={getScenarioName(record.scenarioId)}
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <SafetyGroupIconBadge groupId={record.groupId} size="sm" showLabel />
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
              {shouldShowAlertHandlingBadge(record) && (
                isIconOnlyHandlingBadge(record) ? (
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
                ) : (
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1', statusDisplay.badgeClassName)}>
                    <StatusIcon className="w-3 h-3" aria-hidden />
                    {statusDisplay.label}
                  </span>
                )
              )}
            </div>

            {showExtraNote && (
              <p className="text-[11px] text-foreground/90 leading-relaxed">{extraNote}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {shouldShowAlertHandlingBadge(record) && (
                <DetailRow icon={StatusIcon} label="Trạng thái xử lý">
                  {isIconOnlyHandlingBadge(record) ? (
                    <TagTooltip content={statusDisplay.label} className="inline-flex">
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
                  ) : (
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 w-fit', statusDisplay.badgeClassName)}>
                      <StatusIcon className="w-3 h-3" aria-hidden />
                      {statusDisplay.label}
                    </span>
                  )}
                </DetailRow>
              )}
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
                <DetailRow icon={Car} label="Phương tiện">
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
                || eventSubjectType === 'MANAGEMENT') && (
                <DetailRow icon={User} label="Đối tượng">
                  {EVENT_SUBJECT_LABELS[eventSubjectType]}
                </DetailRow>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-4 py-3 border-t border-[#1e2433] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-3 py-2 rounded-lg text-[11px] font-medium border border-[#1e2433] text-muted-foreground hover:text-foreground hover:border-[#2a3855] transition-colors"
          >
            Đóng
          </button>
          {onPlayback && (
            <button
              type="button"
              onClick={() => {
                onPlayback(record)
                onClose()
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              Xem lại
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
