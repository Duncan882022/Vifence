import { useState, useMemo } from 'react'
import {
  Play, Search, Bell, CheckCircle, Download,
  Building2, MapPin, Clock,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/format'
import type { HousekeepingIssue, IssueSeverity } from '@/types/housekeeping'
import type { Event } from '@/types/event'
import {
  getIssueSeverity,
  HOUSEKEEPING_ISSUES,
  ISSUE_SEVERITY_COLORS,
  ISSUE_SEVERITY_LABELS,
  ISSUE_TYPE_LABELS,
  withIssueVideoUrl,
} from '../data/housekeepingIssues'
import { getIssueFeedUrl } from '../data/housekeepingIssueFeeds'
import { useTrialLock } from '@/hooks/useTrialLock'
import { matchZoneId } from '../services/housekeepingHeatmap.service'
import { Avatar } from '@/components/common/Avatar/Avatar'
import { getPersonAvatarUrl, getPersonAvatarColor } from '@/data/personAvatars'

export type IssueTabKey = IssueSeverity | 'all'

const TABS: { key: IssueTabKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'high', label: 'Cao' },
  { key: 'medium', label: 'TB' },
  { key: 'low', label: 'Thấp' },
]

const DESKTOP_COLS = 'grid-cols-[minmax(0,0.85fr)_44px_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.75fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_80px]'

export function issueToEvent(issue: HousekeepingIssue): Event {
  const enriched = withIssueVideoUrl(issue)
  const severity = getIssueSeverity(enriched.type)
  return {
    id: enriched.id,
    type: ISSUE_TYPE_LABELS[enriched.type],
    description: enriched.description,
    timestamp: enriched.timestamp,
    cameraId: enriched.cameraId,
    cameraName: enriched.cameraName,
    location: enriched.location,
    workerId: enriched.workerId,
    workerName: enriched.workerName,
    contractorName: enriched.contractorName,
    videoUrl: enriched.videoUrl ?? getIssueFeedUrl(enriched.type),
    status: enriched.status,
    severity: severity === 'high' ? 'critical' : 'warning',
    module: 'housekeeping',
  }
}

function matchesTab(issue: HousekeepingIssue, tab: IssueTabKey): boolean {
  if (tab === 'all') return true
  return getIssueSeverity(issue.type) === tab
}

function matchesSearch(issue: HousekeepingIssue, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return [
    issue.workerName,
    issue.employeeCode,
    issue.contractorName,
    issue.teamName,
    issue.location,
    issue.cameraName,
    issue.description,
    ISSUE_TYPE_LABELS[issue.type],
  ].some(field => field?.toLowerCase().includes(q))
}

interface RowActionsProps {
  issue: HousekeepingIssue
  onPlayback?: (event: Event) => void
  showTrial: () => void
  compact?: boolean
}

function RowActions({ issue, onPlayback, showTrial, compact }: RowActionsProps) {
  return (
    <div className={cn('flex items-center gap-0.5', compact ? 'shrink-0' : 'justify-end')}>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          onPlayback?.(issueToEvent(issue))
        }}
        className="p-1.5 lg:p-1 rounded hover:bg-teal-500/20 text-muted-foreground hover:text-teal-400 transition-colors"
        title="Xem lại video"
      >
        <Play className={cn(compact ? 'w-3.5 h-3.5' : 'w-3 h-3')} />
      </button>
      {issue.status === 'pending' && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); showTrial() }}
          className="p-1.5 lg:p-1 rounded hover:bg-green-500/20 text-muted-foreground hover:text-green-400 transition-colors"
          title="Xử lý"
        >
          <CheckCircle className={cn(compact ? 'w-3.5 h-3.5' : 'w-3 h-3')} />
        </button>
      )}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); showTrial() }}
        className="p-1.5 lg:p-1 rounded hover:bg-cyan-500/20 text-muted-foreground hover:text-cyan-400 transition-colors"
        title="Thông báo"
      >
        <Bell className={cn(compact ? 'w-3.5 h-3.5' : 'w-3 h-3')} />
      </button>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); showTrial() }}
        className="hidden sm:flex p-1 rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors lg:opacity-0 lg:group-hover:opacity-100"
        title="Tải xuống"
      >
        <Download className="w-3 h-3" />
      </button>
    </div>
  )
}

