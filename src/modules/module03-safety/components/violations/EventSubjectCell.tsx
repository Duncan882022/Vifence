import { cn } from '@/utils/cn'
import type { SafetyViolationRecord } from '../../types/safety.types'
import { getEventSubjectType, getSubject, EVENT_SUBJECT_LABELS } from '../../utils/eventSubject'
import { resolveStaticViolationSnapshotUrl, resolveViolationSnapshotUrl } from '../../data/safetyViolationSnapshots'
import { displayUnknown, joinDisplayUnknown } from '../../utils/displayUnknown'
import { resolveVehiclePlate } from '../../utils/vehiclePlate'
import { RemoteViolationSnapshotImage } from './RemoteViolationSnapshotImage'

interface EventSubjectCellProps {
  record: SafetyViolationRecord
  compact?: boolean
  showCaption?: boolean
  onSnapshotClick?: (record: SafetyViolationRecord) => void
}

function subjectCaption(record: SafetyViolationRecord): string {
  const type = getEventSubjectType(record)
  const s = getSubject(record)

  switch (type) {
    case 'PERSON':
      return joinDisplayUnknown([s.workerName, s.employeeCode, s.contractorName])
    case 'VEHICLE':
      return joinDisplayUnknown([s.vehiclePlate, s.vehicleType, s.driverName])
    case 'SITE_CONDITION':
      return joinDisplayUnknown([s.block, s.floor, s.workItem])
    case 'CONSTRUCTION_ACTIVITY':
      return joinDisplayUnknown([s.workActivity, s.constructionUnit])
    case 'MANAGEMENT':
      return joinDisplayUnknown([s.managementUnit, s.responsibleRole])
    default:
      return displayUnknown(EVENT_SUBJECT_LABELS[type])
  }
}

function subjectTitle(record: SafetyViolationRecord): string {
  const type = getEventSubjectType(record)
  const s = getSubject(record)

  switch (type) {
    case 'PERSON':
      return displayUnknown(s.workerName)
    case 'VEHICLE':
      return resolveVehiclePlate(s.vehiclePlate)
    case 'SITE_CONDITION':
      return EVENT_SUBJECT_LABELS.SITE_CONDITION
    case 'CONSTRUCTION_ACTIVITY':
      return displayUnknown(s.workActivity ?? s.workItem)
    case 'MANAGEMENT':
      return displayUnknown(s.managementUnit ?? s.responsibleRole)
    default:
      return displayUnknown(EVENT_SUBJECT_LABELS[type])
  }
}

/** Snapshot nhỏ — bảng / listing chung */
export function ViolationSnapshotThumb({
  record,
  compact,
  className,
  onClick,
}: {
  record: SafetyViolationRecord
  compact?: boolean
  className?: string
  onClick?: (record: SafetyViolationRecord) => void
}) {
  const snapshotUrl = resolveViolationSnapshotUrl(record)
  const fallbackUrl = resolveStaticViolationSnapshotUrl(record)
  const frameClass = cn(
    'relative shrink-0 overflow-hidden rounded-md border border-[#1e2433] bg-[#0a0e17]',
    compact ? 'w-[72px] h-[44px]' : 'w-[88px] h-[52px]',
    className,
  )
  const image = (
    <RemoteViolationSnapshotImage
      src={snapshotUrl}
      fallbackSrc={fallbackUrl !== snapshotUrl ? fallbackUrl : undefined}
      alt=""
      className="w-full h-full object-cover"
    />
  )

  if (!onClick) {
    return <div className={frameClass}>{image}</div>
  }

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        onClick(record)
      }}
      className={cn(
        frameClass,
        'hover:border-primary/40 hover:ring-1 hover:ring-primary/25 transition-colors cursor-zoom-in',
      )}
      title="Xem chi tiết sự kiện"
    >
      {image}
    </button>
  )
}

/** Snapshot thẻ Sự kiện — chỉ ảnh, không overlay */
export function AlertEventSnapshot({
  record,
  className,
  onClick,
}: {
  record: SafetyViolationRecord
  className?: string
  onClick?: (record: SafetyViolationRecord) => void
}) {
  const snapshotUrl = resolveViolationSnapshotUrl(record)
  const fallbackUrl = resolveStaticViolationSnapshotUrl(record)
  const frameClass = cn(
    'relative shrink-0 w-[68px] min-h-[58px] overflow-hidden rounded-md border border-[#1e2433]/90 bg-black shadow-inner',
    className,
  )
  const image = (
    <RemoteViolationSnapshotImage
      src={snapshotUrl}
      fallbackSrc={fallbackUrl !== snapshotUrl ? fallbackUrl : undefined}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
    />
  )

  if (!onClick) {
    return <div className={frameClass}>{image}</div>
  }

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        onClick(record)
      }}
      className={cn(
        frameClass,
        'hover:border-primary/40 hover:ring-1 hover:ring-primary/25 transition-colors cursor-zoom-in',
      )}
      title="Xem chi tiết sự kiện"
    >
      {image}
    </button>
  )
}

export function EventSubjectCell({ record, compact, showCaption = true, onSnapshotClick }: EventSubjectCellProps) {
  const caption = subjectCaption(record)
  const title = subjectTitle(record)

  return (
    <div className="flex items-start gap-2 min-w-0">
      <ViolationSnapshotThumb record={record} compact={compact} onClick={onSnapshotClick} />
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
