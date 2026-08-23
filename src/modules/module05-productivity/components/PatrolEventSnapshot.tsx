import { Camera, ImageOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { PatrolEvent } from '../data/patrolMockData'

interface PatrolEventSnapshotProps {
  event: PatrolEvent
  className?: string
  onClick?: (event: PatrolEvent) => void
}

export function PatrolEventSnapshot({ event, className, onClick }: PatrolEventSnapshotProps) {
  const frameClass = cn(
    'relative shrink-0 w-[72px] min-h-[58px] overflow-hidden rounded-md border border-[#1e2433]/90 bg-black shadow-inner',
    className,
  )

  if (!event.snapshotUrl) {
    return null
  }

  const content = (
    <>
      <img
        src={event.snapshotUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
          const fallback = e.currentTarget.nextElementSibling
          if (fallback instanceof HTMLElement) fallback.style.display = 'flex'
        }}
      />
      <div
        className="absolute inset-0 hidden flex-col items-center justify-center gap-0.5 bg-[#0a0e17] text-muted-foreground"
        aria-hidden
      >
        <ImageOff className="w-4 h-4 opacity-50" />
        <span className="text-[6px]">Không tải được</span>
      </div>
      <span className="absolute bottom-0.5 left-0.5 text-[6px] font-mono text-white/55 px-0.5 bg-black/50 rounded">
        {event.cameraId}
      </span>
      <Camera className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-white/35" aria-hidden />
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
      title="Xem ảnh evidence"
    >
      {content}
    </button>
  )
}
