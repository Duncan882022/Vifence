import { Camera, ImageOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { PatrolEvent } from '../data/patrolMockData'

interface PatrolEventSnapshotProps {
  event: PatrolEvent
  /** thumb = thumbnail list (crop) · detail = popup (full frame) */
  variant?: 'thumb' | 'detail'
  className?: string
  onClick?: (event: PatrolEvent) => void
}

export function PatrolEventSnapshot({
  event,
  variant = 'thumb',
  className,
  onClick,
}: PatrolEventSnapshotProps) {
  const isDetail = variant === 'detail'

  const frameClass = cn(
    isDetail
      ? 'relative shrink-0 w-full bg-black rounded-lg border border-[#1e2433]'
      : 'relative shrink-0 w-[72px] min-h-[58px] overflow-hidden rounded-md border border-[#1e2433]/90 bg-black shadow-inner',
    className,
  )

  if (!event.snapshotUrl) {
    return null
  }

  const content = (
    <>
      <img
        src={event.snapshotUrl}
        alt={isDetail ? 'Ảnh evidence sự kiện' : ''}
        className={cn(
          isDetail
            ? 'block w-full h-auto max-h-[min(72dvh,920px)] object-contain mx-auto bg-black'
            : 'absolute inset-0 h-full w-full object-cover',
        )}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
          const fallback = e.currentTarget.nextElementSibling
          if (fallback instanceof HTMLElement) fallback.style.display = 'flex'
        }}
      />
      <div
        className={cn(
          'absolute inset-0 hidden flex-col items-center justify-center gap-0.5 bg-[#0a0e17] text-muted-foreground',
          isDetail && 'rounded-lg',
        )}
        aria-hidden
      >
        <ImageOff className={cn('opacity-50', isDetail ? 'w-8 h-8' : 'w-4 h-4')} />
        <span className={isDetail ? 'text-[10px]' : 'text-[6px]'}>Không tải được</span>
      </div>
      <span
        className={cn(
          'absolute font-mono text-white/55 px-0.5 bg-black/50 rounded',
          isDetail
            ? 'bottom-1.5 left-1.5 text-[9px] py-0.5 px-1'
            : 'bottom-0.5 left-0.5 text-[6px]',
        )}
      >
        {event.cameraId}
      </span>
      <Camera
        className={cn(
          'absolute text-white/35',
          isDetail ? 'top-1.5 right-1.5 w-3.5 h-3.5' : 'top-0.5 right-0.5 w-2.5 h-2.5',
        )}
        aria-hidden
      />
    </>
  )

  if (!onClick) {
    return (
      <div className={frameClass}>
        {content}
        {isDetail && (
          <a
            href={event.snapshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex text-[9px] text-sky-400/90 hover:text-sky-300 underline-offset-2 hover:underline px-1"
          >
            Xem ảnh gốc
          </a>
        )}
      </div>
    )
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
