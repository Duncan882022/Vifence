import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Send, ShieldCheck } from 'lucide-react'
import { TagTooltip } from '@/components/common/IconTooltip/IconTooltip'
import { cn } from '@/utils/cn'
import type { SafetyViolationRecord } from '../../types/safety.types'
import { getScenarioName } from '../../data/safetyScenarios'
import { getEventAreaLabel, getEventSourceLabel } from '../../utils/safetyCameraBridge'
import { displayUnknown } from '../../utils/displayUnknown'
import { getResponsiblePartyLabel } from '../../utils/eventSubject'
import {
  formatSla, getAlertCardStatusDisplay, SEVERITY_BADGE,
  SEVERITY_ICONS,
  SEVERITY_LABELS_UI,
  shouldShowAlertHandlingBadge,
} from '../../utils/safetyDashboardUi'
import { SafetyGroupIconBadge } from '../SafetyGroupIconBadge'
import { formatDateTime } from '@/utils/format'
import { EventSubjectCell } from '../violations/EventSubjectCell'

interface SafetyViolationTableProps {
  records: SafetyViolationRecord[]
  selectedId?: string
  onSelect?: (v: SafetyViolationRecord) => void
  onSnapshotClick?: (v: SafetyViolationRecord) => void
}

type SortKey = 'detectedAt' | 'zoneId' | 'groupId' | 'scenarioId' | 'severity' | 'status'
type SortDir = 'asc' | 'desc'

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  VIOLATION: 1,
  WARNING: 2,
}

const STATUS_RANK: Record<string, number> = {
  OVERDUE: 0,
  DETECTED: 1,
  PENDING_VERIFICATION: 2,
  CONFIRMED: 3,
  ASSIGNED: 4,
  IN_PROGRESS: 5,
  PENDING_RECHECK: 6,
  CLOSED: 7,
}

const SORTABLE_COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: null, label: '#' },
  { key: 'detectedAt', label: 'Thời gian' },
  { key: null, label: 'Đối tượng sự kiện' },
  { key: 'zoneId', label: 'Khu vực' },
  { key: 'groupId', label: 'Nhóm' },
  { key: 'scenarioId', label: 'Kịch bản' },
  { key: null, label: 'Nguồn' },
  { key: 'severity', label: 'Mức' },
  { key: 'status', label: 'Trạng thái' },
  { key: null, label: 'SLA' },
  { key: null, label: '' },
]

const INITIAL_COUNT = 10
const BATCH_SIZE = 6

function compareRecords(a: SafetyViolationRecord, b: SafetyViolationRecord, key: SortKey, dir: SortDir): number {
  let cmp = 0

  switch (key) {
    case 'detectedAt':
      cmp = a.detectedAt.localeCompare(b.detectedAt)
      break
    case 'zoneId':
      cmp = getEventAreaLabel(a.sourceDeviceId, a.sourceType, a.zoneId)
        .localeCompare(getEventAreaLabel(b.sourceDeviceId, b.sourceType, b.zoneId), 'vi')
      break
    case 'groupId':
      cmp = a.groupId.localeCompare(b.groupId)
      break
    case 'scenarioId':
      cmp = getScenarioName(a.scenarioId).localeCompare(getScenarioName(b.scenarioId), 'vi')
      break
    case 'severity':
      cmp = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
      break
    case 'status':
      cmp = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
      break
  }

  return dir === 'asc' ? cmp : -cmp
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string
  sortKey: SortKey | null
  activeKey: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
}) {
  if (!sortKey) {
    return (
      <th className="px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
        {label}
      </th>
    )
  }

  const active = activeKey === sortKey

  return (
    <th className="px-2 py-1.5 whitespace-nowrap">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider transition-colors',
          active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
        {active
          ? (dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)
          : <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />}
      </button>
    </th>
  )
}

