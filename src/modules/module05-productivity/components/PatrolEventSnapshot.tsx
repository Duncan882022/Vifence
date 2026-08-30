import { useEffect, useState } from 'react'
import { Camera, ImageOff, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
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
  const [renderUrl, setRenderUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!displayUrl) {
      setRenderUrl(null)
      setLoading(false)
      setFailed(false)
      return
    }

    setLoading(true)
    setFailed(false)
    setRenderUrl(null)

    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled) return
      setRenderUrl(displayUrl)
      setLoading(false)
    }
    img.onerror = () => {
      if (cancelled) return
      setRenderUrl(null)
      setFailed(true)
      setLoading(false)
    }
    img.src = displayUrl

    return () => {
      cancelled = true
      img.onload = null
      img.onerror = null
    }
  }, [displayUrl])

  const frameClass = cn(
    isDetail
      ? 'relative shrink-0 w-full overflow-hidden bg-black rounded-lg border border-[#1e2433] aspect-video max-h-[min(36dvh,280px)]'
      : 'relative shrink-0 w-[72px] min-h-[58px] overflow-hidden rounded-md border border-[#1e2433]/90 bg-black shadow-inner',
    className,
  )

  if (!displayUrl) {
    return (
      <div className={frameClass} aria-hidden>
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-[#0a0e17] text-muted-foreground',
            isDetail && 'rounded-lg',
          )}
        >
          <Camera className={cn('opacity-40', isDetail ? 'w-8 h-8' : 'w-4 h-4')} />
          <span className={isDetail ? 'text-[10px] opacity-60' : 'text-[6px] opacity-60'}>
            Chờ ảnh
          </span>
        </div>
      </div>
    )
  }

  const content = (
    <>
      {loading && !failed && (
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
      {renderUrl === displayUrl && (
        <img
          key={displayUrl}
          src={displayUrl}
          alt={isDetail ? 'Ảnh evidence sự kiện' : ''}
          className={cn(
            isDetail
              ? 'block w-full h-full object-contain mx-auto bg-black'
              : 'absolute inset-0 h-full w-full object-cover',
          )}
          loading={isDetail ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={isDetail ? 'high' : 'auto'}
        />
      )}
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
      {renderUrl === displayUrl && !failed && (
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
