import { useEffect, useState } from 'react'
import { Camera, ImageOff, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { isPortraitPatrolCameraId } from '@/modules/module02-training/data/trainingCameraFeeds'
import type { PatrolEvent } from '../data/patrolTypes'

interface PatrolEventSnapshotProps {
  event: PatrolEvent
  /** Override ảnh chính — ví dụ khi chọn lượt trong lịch sử xuất hiện. */
  snapshotUrl?: string | null
  /** thumb = thumbnail list (crop) · detail = popup (full frame) */
  variant?: 'thumb' | 'detail'
  className?: string
  onClick?: (event: PatrolEvent) => void
}

/** Prefetch snapshot — gọi trước khi mở popup để ảnh lên ngay từ cache. */
export function preloadPatrolEventSnapshot(url?: string | null): void {
  const src = url?.trim()
  if (!src) return
  const img = new Image()
  img.decoding = 'async'
  img.src = src
}

export function PatrolEventSnapshot({
  event,
  snapshotUrl: snapshotUrlOverride,
  variant = 'thumb',
  className,
  onClick,
}: PatrolEventSnapshotProps) {
  const isDetail = variant === 'detail'
  const displayUrl = (snapshotUrlOverride ?? event.snapshotUrl)?.trim()
  const portraitEvidence = isDetail && isPortraitPatrolCameraId(event.cameraId)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
  }, [displayUrl])

  const frameClass = cn(
    isDetail
      ? cn(
        'relative shrink-0 w-full bg-black rounded-lg border border-[#1e2433]',
        portraitEvidence
          ? 'mx-auto max-w-[min(96vw,calc(85dvh*9/16))] aspect-[9/16]'
          : 'min-h-[120px]',
      )
      : 'relative shrink-0 w-[72px] min-h-[58px] overflow-hidden rounded-md border border-[#1e2433]/90 bg-black shadow-inner',
    className,
  )

  if (!displayUrl) {
    return null
  }

  const content = (
    <>
      {!loaded && !failed && (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-[#0a0e17]',
            isDetail && 'rounded-lg',
          )}
          aria-hidden
        >
          <Loader2 className={cn('animate-spin text-muted-foreground/50', isDetail ? 'w-6 h-6' : 'w-3.5 h-3.5')} />
        </div>
      )}
      <img
        src={displayUrl}
        alt={isDetail ? 'Ảnh evidence sự kiện' : ''}
        className={cn(
          isDetail
            ? cn(
              'block w-full h-full object-contain mx-auto bg-black',
              portraitEvidence
                ? 'max-h-[85dvh]'
                : 'h-auto max-h-[min(48dvh,420px)]',
            )
            : 'absolute inset-0 h-full w-full object-cover',
          !loaded && !failed && 'opacity-0',
        )}
        loading={isDetail ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={isDetail ? 'high' : 'auto'}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true)
          setLoaded(true)
        }}
      />
      {failed && (
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-[#0a0e17] text-muted-foreground',
            isDetail && 'rounded-lg',
          )}
          aria-hidden
        >
          <ImageOff className={cn('opacity-50', isDetail ? 'w-8 h-8' : 'w-4 h-4')} />
          <span className={isDetail ? 'text-[10px]' : 'text-[6px]'}>Không tải được</span>
        </div>
      )}
      {loaded && !failed && (
        <>
          {!isDetail && (
            <>
              <span className="absolute bottom-0.5 left-0.5 font-mono text-[6px] text-white/55 px-0.5 bg-black/50 rounded">
                {event.cameraId || '—'}
              </span>
              <Camera className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-white/35" aria-hidden />
            </>
          )}
        </>
      )}
    </>
  )

  if (!onClick) {
    return (
      <div className={frameClass}>
        {content}
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
