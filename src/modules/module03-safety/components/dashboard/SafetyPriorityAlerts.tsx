import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Gavel, Loader2, Play } from 'lucide-react'
import { cn } from '@/utils/cn'
import type {
  AlertSeverity,
  SafetyGroupId,
  SafetyViolationRecord,
} from '../../types/safety.types'
import { SAFETY_GROUPS } from '../../data/safetyGroups'
import { getScenarioName } from '../../data/safetyScenarios'
import { formatDate, formatTimeShort } from '@/utils/format'
import { getMonitoringDeviceLabel } from '../../data/monitoringDevices'
import {
  GROUP_BADGE,
  GROUP_COLORS,
  GROUP_ICONS,
  getAlertCardStatusDisplay,
  getAlertHandlingStatus,
  isAiAutoHandled,
  isManualUnhandled,
  AI_AUTO_STATUS_LABEL,
  SEVERITY_BADGE,
  SEVERITY_LABELS_UI,
} from '../../utils/safetyDashboardUi'
import {
  getAlertSubjectLabel,
  getResponsiblePartyLabel,
} from '../../utils/eventSubject'
import { ViolationSnapshotThumb } from '../violations/EventSubjectCell'

interface SafetyPriorityAlertsProps {
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
  const group = SAFETY_GROUPS.find(g => g.id === groupId)

