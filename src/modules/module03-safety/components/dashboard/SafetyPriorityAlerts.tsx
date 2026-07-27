import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Clock, Gavel, Loader2, Play, User } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type {
  AlertSeverity,
  SafetyGroupId,
  SafetyViolationRecord,
} from '../../types/safety.types'
import { SAFETY_GROUPS, getGroupDictionaryTooltip } from '../../data/safetyGroups'
import { getScenarioName } from '../../data/safetyScenarios'
import { formatEventDateTime } from '@/utils/format'
import { getEventCapturePlace } from '../../utils/safetyCameraBridge'
import {
  GROUP_BADGE,
  GROUP_BORDER_ACCENT,
  GROUP_COLORS,
  GROUP_ICONS,
  getAlertCardStatusDisplay,
  getAlertHandlingStatus,
  isAiAutoHandled,
  isManualUnhandled,
  AI_AUTO_STATUS_LABEL,
  SEVERITY_BADGE,
  SEVERITY_ICONS,
  SEVERITY_LABELS_UI,
} from '../../utils/safetyDashboardUi'
import {
  getAlertSubjectLabel,
} from '../../utils/eventSubject'
import { AlertEventSnapshot } from '../violations/EventSubjectCell'

interface SafetyEventsPanelProps {
  all: SafetyViolationRecord[]
  warning: SafetyViolationRecord[]
  violation: SafetyViolationRecord[]
  critical: SafetyViolationRecord[]
  /** Lọc theo nhóm khi chọn từ Nhóm ATLĐ */
  selectedGroupId?: SafetyGroupId | null
  onPlayback?: (v: SafetyViolationRecord) => void
  onSelect?: (v: SafetyViolationRecord) => void
  onHandle?: (v: SafetyViolationRecord) => void
}

type AlertFilterTab = 'all' | AlertSeverity | 'handled' | 'unhandled'

const FILTER_TABS: { key: AlertFilterTab; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'CRITICAL', label: 'Khẩn cấp' },
  { key: 'VIOLATION', label: 'Vi phạm' },
  { key: 'WARNING', label: 'Cảnh báo' },
  { key: 'handled', label: 'Đã xử lý' },
  { key: 'unhandled', label: 'Chưa xử lý' },
]

const INITIAL_COUNT = 10
const BATCH_SIZE = 6

function GroupTag({ groupId }: { groupId: SafetyGroupId }) {
  const Icon = GROUP_ICONS[groupId]

  return (
    <span
      className={cn('text-[8px] px-1 py-0.5 rounded border inline-flex items-center gap-0.5', GROUP_BADGE[groupId])}
      title={getGroupDictionaryTooltip(groupId)}
    >
      <Icon className={cn('w-2.5 h-2.5 shrink-0', GROUP_COLORS[groupId])} aria-hidden />
      {groupId}
    </span>
  )
}

function SeverityTag({ severity }: { severity: AlertSeverity }) {
  const Icon = SEVERITY_ICONS[severity]

  return (
    <span
      className={cn('text-[8px] px-1 py-0.5 rounded border inline-flex items-center gap-0.5', SEVERITY_BADGE[severity])}
    >
      <Icon className="w-2.5 h-2.5 shrink-0" aria-hidden />
      {SEVERITY_LABELS_UI[severity]}
    </span>
  )
}

