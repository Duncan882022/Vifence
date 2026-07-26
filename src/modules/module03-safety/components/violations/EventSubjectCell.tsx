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
  const type = getEventSubjectType(record)

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded border border-[#1e2433] bg-[#0a0e17]',
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
          {type === 'PERSON' ? 'Người' : type === 'VEHICLE' ? 'Xe' : type === 'SITE_CONDITION' ? 'Hiện trường' : type === 'CONSTRUCTION_ACTIVITY' ? 'Thi công' : 'Điều hành'}
        </span>
      </span>
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