  return (
    <span
      className={cn('text-[8px] px-1 py-0.5 rounded border inline-flex items-center gap-0.5', GROUP_BADGE[groupId])}
      title={group?.name}
    >
      <Icon className={cn('w-2.5 h-2.5 shrink-0', GROUP_COLORS[groupId])} aria-hidden />
      {groupId}
    </span>
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
  const captureDeviceLabel = getMonitoringDeviceLabel(v.sourceDeviceId)
  const confidencePct = v.confidence != null ? Math.round(v.confidence * 100) : null

  return (
    <div
      className="flex flex-col sm:flex-row gap-2 p-2.5 sm:p-2 rounded-lg border border-[#1e2433] bg-[#0a0e17] hover:border-[#2a3855] transition-colors cursor-pointer"
      onClick={() => onSelect?.(v)}
      onKeyDown={e => e.key === 'Enter' && onSelect?.(v)}
    >
      <div className="flex gap-2 sm:contents min-w-0">
      <div className="flex flex-col items-stretch gap-0.5 shrink-0 w-16 sm:w-14">
        <ViolationSnapshotThumb record={v} compact className="w-16 h-10 sm:w-14 sm:h-9" />
        {confidencePct != null && (
          <p className="text-[7px] text-muted-foreground tabular-nums text-center leading-tight">
            <span className="text-muted-foreground/70">Độ tin cậy </span>
            <span className="font-semibold text-foreground/80">{confidencePct}%</span>
          </p>
        )}
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <GroupTag groupId={v.groupId} />
          <span className={cn('text-[8px] px-1 py-0.5 rounded border', SEVERITY_BADGE[v.severity])}>
            {SEVERITY_LABELS_UI[v.severity]}
          </span>
        </div>

        <p className="text-[10px] font-medium text-foreground leading-snug line-clamp-2">
          {getScenarioName(v.scenarioId)}
        </p>

        <p className="text-[8px] text-muted-foreground leading-tight">
          <span className="text-muted-foreground/70">Đối tượng </span>
          <span className="text-foreground/90 font-medium">{getAlertSubjectLabel(v)}</span>
        </p>

        <p className="text-[8px] text-muted-foreground leading-snug">
          <span className="sm:hidden block">
            {formatDate(v.detectedAt)}
            <span className="text-muted-foreground/40 mx-1">·</span>
            {formatTimeShort(v.detectedAt)}
          </span>
          <span className="hidden sm:inline">
            {formatDate(v.detectedAt)}
            <span className="text-muted-foreground/40 mx-1">·</span>
            {formatTimeShort(v.detectedAt)}
            <span className="text-muted-foreground/40 mx-1">·</span>
            <span className="text-foreground/80">{captureDeviceLabel}</span>
          </span>
          <span className="sm:hidden block text-foreground/80 truncate">{captureDeviceLabel}</span>
        </p>

        <p className="text-[8px] text-muted-foreground leading-tight">
          <span className="text-muted-foreground/70">Đơn vị </span>
          <span className="text-foreground/90">{getResponsiblePartyLabel(v)}</span>
        </p>

        <div className="flex items-center gap-1.5 flex-wrap pt-1 mt-0.5 border-t border-[#1e2433]/80">
          <span className="text-[7px] text-muted-foreground/70 uppercase tracking-wider">Trạng thái</span>
          <span className={cn('text-[8px] px-1 py-0.5 rounded', statusDisplay.badgeClassName)}>
            {statusDisplay.label}
          </span>
        </div>
      </div>
      </div>

      <div className="flex sm:flex-col gap-1.5 sm:gap-1 shrink-0 sm:shrink-0 border-t sm:border-t-0 border-[#1e2433]/80 pt-2 sm:pt-0 sm:self-start">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onPlayback?.(v) }}
          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-0 min-h-[36px] sm:min-h-0 p-2 sm:p-1 rounded-lg sm:rounded hover:bg-[#1e2433] text-muted-foreground hover:text-primary border border-[#1e2433]/60 sm:border-0"
          title="Xem lại"
        >
          <Play className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
          <span className="text-[10px] font-medium sm:hidden">Xem lại</span>
        </button>
        <button
          type="button"
          disabled={handleDisabled}
          onClick={e => {
            e.stopPropagation()
            if (!handleDisabled) onHandle?.(v)
          }}
          className={cn(
            'flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-0 min-h-[36px] sm:min-h-0 p-2 sm:p-1 rounded-lg sm:rounded transition-opacity border sm:border-0',
            handleDisabled
              ? 'opacity-25 cursor-not-allowed pointer-events-none grayscale border-[#1e2433]/40'
              : 'hover:bg-[#1e2433] text-muted-foreground hover:text-amber-400 border-[#1e2433]/60',
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
          <Gavel className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
          <span className="text-[10px] font-medium sm:hidden">Xử lý</span>
        </button>
      </div>
    </div>
  )
}

export function SafetyPriorityAlerts({
  all, warning, violation, critical,
  selectedGroupId = null,
  onPlayback, onSelect, onHandle,
}: SafetyPriorityAlertsProps) {
  const [filterTab, setFilterTab] = useState<AlertFilterTab>('all')
  const [groupQuickFilters, setGroupQuickFilters] = useState<Set<SafetyGroupId>>(new Set())
  const [quickOpen, setQuickOpen] = useState(false)
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

  const clearGroupQuick = () => setGroupQuickFilters(new Set())

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

      <div className="px-2 py-1 border-b border-[#1e2433] shrink-0">
        <button
          type="button"
          onClick={() => setQuickOpen(o => !o)}
          className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          Quick Filter · Nhóm ATLĐ
          {groupQuickFilters.size > 0 && (
            <span className="normal-case tracking-normal font-bold text-primary tabular-nums">{groupQuickFilters.size}</span>
          )}
          <ChevronDown className={cn('w-3 h-3 transition-transform', quickOpen && 'rotate-180')} />
        </button>
        {quickOpen && (
          <div className="flex flex-wrap gap-1 mt-1.5 pb-0.5">
            <button
              type="button"
              onClick={clearGroupQuick}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold border transition-colors tabular-nums',
                groupQuickFilters.size === 0
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'border-[#1e2433] text-muted-foreground hover:border-[#2a3855] hover:text-foreground',
              )}
              aria-pressed={groupQuickFilters.size === 0}
            >
              Tất cả
            </button>
            {SAFETY_GROUPS.map(g => {
              const Icon = GROUP_ICONS[g.id]
              const active = groupQuickFilters.has(g.id)
              const count = groupCounts[g.id]

              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGroupQuick(g.id)}
                  title={g.name}
                  disabled={count === 0 && !active}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold border transition-colors tabular-nums',
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
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3">
        {empty ? (
          <p className="text-[10px] text-muted-foreground text-center py-8">Không có cảnh báo</p>
        ) : activeItems.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-8">
            Không có mục phù hợp bộ lọc
          </p>
        ) : (
          <div className="space-y-1.5">
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
                  — {activeItems.length} cảnh báo —
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