function StatusTag({
  label,
  badgeClassName,
  icon: StatusIcon,
}: {
  label: string
  badgeClassName: string
  icon: LucideIcon
}) {
  return (
    <span
      className={cn(
        'text-[8px] px-1 py-0.5 rounded border inline-flex items-center gap-0.5 font-medium max-w-full',
        badgeClassName,
      )}
    >
      <StatusIcon className="w-2.5 h-2.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}

function AlertCardActions({
  aiAutoHandled,
  handled,
  handleDisabled,
  onPlayback,
  onHandle,
  v,
  compact,
}: {
  aiAutoHandled: boolean
  handled: boolean
  handleDisabled: boolean
  onPlayback?: (v: SafetyViolationRecord) => void
  onHandle?: (v: SafetyViolationRecord) => void
  v: SafetyViolationRecord
  compact?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-0.5 shrink-0', compact ? 'gap-1' : '')}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onPlayback?.(v) }}
        className={cn(
          'flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-[#1e2433]/80 transition-colors',
          compact ? 'min-h-[32px] flex-1 px-2 gap-1.5 border border-[#1e2433]/60' : 'w-7 h-7',
        )}
        title="Xem lại"
      >
        <Play className={cn(compact ? 'w-3.5 h-3.5' : 'w-3 h-3')} />
        {compact && <span className="text-[10px] font-medium">Xem lại</span>}
      </button>
      <button
        type="button"
        disabled={handleDisabled}
        onClick={e => {
          e.stopPropagation()
          if (!handleDisabled) onHandle?.(v)
        }}
        className={cn(
          'flex items-center justify-center rounded-md transition-colors border sm:border-0',
          compact ? 'min-h-[32px] flex-1 px-2 gap-1.5' : 'w-7 h-7',
          handleDisabled
            ? 'opacity-25 cursor-not-allowed pointer-events-none grayscale border-[#1e2433]/40 text-muted-foreground'
            : 'hover:bg-[#1e2433]/80 text-muted-foreground hover:text-amber-400 border-[#1e2433]/60',
        )}
        title={
          aiAutoHandled
            ? AI_AUTO_STATUS_LABEL
            : handled
              ? 'Đã xử lý'
              : 'Xử lý'
        }
        aria-disabled={handleDisabled}
      >
        <Gavel className={cn(compact ? 'w-3.5 h-3.5' : 'w-3 h-3')} />
        {compact && <span className="text-[10px] font-medium">Xử lý</span>}
      </button>
    </div>
  )
}

function AlertCard({
  v,
  onPlayback,
  onSelect,
  onHandle,
}: {
  v: SafetyViolationRecord
  onPlayback?: (v: SafetyViolationRecord) => void
  onSelect?: (v: SafetyViolationRecord) => void
  onHandle?: (v: SafetyViolationRecord) => void
}) {
  const aiAutoHandled = isAiAutoHandled(v)
  const handled = v.status === 'CLOSED'
  const handleDisabled = aiAutoHandled || handled
  const statusDisplay = getAlertCardStatusDisplay(v)
  const confidencePct = v.confidence != null ? Math.round(v.confidence * 100) : null
  const eventDateTime = formatEventDateTime(v.detectedAt)
  const eventPlace = getEventCapturePlace(v.sourceDeviceId, v.sourceType, v.zoneId)

  return (
    <article
      role="button"
      tabIndex={0}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border border-[#1e2433] border-l-[3px] bg-[#0a0e17]',
        'hover:border-[#2a3855] hover:bg-[#0c1019] transition-colors cursor-pointer',
        GROUP_BORDER_ACCENT[v.groupId],
      )}
      onClick={() => onSelect?.(v)}
      onKeyDown={e => e.key === 'Enter' && onSelect?.(v)}
    >
      <div className="flex gap-3 p-2.5 min-w-0 items-stretch">
        <AlertEventSnapshot
          record={v}
          confidencePct={confidencePct ?? undefined}
          className="self-stretch"
        />

        <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5 py-0.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-1 min-w-0">
              <GroupTag groupId={v.groupId} />
              <SeverityTag severity={v.severity} />
              <StatusTag
                label={statusDisplay.label}
                badgeClassName={statusDisplay.badgeClassName}
                icon={statusDisplay.icon}
              />
            </div>
            <AlertCardActions
              v={v}
              aiAutoHandled={aiAutoHandled}
              handled={handled}
              handleDisabled={handleDisabled}
              onPlayback={onPlayback}
              onHandle={onHandle}
            />
          </div>

          <h3 className="text-[11px] font-semibold text-foreground leading-snug line-clamp-2 pr-1">
            {getScenarioName(v.scenarioId)}
          </h3>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-2.5 h-2.5 shrink-0 text-muted-foreground/45" aria-hidden />
              <p className="text-[8px] min-w-0 truncate text-foreground/90 font-medium">
                {getAlertSubjectLabel(v)}
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

export function SafetyEventsPanel({
  all, warning, violation, critical,
  selectedGroupId = null,
  onPlayback, onSelect, onHandle,
}: SafetyEventsPanelProps) {
  const [filterTab, setFilterTab] = useState<AlertFilterTab>('all')
  const [groupQuickFilters, setGroupQuickFilters] = useState<Set<SafetyGroupId>>(new Set())
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const groupFilter = selectedGroupId ?? null

  const handledPool = useMemo(
    () => all.filter(v => getAlertHandlingStatus(v) === 'handled'),
    [all],
  )
  const unhandled = useMemo(() => all.filter(isManualUnhandled), [all])

  const byFilterTab = useMemo(() => ({
    all,
    WARNING: warning,
    VIOLATION: violation,
    CRITICAL: critical,
    handled: handledPool,
    unhandled,
  }), [all, warning, violation, critical, handledPool, unhandled])

  const filterPool = byFilterTab[filterTab]

  const groupCounts = useMemo(() => {
    const counts = Object.fromEntries(SAFETY_GROUPS.map(g => [g.id, 0])) as Record<SafetyGroupId, number>
    filterPool.forEach(v => { counts[v.groupId]++ })
    return counts
  }, [filterPool])

  const countScope = useMemo(() => {
    if (groupQuickFilters.size > 0) {
      return all.filter(v => groupQuickFilters.has(v.groupId))
    }
    if (groupFilter) {
      return all.filter(v => v.groupId === groupFilter)
    }
    return all
  }, [all, groupQuickFilters, groupFilter])

  const tabCounts = useMemo(() => ({
    all: countScope.length,
    WARNING: countScope.filter(v => v.severity === 'WARNING').length,
    VIOLATION: countScope.filter(v => v.severity === 'VIOLATION').length,
    CRITICAL: countScope.filter(v => v.severity === 'CRITICAL').length,
    handled: countScope.filter(v => getAlertHandlingStatus(v) === 'handled').length,
    unhandled: countScope.filter(v => isManualUnhandled(v)).length,
  }), [countScope])

  const activeItems = useMemo(() => {
    return filterPool.filter(v => {
      if (groupQuickFilters.size > 0) {
        if (!groupQuickFilters.has(v.groupId)) return false
      } else if (groupFilter && v.groupId !== groupFilter) {
        return false
      }
      return true
    })
  }, [filterPool, groupFilter, groupQuickFilters])

  useEffect(() => {
    setVisibleCount(INITIAL_COUNT)
  }, [filterTab, groupFilter, groupQuickFilters, activeItems.length])

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

  const empty = all.length === 0

  const toggleGroupQuick = (groupId: SafetyGroupId) => {
    setGroupQuickFilters(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const groupFilterBar = (
    <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-[#1e2433] shrink-0 overflow-x-auto scrollbar-none">
      {SAFETY_GROUPS.map(g => {
        const Icon = GROUP_ICONS[g.id]
        const active = groupQuickFilters.has(g.id)
        const count = groupCounts[g.id]

        return (
          <button
            key={g.id}
            type="button"
            onClick={() => toggleGroupQuick(g.id)}
            title={getGroupDictionaryTooltip(g.id)}
            disabled={count === 0 && !active}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold border transition-colors tabular-nums shrink-0',
              active
                ? GROUP_BADGE[g.id]
                : count > 0
                  ? 'border-[#1e2433] text-muted-foreground hover:border-[#2a3855] hover:text-foreground'
                  : 'border-[#1e2433]/50 text-muted-foreground/40 cursor-default',
            )}
            aria-pressed={active}
          >
            <Icon className={cn('w-2.5 h-2.5 shrink-0', active || count > 0 ? GROUP_COLORS[g.id] : 'opacity-40')} aria-hidden />
            {g.id}
            {count > 0 && <span>{count}</span>}
          </button>
        )
      })}
    </div>
  )

  return (
    <Panel
      title="Sự kiện"
      noPadding
      expandable
      className="flex-1 min-h-0 max-lg:!h-auto max-lg:min-h-[320px] overflow-hidden h-full"
    >
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

      {groupFilterBar}

      <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3">
        {empty ? (
          <p className="text-[10px] text-muted-foreground text-center py-8">Không có sự kiện</p>
        ) : activeItems.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-8">
            Không có mục phù hợp bộ lọc
          </p>
        ) : (
          <div className="space-y-2">
            {visibleItems.map(v => (
              <AlertCard key={v.id} v={v} onPlayback={onPlayback} onSelect={onSelect} onHandle={onHandle} />
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
    </Panel>
  )
}

/** @deprecated — dùng SafetyEventsPanel */
export const SafetyPriorityAlerts = SafetyEventsPanel
