import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Clock, Info, Loader2, Play, User } from 'lucide-react'
import { TagTooltip } from '@/components/common/IconTooltip/IconTooltip'
import { cn } from '@/utils/cn'
import { formatEventDateTime } from '@/utils/format'
import type { EventType, PatrolEvent } from '../data/patrolMockData'
import {
  PATROL_TYPE_META,
  getPatrolEventPlace,
  getPatrolEventStatusDisplay,
  shouldShowPatrolStatusBadge,
} from '../utils/patrolEventsUi'
import { isPatrolEvidenceEvent } from '../utils/patrolEventsFeed'
import { PatrolEventSnapshot } from './PatrolEventSnapshot'

interface PatrolEventsPanelProps {
  events: PatrolEvent[]
  selectedId?: string | null
  onSelect?: (event: PatrolEvent) => void
  onDetailClick?: (event: PatrolEvent) => void
  onPlayback?: (event: PatrolEvent) => void
}

/** Filter tabs per specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md §8.2 */
type PatrolFilterTab = 'all' | 'workforce' | 'identity' | 'density' | 'system'

const FILTER_TABS: { key: PatrolFilterTab; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'workforce', label: 'Nhân lực' },
  { key: 'identity', label: 'Định danh' },
  { key: 'density', label: 'Mật độ' },
  { key: 'system', label: 'Hệ thống' },
]

/**
 * Feed chỉ hiển thị sự kiện đã lọc evidence (snapshot + thời gian) ở Module05Page.
 */
function isMeaningfulFeedEvent(event: PatrolEvent): boolean {
  return isPatrolEvidenceEvent(event)
}

const INITIAL_COUNT = 6
const BATCH_SIZE = 4

function PatrolTypeBadge({ type, showLabel = true }: { type: EventType; showLabel?: boolean }) {
  const meta = PATROL_TYPE_META[type]
  const Icon = meta.icon

  return (
    <TagTooltip content={meta.tooltip} className="shrink-0">
      <span className={cn(
        'inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-[8px] font-semibold',
        meta.badge,
      )}>
        <Icon className={cn('w-2.5 h-2.5 shrink-0', meta.color)} aria-hidden />
        {showLabel && meta.label}
      </span>
    </TagTooltip>
  )
}

function StatusTag({
  label,
  badgeClassName,
  icon: StatusIcon,
  iconOnly = false,
}: {
  label: string
  badgeClassName: string
  icon: LucideIcon
  iconOnly?: boolean
}) {
  const badge = (
    <span
      className={cn(
        iconOnly
          ? 'w-5 h-5 rounded border inline-flex items-center justify-center'
          : 'text-[8px] px-1 py-0.5 rounded border inline-flex items-center gap-0.5 font-medium max-w-full',
        badgeClassName,
      )}
      aria-label={label}
    >
      <StatusIcon className="w-2.5 h-2.5 shrink-0" aria-hidden />
      {!iconOnly && <span className="truncate">{label}</span>}
    </span>
  )

  if (iconOnly) {
    return (
      <TagTooltip content={label} className="shrink-0">
        {badge}
      </TagTooltip>
    )
  }

  return badge
}

function PatrolEventCardActions({
  onPlayback,
  onDetailClick,
  event,
}: {
  onPlayback?: (event: PatrolEvent) => void
  onDetailClick?: (event: PatrolEvent) => void
  event: PatrolEvent
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {onDetailClick && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDetailClick(event)
          }}
          className="flex items-center justify-center rounded-md transition-colors border w-7 h-7 hover:bg-[#1e2433]/80 text-muted-foreground hover:text-foreground border-[#1e2433]/60"
          title="Chi tiết"
        >
          <Info className="w-3 h-3" />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onPlayback?.(event)
        }}
        className="flex items-center justify-center rounded-md transition-colors border w-7 h-7 hover:bg-[#1e2433]/80 text-muted-foreground hover:text-sky-400 border-[#1e2433]/60"
        title="Xem Playback"
      >
        <Play className="w-3 h-3" />
      </button>
    </div>
  )
}