function IssueMobileCard({
  issue,
  isSelected,
  onSelect,
  onPlayback,
  showTrial,
}: {
  issue: HousekeepingIssue
  isSelected: boolean
  onSelect?: () => void
  onPlayback?: (event: Event) => void
  showTrial: () => void
}) {
  const severity = getIssueSeverity(issue.type)
  const sevCfg = ISSUE_SEVERITY_COLORS[severity]
  const workerName = issue.workerName ?? '—'
  const avatarColor = getPersonAvatarColor(workerName)
  const avatarSrc = issue.workerId ? getPersonAvatarUrl(issue.workerId, issue.workerName) : undefined

  return (
    <div
      onClick={onSelect}
      className={cn(
        'lg:hidden px-3 py-2.5 cursor-pointer transition-colors',
        isSelected ? 'bg-teal-500/10' : 'hover:bg-[#1a2235]/50',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={workerName} color={avatarColor} src={avatarSrc} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-foreground truncate">{issue.workerName ?? '—'}</p>
              {issue.employeeCode && (
                <p className="text-[9px] text-muted-foreground/60 truncate">{issue.employeeCode}</p>
              )}
            </div>
            <RowActions issue={issue} onPlayback={onPlayback} showTrial={showTrial} compact />
          </div>
          <p className="text-[10px] text-foreground/90 mt-1 leading-snug">{ISSUE_TYPE_LABELS[issue.type]}</p>
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded', sevCfg.color, sevCfg.bg)}>
              {ISSUE_SEVERITY_LABELS[severity]}
            </span>
            <span className={cn(
              'text-[8px] font-bold px-1 py-0.5 rounded',
              issue.status === 'pending' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-green-500/15 text-green-400',
            )}>
              {issue.status === 'pending' ? 'Chưa xử lý' : 'Đã xử lý'}
            </span>
          </div>
          <div className="mt-1.5 space-y-0.5 text-[9px] text-muted-foreground">
            <p className="flex items-center gap-1 truncate">
              <Building2 className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{issue.contractorName ?? '—'}{issue.teamName ? ` · ${issue.teamName}` : ''}</span>
            </p>
            <p className="flex items-center gap-1 truncate">
              <MapPin className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{issue.location}</span>
            </p>
            <p className="flex items-center gap-1 tabular-nums">
              <Clock className="w-2.5 h-2.5 shrink-0" />
              {formatDateTime(issue.timestamp)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function IssueDesktopRow({
  issue,
  isSelected,
  onSelect,
  onPlayback,
  showTrial,
}: {
  issue: HousekeepingIssue
  isSelected: boolean
  onSelect?: () => void
  onPlayback?: (event: Event) => void
  showTrial: () => void
}) {
  const severity = getIssueSeverity(issue.type)
  const sevCfg = ISSUE_SEVERITY_COLORS[severity]
  const workerName = issue.workerName ?? '—'
  const avatarColor = getPersonAvatarColor(workerName)
  const avatarSrc = issue.workerId ? getPersonAvatarUrl(issue.workerId, issue.workerName) : undefined

  return (
    <div
      onClick={onSelect}
      className={cn(
        'hidden lg:grid gap-x-2 items-center px-3 py-2.5 cursor-pointer transition-colors group',
        DESKTOP_COLS,
        isSelected ? 'bg-teal-500/10' : 'hover:bg-[#1a2235]/50',
      )}
    >
      <p className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(issue.timestamp)}</p>
      <Avatar name={workerName} color={avatarColor} src={avatarSrc} size="sm" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-foreground truncate">{issue.workerName ?? '—'}</p>
        {issue.employeeCode && <p className="text-[8px] text-muted-foreground/60 truncate">{issue.employeeCode}</p>}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-teal-400/75 truncate">{issue.contractorName ?? '—'}</p>
        {issue.teamName && <p className="text-[8px] text-muted-foreground/60 truncate">{issue.teamName}</p>}
      </div>
      <p className="text-[10px] text-foreground truncate">{ISSUE_TYPE_LABELS[issue.type]}</p>
      <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded whitespace-nowrap w-fit', sevCfg.color, sevCfg.bg)}>
        {ISSUE_SEVERITY_LABELS[severity]}
      </span>
      <span className={cn(
        'text-[8px] font-bold px-1 py-0.5 rounded w-fit',
        issue.status === 'pending' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-green-500/15 text-green-400',
      )}>
        {issue.status === 'pending' ? 'Chưa xử lý' : 'Đã xử lý'}
      </span>
      <RowActions issue={issue} onPlayback={onPlayback} showTrial={showTrial} />
    </div>
  )
}

interface HousekeepingIssueTableProps {
  issues?: HousekeepingIssue[]
  selectedId?: string
  onSelectIssue?: (issue: HousekeepingIssue) => void
  onPlayback?: (event: Event) => void
  contractorFilter?: string | null
  zoneFilter?: string | null
  compact?: boolean
}

export function HousekeepingIssueTable({
  issues = HOUSEKEEPING_ISSUES,
  selectedId,
  onSelectIssue,
  onPlayback,
  contractorFilter,
  zoneFilter,
  compact = false,
}: HousekeepingIssueTableProps) {
  const [tab, setTab] = useState<IssueTabKey>('all')
  const [search, setSearch] = useState('')
  const { show: showTrial } = useTrialLock()

  const filtered = useMemo(() => {
    return issues
      .filter(i => matchesTab(i, tab))
      .filter(i => !contractorFilter || i.contractorName === contractorFilter)
      .filter(i => !zoneFilter || matchZoneId(i.location) === zoneFilter)
      .filter(i => matchesSearch(i, search))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [issues, tab, search, contractorFilter, zoneFilter])

  const counts = useMemo(() => {
    const base = issues
      .filter(i => !contractorFilter || i.contractorName === contractorFilter)
      .filter(i => !zoneFilter || matchZoneId(i.location) === zoneFilter)
    return TABS.reduce<Record<string, number>>((acc, t) => {
      acc[t.key] = base.filter(i => matchesTab(i, t.key)).length
      return acc
    }, {})
  }, [issues, contractorFilter, zoneFilter])

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex border-b border-[#1e2433] shrink-0 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'px-2.5 sm:px-3 py-2 text-[10px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px shrink-0',
              tab === t.key ? 'border-teal-500 text-teal-400' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={cn(
                'ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold',
                tab === t.key ? 'bg-teal-500/20 text-teal-400' : 'bg-[#1a2235] text-muted-foreground',
              )}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="px-3 py-2 border-b border-[#1e2433] shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm sự cố, nhà thầu, vị trí..."
            className="w-full pl-7 pr-2 py-1.5 text-[10px] bg-[#0b0f1a] border border-[#1e2433] rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-teal-500/50"
          />
        </div>
      </div>

      {zoneFilter && (
        <div className="px-3 py-1.5 border-b border-[#1e2433] bg-teal-500/5 shrink-0 flex items-center justify-between gap-2">
          <p className="text-[10px] text-teal-400">Đang lọc theo khu vực heatmap</p>
        </div>
      )}

      {contractorFilter && (
        <div className="px-3 py-1.5 border-b border-[#1e2433] bg-teal-500/5 shrink-0">
          <p className="text-[10px] text-teal-400">
            Lọc: <span className="font-semibold">{contractorFilter}</span>
          </p>
        </div>
      )}

      <div className={cn(
        'hidden lg:grid gap-x-2 px-3 py-2 border-b border-[#1e2433] shrink-0 sticky top-0 z-10 bg-[#0b0f1a]',
        DESKTOP_COLS,
      )}>
        {['Thời gian', 'Ảnh', 'Người liên quan', 'Nhà thầu/Đội', 'Loại', 'Mức', 'TT', ''].map(h => (
          <span key={h || 'actions'} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
        ))}
      </div>

      <div className={cn(
        'flex-1 overflow-y-auto min-h-0 divide-y divide-[#1e2433]',
        compact && 'max-lg:max-h-[32vh] max-lg:landscape:max-h-[28vh]',
      )}>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-24">
            <p className="text-[11px] text-muted-foreground">Không có sự cố</p>
          </div>
        )}

        {filtered.map(issue => {
          const isSelected = selectedId === issue.id
          return (
            <div key={issue.id}>
              <IssueMobileCard
                issue={issue}
                isSelected={isSelected}
                onSelect={() => onSelectIssue?.(issue)}
                onPlayback={onPlayback}
                showTrial={showTrial}
              />
              <IssueDesktopRow
                issue={issue}
                isSelected={isSelected}
                onSelect={() => onSelectIssue?.(issue)}
                onPlayback={onPlayback}
                showTrial={showTrial}
              />
            </div>
          )
        })}

        {filtered.length > 0 && (
          <div className="flex items-center justify-center py-3">
            <span className="text-[9px] text-muted-foreground/35">— {filtered.length} sự cố —</span>
          </div>
        )}
      </div>
    </div>
  )
}

export { HOUSEKEEPING_ISSUES }
