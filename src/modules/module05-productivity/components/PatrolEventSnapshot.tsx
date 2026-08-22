import { Camera } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { PatrolEvent } from '../data/patrolMockData'
import { PATROL_TYPE_META } from '../utils/patrolEventsUi'

interface PatrolEventSnapshotProps {
  event: PatrolEvent
  className?: string
  onClick?: (event: PatrolEvent) => void
}

export function PatrolEventSnapshot({ event, className, onClick }: PatrolEventSnapshotProps) {
  const meta = PATROL_TYPE_META[event.type]
  const Icon = meta.icon
  const frameClass = cn(
    'relative shrink-0 w-[68px] min-h-[58px] overflow-hidden rounded-md border border-[#1e2433]/90 bg-black shadow-inner',
    className,
  )

  const placeholder = (
    <>
      <div className={cn(
        'absolute inset-0 opacity-90',
        event.type === 'PPE_VIOLATION'
          ? 'bg-gradient-to-br from-red-950/80 via-[#0a0e17] to-[#060b14]'
          : event.type === 'PERSON_DETECTED'
            ? 'bg-gradient-to-br from-sky-950/70 via-[#0a0e17] to-[#060b14]'
            : 'bg-gradient-to-br from-amber-950/70 via-[#0a0e17] to-[#060b14]',
      )} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-1">
        <Icon className={cn('w-4 h-4', meta.color)} aria-hidden />
        <Camera className="w-2.5 h-2.5 text-white/35" aria-hidden />
      </div>
    </>
  )

  const content = (
    <>
      {event.snapshotUrl ? (
        <img
          src={event.snapshotUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          loading="lazy"
        />
      ) : placeholder}
      <span className="absolute bottom-0.5 left-0.5 text-[6px] font-mono text-white/45 px-0.5 bg-black/40 rounded">
        {event.cameraId}
      </span>
    </>
  )

  if (!onClick) {
    return <div className={frameClass}>{content}</div>
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick(event)
      }}
      className={cn(
        frameClass,
        'hover:border-primary/40 hover:ring-1 hover:ring-primary/25 transition-colors cursor-zoom-in',
      )}
      title="Xem chi tiết sự kiện"
    >
      {content}
    </button>
  )
}
