import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowUp, Clock, History, Loader2, MapPin, Search } from 'lucide-react'
import { PlaybackDatePicker } from '@/components/common/CameraPlayback/PlaybackDatePicker'
import { TagTooltip } from '@/components/common/IconTooltip/IconTooltip'
import { cn } from '@/utils/cn'
import { formatEventDateTime } from '@/utils/format'
import type { PatrolEvent } from '../data/patrolTypes'
import { getPatrolEventLocationLabel } from '../utils/patrolEventsUi'
import {
  PATROL_EVENTS_TAB_META,
  resolvePatrolEventDisplayMeta,
  resolvePatrolPersonStage,
} from '../utils/patrolWorkforceEventLabels'
import { listPatrolEventsForTab, type PatrolTabCounts } from '../utils/patrolEventsTabList'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'
import { resolvePatrolPersonCardDisplay } from '../utils/patrolManualIdentityUi'
import { resolvePatrolPromotedMarker } from '../utils/patrolPromotedMarker'
import {
  buildPatrolSubjectAppearanceCountLookup,
  resolvePatrolEventAppearanceHistoryCount,
} from '../utils/patrolSubjectAppearanceCount'
import { PatrolEventSnapshot, preloadPatrolEventSnapshot } from './PatrolEventSnapshot'

interface PatrolEventsPanelProps {
  events: PatrolEvent[]
  presences?: PatrolDayPresence[]
  tabCounts?: PatrolTabCounts
  viewDate: string
  onViewDateChange: (date: string) => void
  maxViewDate: string
  minViewDate?: string
  selectedId?: string | null
  onSelect?: (event: PatrolEvent) => void
  onDetailClick?: (event: PatrolEvent) => void
}

type PatrolFilterTab = 'all' | 'object' | 'person' | 'identity'

const FILTER_TABS: {
  key: PatrolFilterTab
  label: string
  icon: LucideIcon
  color: string
  inactiveColor: string
  activeBorder: string
  activeText: string
  activeBadge: string
  countTooltip: string
}[] = [
  { key: 'all', ...PATROL_EVENTS_TAB_META.all },
  { key: 'object', ...PATROL_EVENTS_TAB_META.object },
  { key: 'person', ...PATROL_EVENTS_TAB_META.person },
  { key: 'identity', ...PATROL_EVENTS_TAB_META.identity },
]

/** Icon meta card — tên / giờ / địa điểm: cùng xám, cùng kích cỡ. */
const EVENT_CARD_META_ICON = 'w-2.5 h-2.5 shrink-0 text-muted-foreground/45'

function filterByTab(events: PatrolEvent[], tab: PatrolFilterTab): PatrolEvent[] {
  return listPatrolEventsForTab(events, tab)
}

function eventSearchHaystack(event: PatrolEvent): string {
  const card = resolvePatrolPersonCardDisplay(event)
  const persId = event.id.startsWith('pers:') ? event.id.slice(5) : event.objectId
  return [
    event.id,
    persId,
    event.objectId,
    event.objectLabel,
    event.violationLabel,
    card.title,
    card.subjectLabel,
    card.workerId ?? '',
  ].join(' ').toLowerCase()
}

function filterBySearch(events: PatrolEvent[], query: string): PatrolEvent[] {
  const q = query.trim().toLowerCase()
  if (!q) return events
  return events.filter(e => eventSearchHaystack(e).includes(q))
}

const INITIAL_COUNT = 6
const BATCH_SIZE = 4

function patrolEventTabCountLabel(tab: PatrolFilterTab, count: number): string {
  switch (tab) {
    case 'object':
      return `${count} đối tượng`
    case 'person':
      return `${count} người`
    case 'identity':
      return `${count} định danh`
    case 'all':
    default:
      return `${count} mục`
  }
}

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

function PatrolPromotedBadge({ event }: { event: PatrolEvent }) {
  const marker = resolvePatrolPromotedMarker(event)
  if (!marker) return null

  return (
    <TagTooltip content={marker.tooltip} className="shrink-0">
      <span className={cn(
        'inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-[8px] font-semibold',
        'border-amber-400/40 bg-amber-400/10 text-amber-300',
      )}>
        <ArrowUp className="w-2.5 h-2.5 shrink-0" aria-hidden />
        {marker.label}
      </span>
    </TagTooltip>
  )
}