export function SafetyViolationTable({
  records, selectedId, onSelect, onSnapshotClick,
}: SafetyViolationTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('detectedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => compareRecords(a, b, sortKey, sortDir)),
    [records, sortKey, sortDir],
  )

  useEffect(() => {
    setVisibleCount(INITIAL_COUNT)
  }, [records, sortKey, sortDir])

  const visibleRecords = useMemo(
    () => sortedRecords.slice(0, visibleCount),
    [sortedRecords, visibleCount],
  )
  const hasMore = visibleCount < sortedRecords.length

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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'detectedAt' ? 'desc' : 'asc')
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#0d1117] z-10">
            <tr className="border-b border-[#1e2433]">
              {SORTABLE_COLUMNS.map(col => (
                <SortableHeader
                  key={col.label || 'actions'}
                  label={col.label}
                  sortKey={col.key}
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRecords.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-[10px] text-muted-foreground">
                  Không có sự kiện phù hợp bộ lọc
                </td>
              </tr>
            ) : visibleRecords.map((v, index) => {
              const sla = formatSla(v)
              const selected = selectedId === v.id
              const statusDisplay = getAlertCardStatusDisplay(v)
              const showHandlingBadge = shouldShowAlertHandlingBadge(v)
              const StatusIcon = statusDisplay.icon
              const SeverityIcon = SEVERITY_ICONS[v.severity]
              const contractor = getResponsiblePartyLabel(v)

              return (
                <tr
                  key={v.id}
                  onClick={() => onSelect?.(v)}
                  className={cn(
                    'border-b border-[#1e2433]/60 cursor-pointer hover:bg-[#111827]/80 transition-colors',
                    selected && 'bg-primary/5',
                  )}
                >
                  <td className="px-2 py-1.5 text-[9px] text-muted-foreground tabular-nums whitespace-nowrap align-top w-8">
                    {index + 1}
                  </td>
                  <td className="px-2 py-1.5 text-[9px] text-muted-foreground tabular-nums whitespace-nowrap align-top">{formatDateTime(v.detectedAt)}</td>
                  <td className="px-2 py-1.5 min-w-[160px] max-w-[220px] align-top">
                    <EventSubjectCell record={v} compact onSnapshotClick={onSnapshotClick} />
                  </td>
                  <td className="px-2 py-1.5 text-[9px] text-foreground whitespace-nowrap align-top">{displayUnknown(getEventAreaLabel(v.sourceDeviceId, v.sourceType, v.zoneId))}</td>
                  <td className="px-2 py-1.5 align-top">
                    <SafetyGroupIconBadge groupId={v.groupId} size="sm" showLabel />
                  </td>
                  <td className="px-2 py-1.5 text-[9px] text-foreground max-w-[130px] truncate align-top">{getScenarioName(v.scenarioId)}</td>
                  <td className="px-2 py-1.5 text-[9px] text-muted-foreground whitespace-nowrap align-top">{displayUnknown(getEventSourceLabel(v.sourceDeviceId, v.sourceType))}</td>
                  <td className="px-2 py-1.5 align-top">
                    <TagTooltip content={SEVERITY_LABELS_UI[v.severity]} className="inline-flex">
                      <span
                        className={cn(
                          'w-5 h-5 rounded border inline-flex items-center justify-center',
                          SEVERITY_BADGE[v.severity],
                        )}
                        aria-label={SEVERITY_LABELS_UI[v.severity]}
                      >
                        <SeverityIcon className="w-2.5 h-2.5 shrink-0" aria-hidden />
                      </span>
                    </TagTooltip>
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    {showHandlingBadge && (
                      <TagTooltip content={statusDisplay.label} className="inline-flex">
                        <span
                          className={cn(
                            'w-5 h-5 rounded border inline-flex items-center justify-center',
                            statusDisplay.badgeClassName,
                          )}
                          aria-label={statusDisplay.label}
                        >
                          <StatusIcon className="w-2.5 h-2.5 shrink-0" aria-hidden />
                        </span>
                      </TagTooltip>
                    )}
                    <p className="text-[7px] text-muted-foreground/70 mt-0.5 truncate max-w-[90px]">{contractor}</p>
                  </td>
                  <td className={cn('px-2 py-1.5 text-[9px] tabular-nums align-top', sla.className)}>{sla.label}</td>
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={e => e.stopPropagation()} className="p-1 rounded hover:bg-[#1e2433] text-muted-foreground" title="Giao việc">
                        <Send className="w-3 h-3" />
                      </button>
                      {v.status === 'PENDING_VERIFICATION' && (
                        <button type="button" onClick={e => e.stopPropagation()} className="p-1 rounded hover:bg-[#1e2433] text-violet-400" title="Xác minh">
                          <ShieldCheck className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {sortedRecords.length > 0 && hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-3">
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              : <div className="h-3.5" />}
          </div>
        )}

        {sortedRecords.length > 0 && !hasMore && (
          <div className="flex items-center justify-center py-3">
            <span className="text-[9px] text-muted-foreground/35">
              — {sortedRecords.length} sự kiện —
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