function PatrolEventCard({
  event,
  selected,
  onSelect,
  onDetailClick,
  onPlayback,
}: {
  event: PatrolEvent
  selected?: boolean
  onSelect?: (event: PatrolEvent) => void
  onDetailClick?: (event: PatrolEvent) => void
  onPlayback?: (event: PatrolEvent) => void
}) {
  const typeMeta = PATROL_TYPE_META[event.type]
  const statusDisplay = getPatrolEventStatusDisplay(event.status)
  const eventDateTime = formatEventDateTime(event.lockedAt)
  const eventPlace = getPatrolEventPlace(event.cameraName, event.zoneName)

  return (
    <article
      role="button"
      tabIndex={0}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border border-l-[3px] bg-[#0a0e17]',
        'hover:border-[#2a3855] hover:bg-[#0c1019] transition-colors cursor-pointer',
        selected
          ? 'border-primary/50 ring-1 ring-primary/25 bg-[#0c1019]'
          : 'border-[#1e2433]',
        typeMeta.borderAccent,
      )}
      onClick={() => onSelect?.(event)}
      onKeyDown={e => e.key === 'Enter' && onSelect?.(event)}
    >
      <div className="flex gap-2 p-2 min-w-0 items-stretch">
        <PatrolEventSnapshot
          event={event}
          className="self-stretch w-[80px]"
          onClick={onDetailClick}
        />

        <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5 py-0.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-1 min-w-0">
              <PatrolTypeBadge type={event.type} />
              {shouldShowPatrolStatusBadge(event.status) && (
                <StatusTag
                  label={statusDisplay.label}
                  badgeClassName={statusDisplay.badgeClassName}
                  icon={statusDisplay.icon}
                  iconOnly
                />
              )}
            </div>
            <PatrolEventCardActions event={event} onDetailClick={onDetailClick} onPlayback={onPlayback} />
          </div>

          <h3 className="text-[11px] font-semibold text-foreground leading-snug line-clamp-2 pr-1">
            {event.violationLabel}
          </h3>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-2.5 h-2.5 shrink-0 text-muted-foreground/45" aria-hidden />
              <p className="text-[8px] min-w-0 truncate text-foreground/90 font-medium">
                {event.objectLabel}
              </p>
            </div>
            <div className="flex items-start gap-1.5 min-w-0">
              <Clock className="w-2.5 h-2.5 shrink-0 mt-px text-muted-foreground/45" aria-hidden />
              <p className="text-[8px] min-w-0 leading-snug">
                <span className="tabular-nums text-foreground/80">{eventDateTime}</span>
                <span className="text-muted-foreground/30 mx-1">·</span>
                <span className="text-foreground/70">{eventPlace}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function filterByTab(events: PatrolEvent[], tab: PatrolFilterTab): PatrolEvent[] {
  const feed = events.filter(isMeaningfulFeedEvent)
  switch (tab) {
    case 'workforce':
      return feed.filter(e =>
        e.type === 'POPULATION_OBSERVED'
        || e.type === 'POPULATION_CHANGE'
        || e.type === 'PERSON_DETECTED',
      )
    case 'identity':
      return feed.filter(e => e.type === 'IDENTITY_VERIFIED')
    case 'density':
      return feed.filter(e => e.type === 'HIGH_DENSITY')
    case 'system':
      return feed.filter(e => e.type === 'MACHINE_STOPPED')
    case 'all':
    default:
      return feed
  }
}

export function PatrolEventsPanel({
  events,
  selectedId,
  onSelect,
  onDetailClick,
  onPlayback,
}: PatrolEventsPanelProps) {
  const [filterTab, setFilterTab] = useState<PatrolFilterTab>('all')
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const activeItems = useMemo(() => filterByTab(events, filterTab), [events, filterTab])

  const tabCounts = useMemo(() => {
    const feed = events.filter(isMeaningfulFeedEvent)
    return {
      all: feed.length,
      workforce: feed.filter(e =>
        e.type === 'POPULATION_OBSERVED'
        || e.type === 'POPULATION_CHANGE'
        || e.type === 'PERSON_DETECTED',
      ).length,
      identity: feed.filter(e => e.type === 'IDENTITY_VERIFIED').length,
      density: feed.filter(e => e.type === 'HIGH_DENSITY').length,
      system: feed.filter(e => e.type === 'MACHINE_STOPPED').length,
    }
  }, [events])

  useEffect(() => {
    setVisibleCount(INITIAL_COUNT)
  }, [filterTab, activeItems.length])

  const visibleItems = useMemo(
    () => activeItems.slice(0, visibleCount),
    [activeItems, visibleCount],
  )
  const hasMore = visibleCount < activeItems.length

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loading) return
        setLoading(true)
        setTimeout(() => {
          setVisibleCount(c => c + BATCH_SIZE)
          setLoading(false)
        }, 350)
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex border-b border-[#1e2433] shrink-0 overflow-x-auto scrollbar-none overscroll-x-contain snap-x snap-mandatory">
        {FILTER_TABS.map(t => {
          const count = tabCounts[t.key]
          const active = filterTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilterTab(t.key)}
              className={cn(
                'px-2.5 sm:px-3 py-2 text-[9px] sm:text-[10px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px snap-start shrink-0',
                active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              <span className={cn(
                'ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tabular-nums',
                active ? 'bg-primary/20 text-primary' : 'bg-[#1a2235] text-muted-foreground',
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 sm:p-2">
        {events.filter(isMeaningfulFeedEvent).length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-8">
            Chưa có sự kiện có ảnh evidence — đang chờ backend ghi snapshot
          </p>
        ) : activeItems.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-8">
            {filterTab === 'workforce' || filterTab === 'identity' || filterTab === 'density'
              ? 'Chưa có sự kiện loại này'
              : 'Không có mục phù hợp bộ lọc'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {visibleItems.map(event => (
              <PatrolEventCard
                key={event.id}
                event={event}
                selected={selectedId === event.id}
                onSelect={onSelect}
                onDetailClick={onDetailClick}
                onPlayback={onPlayback}
              />
            ))}

            {hasMore && (
              <div ref={sentinelRef} className="flex items-center justify-center py-3">
                {loading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  : <div className="h-3.5" />}
              </div>
            )}

            {!hasMore && (
              <div className="flex items-center justify-center py-3">
                <span className="text-[9px] text-muted-foreground/35">
                  — {activeItems.length} sự kiện —
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
