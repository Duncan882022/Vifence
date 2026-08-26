import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Clock, Info, Loader2, Play } from 'lucide-react'
import { TagTooltip } from '@/components/common/IconTooltip/IconTooltip'
import { cn } from '@/utils/cn'
import { formatEventDateTime } from '@/utils/format'
import type { PatrolEvent } from '../data/patrolMockData'
import {
  getPatrolEventPlace,
  getPatrolEventStatusDisplay,
  shouldShowPatrolStatusBadge,
} from '../utils/patrolEventsUi'
import { isPatrolPersonLifecycleWithSnapshot } from '../utils/patrolEventsFeed'
import {
  PATROL_EVENTS_TAB_META,
  countUniquePatrolTabEntities,
  dedupePatrolEventsByMasterEntity,
  resolvePatrolEventDisplayMeta,
  resolvePatrolPersonStage,
} from '../utils/patrolWorkforceEventLabels'
import { resolvePatrolPersonCardDisplay } from '../utils/patrolManualIdentityUi'
import { PatrolEventSnapshot, preloadPatrolEventSnapshot } from './PatrolEventSnapshot'

interface PatrolEventsPanelProps {
  events: PatrolEvent[]
  selectedId?: string | null
  onSelect?: (event: PatrolEvent) => void
  onDetailClick?: (event: PatrolEvent) => void
  onPlayback?: (event: PatrolEvent) => void
}

type PatrolFilterTab = 'all' | 'object' | 'person' | 'identity'

const FILTER_TABS: { key: PatrolFilterTab; label: string; icon: LucideIcon; color: string; inactiveColor: string }[] = [
  { key: 'all', ...PATROL_EVENTS_TAB_META.all },
  { key: 'object', ...PATROL_EVENTS_TAB_META.object },
  { key: 'person', ...PATROL_EVENTS_TAB_META.person },
  { key: 'identity', ...PATROL_EVENTS_TAB_META.identity },
]

function isPersonEvent(event: PatrolEvent): boolean {
  return event.type === 'PERSON_DETECTED'
}

function filterByTab(events: PatrolEvent[], tab: PatrolFilterTab): PatrolEvent[] {
  const feed = dedupePatrolEventsByMasterEntity(
    events.filter(isPatrolPersonLifecycleWithSnapshot),
  )
  switch (tab) {
    case 'object':
      return feed.filter(e => isPersonEvent(e) && resolvePatrolPersonStage(e) === 'object')
    case 'person':
      return feed.filter(e => isPersonEvent(e) && resolvePatrolPersonStage(e) === 'person')
    case 'identity':
      return feed.filter(e => isPersonEvent(e) && resolvePatrolPersonStage(e) === 'profile')
    case 'all':
    default:
      return feed
  }
}

const INITIAL_COUNT = 6
const BATCH_SIZE = 4

function PatrolStageBadge({ event }: { event: PatrolEvent }) {
  const meta = resolvePatrolEventDisplayMeta(event)
  const Icon = meta.icon

  return (
    <TagTooltip content={meta.tooltip} className="shrink-0">
      <span className={cn(
        'inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-[8px] font-semibold',
        meta.badge,
      )}>
        <Icon className={cn('w-2.5 h-2.5 shrink-0', meta.color)} aria-hidden />
        {meta.label}
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
          onMouseEnter={() => preloadPatrolEventSnapshot(event.snapshotUrl)}
          onFocus={() => preloadPatrolEventSnapshot(event.snapshotUrl)}
          onClick={(e) => {
            e.stopPropagation()
            preloadPatrolEventSnapshot(event.snapshotUrl)
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
  const displayMeta = resolvePatrolEventDisplayMeta(event)
  const SubjectIcon = displayMeta.icon
  const statusDisplay = getPatrolEventStatusDisplay(event.status)
  const eventDateTime = formatEventDateTime(event.lockedAt)
  const eventPlace = getPatrolEventPlace(event.cameraName, event.zoneName)
  const stage = resolvePatrolPersonStage(event)
  const cardDisplay = resolvePatrolPersonCardDisplay(event)
  const usePersonCard = stage === 'person' || stage === 'profile'
  const cardTitle = usePersonCard ? cardDisplay.title : event.violationLabel
  const cardSubtitle = usePersonCard ? cardDisplay.subtitle : event.objectLabel
  const cardUnit = usePersonCard && cardDisplay.unit ? cardDisplay.unit : null

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
        displayMeta.borderAccent,
      )}
      onClick={() => onSelect?.(event)}
      onKeyDown={e => e.key === 'Enter' && onSelect?.(event)}
    >
      <div className="flex gap-2 p-2 min-w-0 items-stretch">
        <PatrolEventSnapshot
          event={event}
          className="self-stretch w-[80px]"
          onClick={onDetailClick
            ? (ev) => {
              preloadPatrolEventSnapshot(ev.snapshotUrl)
              onDetailClick(ev)
            }
            : undefined}
        />

        <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5 py-0.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-1 min-w-0">
              <PatrolStageBadge event={event} />
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
            {cardTitle}
          </h3>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <SubjectIcon className={cn('w-2.5 h-2.5 shrink-0', displayMeta.color)} aria-hidden />
              <p className="text-[8px] min-w-0 truncate text-foreground/90 font-medium">
                {cardSubtitle}
              </p>
            </div>
            {cardUnit && (
              <p className="text-[8px] min-w-0 truncate text-muted-foreground pl-4">
                {cardUnit}
              </p>
            )}
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
    const feed = events.filter(isPatrolPersonLifecycleWithSnapshot)
    return {
      all: countUniquePatrolTabEntities(feed, 'all'),
      object: countUniquePatrolTabEntities(feed, 'object'),
      person: countUniquePatrolTabEntities(feed, 'person'),
      identity: countUniquePatrolTabEntities(feed, 'identity'),
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
        }, 300)
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
          const TabIcon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilterTab(t.key)}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 sm:px-3 py-2 text-[9px] sm:text-[10px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px snap-start shrink-0',
                active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <TabIcon
                className={cn('w-3.5 h-3.5 shrink-0', active ? t.color : t.inactiveColor)}
                aria-hidden
              />
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
        {events.filter(isPatrolPersonLifecycleWithSnapshot).length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-8">
            Chưa có sự kiện — đang chờ backend / workforce engine
          </p>
        ) : activeItems.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-8">
            Chưa có sự kiện loại này
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
                  — {tabCounts[filterTab]} entity —
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
