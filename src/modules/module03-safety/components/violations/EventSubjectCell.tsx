import { cn } from '@/utils/cn'
import type { SafetyViolationRecord } from '../../types/safety.types'
import { getEventSubjectType, getSubject, EVENT_SUBJECT_LABELS } from '../../utils/eventSubject'
import { resolveViolationSnapshotUrl } from '../../data/safetyViolationSnapshots'

interface EventSubjectCellProps {
  record: SafetyViolationRecord
  compact?: boolean
  showCaption?: boolean
}

function subjectCaption(record: SafetyViolationRecord): string {
  const type = getEventSubjectType(record)
  const s = getSubject(record)

  switch (type) {
    case 'PERSON':
      return [s.workerName, s.employeeCode, s.contractorName].filter(Boolean).join(' · ')
    case 'VEHICLE':
      return [s.vehiclePlate, s.vehicleType, s.driverName].filter(Boolean).join(' · ')
    case 'SITE_CONDITION':
      return [s.block, s.floor, s.workItem].filter(Boolean).join(' · ')
    case 'CONSTRUCTION_ACTIVITY':
      return [s.workActivity, s.constructionUnit].filter(Boolean).join(' · ')
    case 'MANAGEMENT':
      return [s.managementUnit, s.responsibleRole].filter(Boolean).join(' · ')
    default:
      return EVENT_SUBJECT_LABELS[type] ?? '—'
  }
}

function subjectTitle(record: SafetyViolationRecord): string {
  const type = getEventSubjectType(record)
  const s = getSubject(record)

  switch (type) {
    case 'PERSON':
      return s.workerName ?? EVENT_SUBJECT_LABELS.PERSON
    case 'VEHICLE':
      return s.vehiclePlate ?? EVENT_SUBJECT_LABELS.VEHICLE
    case 'SITE_CONDITION':
      return EVENT_SUBJECT_LABELS.SITE_CONDITION
    case 'CONSTRUCTION_ACTIVITY':
      return s.workActivity ?? EVENT_SUBJECT_LABELS.CONSTRUCTION_ACTIVITY
    case 'MANAGEMENT':
      return s.managementUnit ?? s.responsibleRole ?? 'Ban điều hành'
    default:
      return EVENT_SUBJECT_LABELS[type] ?? 'Sự kiện'
  }
}

function subjectTypeLabel(record: SafetyViolationRecord): string {
  const type = getEventSubjectType(record)
  switch (type) {
    case 'PERSON':
      return 'Người'
    case 'VEHICLE':
      return 'Xe'
    case 'SITE_CONDITION':
      return 'Hiện trường'
    case 'CONSTRUCTION_ACTIVITY':
      return 'Thi công'
    case 'MANAGEMENT':
      return 'Điều hành'
    default:
      return 'Sự kiện'
  }
}

/** Snapshot nhỏ — bảng / listing chung */
export function ViolationSnapshotThumb({
  record,
  compact,
  className,
}: {
  record: SafetyViolationRecord
  compact?: boolean
  className?: string
}) {
  const snapshotUrl = resolveViolationSnapshotUrl(record)

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-md border border-[#1e2433] bg-[#0a0e17]',
        compact ? 'w-[72px] h-[44px]' : 'w-[88px] h-[52px]',
        className,
      )}
    >
      <img
        src={snapshotUrl}
        alt={`Snapshot vi phạm ${record.id}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5">
        <span className="text-[6px] font-bold uppercase tracking-wider text-white/90 truncate block">
          {subjectTypeLabel(record)}
        </span>
      </span>
    </div>
  )
}

/** Snapshot thẻ Sự kiện — mã SV, loại đối tượng, độ tin cậy overlay */
export function AlertEventSnapshot({
  record,
  confidencePct,
  className,
}: {
  record: SafetyViolationRecord
  confidencePct?: number
  className?: string
}) {
  const snapshotUrl = resolveViolationSnapshotUrl(record)
  const subjectLabel = subjectTypeLabel(record)

  return (
    <div
      className={cn(
        'relative shrink-0 w-[80px] min-h-[76px] overflow-hidden rounded-lg border border-[#1e2433]/90 bg-black shadow-inner',
        className,
      )}
    >
      <img
        src={snapshotUrl}
        alt={`Snapshot vi phạm ${record.id}`}
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 bg-gradient-to-b from-black/75 via-black/35 to-transparent px-1 pt-1 pb-3">
        <span className="text-[6px] font-mono font-medium text-white/75 tracking-tight truncate max-w-[52%]">
          {record.id}
        </span>
        {confidencePct != null && (
          <span
            className="shrink-0 rounded px-1 py-px bg-black/50 backdrop-blur-[1px] border border-white/10"
            title={`Độ tin cậy ${confidencePct}%`}
          >
            <span className="block text-[5px] leading-none text-white/55 text-center">ĐT</span>
            <span className="block text-[7px] font-bold tabular-nums leading-none text-white/95 text-center">
              {confidencePct}%
            </span>
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-1.5 pt-3 pb-1">
        <span className="text-[6px] font-bold uppercase tracking-wider text-white/90">
          {subjectLabel}
        </span>
      </div>
    </div>
  )
}

export function EventSubjectCell({ record, compact, showCaption = true }: EventSubjectCellProps) {
  const caption = subjectCaption(record)
  const title = subjectTitle(record)

  return (
    <div className="flex items-start gap-2 min-w-0">
      <ViolationSnapshotThumb record={record} compact={compact} />
      {showCaption && (
        <div className="min-w-0 flex-1 pt-0.5">
          <p className={cn(
            'font-semibold text-foreground truncate leading-tight',
            compact ? 'text-[9px]' : 'text-[10px]',
          )}>
            {title}
          </p>
          {caption && caption !== title && (
            <p className="text-[8px] text-muted-foreground truncate leading-snug mt-0.5">{caption}</p>
          )}
        </div>
      )}
    </div>
  )
}