function PatrolEventCard({
  event,
  appearanceHistoryCount,
  selected,
  onSelect,
  onDetailClick,
}: {
  event: PatrolEvent
  appearanceHistoryCount?: number
  selected?: boolean
  onSelect?: (event: PatrolEvent) => void
  onDetailClick?: (event: PatrolEvent) => void
}) {
  const displayMeta = resolvePatrolEventDisplayMeta(event)
  const SubjectIcon = displayMeta.icon
  const eventDateTime = formatEventDateTime(event.lockedAt)
  const eventPlace = getPatrolEventLocationLabel(event.cameraName, event.zoneName, event.cameraId)
  const cardDisplay = resolvePatrolPersonCardDisplay(event)

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
          <div className="flex items-center gap-1 min-w-0 flex-wrap">
            <PatrolStageBadge event={event} />
            <PatrolPromotedBadge event={event} />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <SubjectIcon className={EVENT_CARD_META_ICON} aria-hidden />
              <p className={cn('text-[8px] min-w-0 truncate font-medium', displayMeta.color)}>
                {cardDisplay.subjectLabel}
              </p>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock className={EVENT_CARD_META_ICON} aria-hidden />
              <p className="text-[8px] tabular-nums text-foreground/80 truncate">
                {eventDateTime}
              </p>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className={EVENT_CARD_META_ICON} aria-hidden />
              <p className="text-[8px] text-foreground/70 truncate">
                {eventPlace}
              </p>
            </div>
            {appearanceHistoryCount != null && appearanceHistoryCount >= 2
              && resolvePatrolPersonStage(event) !== 'object' && (
              <div className="flex items-center gap-1.5 min-w-0">
                <History className={EVENT_CARD_META_ICON} aria-hidden />
                <p className="text-[8px] tabular-nums text-foreground/75 truncate">
                  {`${appearanceHistoryCount} lượt`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export function PatrolEventsPanel({
  events,
  presences = [],
  tabCounts: tabCountsProp,
  viewDate,
  onViewDateChange,
  maxViewDate,
  minViewDate,
  selectedId,
  onSelect,
  onDetailClick,
}: PatrolEventsPanelProps) {
  const [filterTab, setFilterTab] = useState<PatrolFilterTab>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)
  const [loadingMore, setLoadingMore] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const appearanceCountLookup = useMemo(
    () => buildPatrolSubjectAppearanceCountLookup(presences),
    [presences],
  )

  const activeItems = useMemo(
    () => filterBySearch(filterByTab(events, filterTab), searchQuery),
    [events, filterTab, searchQuery],
  )

  const tabCounts = useMemo(() => tabCountsProp ?? {
    all: listPatrolEventsForTab(events, 'all').length,
    object: listPatrolEventsForTab(events, 'object').length,
    person: listPatrolEventsForTab(events, 'person').length,
    identity: listPatrolEventsForTab(events, 'identity').length,
  }, [events, tabCountsProp])

  useEffect(() => {
    setVisibleCount(INITIAL_COUNT)
    loadingMoreRef.current = false
    setLoadingMore(false)
  }, [filterTab, searchQuery])

  const visibleItems = useMemo(
    () => activeItems.slice(0, visibleCount),
    [activeItems, visibleCount],
  )
  const hasMore = visibleCount < activeItems.length

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    setVisibleCount(c => Math.min(c + BATCH_SIZE, activeItems.length))
    window.requestAnimationFrame(() => {
      loadingMoreRef.current = false
      setLoadingMore(false)
    })
  }, [activeItems.length])

  useEffect(() => {
    const root = scrollRef.current
    const el = sentinelRef.current
    if (!root || !el || !hasMore) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore()
      },
      { root, threshold: 0, rootMargin: '48px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  const viewingToday = viewDate === maxViewDate

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 px-2 pt-2 pb-1 shrink-0 border-b border-[#1e2433]/60">
        <PlaybackDatePicker
          date={viewDate}
          onDateChange={onViewDateChange}
          maxDate={maxViewDate}
          minDate={minViewDate}
          compact
        />
        {!viewingToday && (
          <span className="text-[8px] text-muted-foreground/70 shrink-0 hidden sm:inline">
            Đang xem ngày trước
          </span>
        )}
      </div>

      <div className="flex border-b border-[#1e2433] shrink-0 overflow-x-auto scrollbar-none overscroll-x-contain snap-x snap-mandatory">
        {FILTER_TABS.map(t => {
          const count = tabCounts[t.key]
          const active = filterTab === t.key
          const TabIcon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              title={t.countTooltip}
              onClick={() => setFilterTab(t.key)}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 sm:px-3 py-2 text-[9px] sm:text-[10px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px snap-start shrink-0',
                active
                  ? cn(t.activeBorder, t.activeText)
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <TabIcon
                className={cn('w-3.5 h-3.5 shrink-0', active ? t.color : t.inactiveColor)}
                aria-hidden
              />
              {t.label}
              <span className={cn(
                'ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tabular-nums',
                active ? t.activeBadge : 'bg-[#1a2235] text-muted-foreground',
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="px-2 pt-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Tìm tên, mã NV, pers_id…"
            className="w-full pl-8 pr-3 py-1.5 text-[10px] rounded-lg border border-[#1e2433] bg-[#0a0e17] outline-none focus:border-primary/50"
          />
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-1.5 sm:p-2">
        {listPatrolEventsForTab(events, 'all').length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-8 px-3">
            {viewingToday
              ? 'Chưa có sự kiện hôm nay — chọn ngày khác phía trên hoặc đang chờ backend'
              : 'Không có sự kiện ngày này — chọn ngày khác phía trên'}
          </p>
        ) : activeItems.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-8">
            {searchQuery ? 'Không có kết quả khớp tìm kiếm' : 'Chưa có sự kiện loại này'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {visibleItems.map(event => (
              <PatrolEventCard
                key={event.id}
                event={event}
                appearanceHistoryCount={resolvePatrolEventAppearanceHistoryCount(event, appearanceCountLookup)}
                selected={selectedId === event.id}
                onSelect={onSelect}
                onDetailClick={onDetailClick}
              />
            ))}

            {hasMore && (
              <div ref={sentinelRef} className="flex flex-col items-center justify-center gap-1 py-3">
                {loadingMore
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  : <div className="h-3.5" />}
                <span className="text-[9px] text-muted-foreground/50 tabular-nums">
                  Hiển thị {visibleItems.length}/{activeItems.length}
                </span>
              </div>
            )}

            {!hasMore && (
              <div className="flex items-center justify-center py-3">
                <span className="text-[9px] text-muted-foreground/35 tabular-nums">
                  — {patrolEventTabCountLabel(filterTab, tabCounts[filterTab])} —
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
