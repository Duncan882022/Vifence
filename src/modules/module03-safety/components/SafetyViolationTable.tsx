import { useState, useMemo } from 'react'
import {
  Play, Search, Bell, CheckCircle, Download,
  Building2, MapPin, Clock,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/format'
import type { SafetyViolation, ViolationSeverity } from '@/types/safety'
import type { Event } from '@/types/event'
import {
  getViolationSeverity,
  SAFETY_VIOLATIONS,
  VIOLATION_SEVERITY_COLORS,
  VIOLATION_SEVERITY_LABELS,
  VIOLATION_TYPE_LABELS,
  withViolationVideoUrl,
} from '../data/safetyViolations'
import { getViolationFeedUrl } from '../data/safetyViolationFeeds'
import { useTrialLock } from '@/hooks/useTrialLock'
import { matchZoneId } from '../services/safetyHeatmap.service'
import { Avatar } from '@/components/common/Avatar/Avatar'
import { getPersonAvatarUrl, getPersonAvatarColor } from '@/data/personAvatars'

export type ViolationTabKey = ViolationSeverity | 'all'

const TABS: { key: ViolationTabKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'high', label: 'Cao' },
  { key: 'medium', label: 'TB' },
  { key: 'low', label: 'Thấp' },
]

const DESKTOP_COLS = 'grid-cols-[minmax(0,0.85fr)_44px_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.75fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_80px]'

export function violationToEvent(v: SafetyViolation): Event {
  const enriched = withViolationVideoUrl(v)
  const severity = getViolationSeverity(enriched.type)
  return {
    id: enriched.id,
    type: VIOLATION_TYPE_LABELS[enriched.type],
    description: enriched.description,
    timestamp: enriched.timestamp,
    cameraId: enriched.cameraId,
    cameraName: enriched.cameraName,
    location: enriched.location,
    workerId: enriched.workerId,
    workerName: enriched.workerName,
    contractorName: enriched.contractorName,
    videoUrl: enriched.videoUrl ?? getViolationFeedUrl(enriched.type),
    status: enriched.status,
    severity: severity === 'high' ? 'critical' : 'warning',
    module: 'safety',
  }
}

function matchesTab(v: SafetyViolation, tab: ViolationTabKey): boolean {
  if (tab === 'all') return true
  return getViolationSeverity(v.type) === tab
}

function matchesSearch(v: SafetyViolation, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return [
    v.workerName,
    v.employeeCode,
    v.contractorName,
    v.teamName,
    v.location,
    v.cameraName,
    v.description,
    VIOLATION_TYPE_LABELS[v.type],
  ].some(field => field?.toLowerCase().includes(q))
}

interface RowActionsProps {
  v: SafetyViolation
  onPlayback?: (event: Event) => void
  showTrial: () => void
  compact?: boolean
}

function RowActions({ v, onPlayback, showTrial, compact }: RowActionsProps) {
  return (
    <div className={cn('flex items-center gap-0.5', compact ? 'shrink-0' : 'justify-end')}>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          onPlayback?.(violationToEvent(v))
        }}
        className="p-1.5 lg:p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
        title="Xem lại video"
      >
        <Play className={cn(compact ? 'w-3.5 h-3.5' : 'w-3 h-3')} />
      </button>
      {v.status === 'pending' && (
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
        className="p-1.5 lg:p-1 rounded hover:bg-orange-500/20 text-muted-foreground hover:text-orange-400 transition-colors"
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

function ViolationMobileCard({
  v,
  isSelected,
  onSelect,
  onPlayback,
  showTrial,
}: {
  v: SafetyViolation
  isSelected: boolean
  onSelect?: () => void
  onPlayback?: (event: Event) => void
  showTrial: () => void
}) {
  const severity = getViolationSeverity(v.type)
  const sevCfg = VIOLATION_SEVERITY_COLORS[severity]
  const workerName = v.workerName ?? '—'
  const avatarColor = getPersonAvatarColor(workerName)
  const avatarSrc = v.workerId ? getPersonAvatarUrl(v.workerId, v.workerName) : undefined

  return (
    <div
      onClick={onSelect}
      className={cn(
        'lg:hidden px-3 py-2.5 cursor-pointer transition-colors',
        isSelected ? 'bg-primary/10' : 'hover:bg-[#1a2235]/50',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={workerName} color={avatarColor} src={avatarSrc} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-foreground truncate">{v.workerName ?? '—'}</p>
              {v.employeeCode && (
                <p className="text-[9px] text-muted-foreground/60 truncate">{v.employeeCode}</p>
              )}
            </div>
            <RowActions v={v} onPlayback={onPlayback} showTrial={showTrial} compact />
          </div>
          <p className="text-[10px] text-foreground/90 mt-1 leading-snug">{VIOLATION_TYPE_LABELS[v.type]}</p>
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded', sevCfg.color, sevCfg.bg)}>
              {VIOLATION_SEVERITY_LABELS[severity]}
            </span>
            <span className={cn(
              'text-[8px] font-bold px-1 py-0.5 rounded',
              v.status === 'pending' ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400',
            )}>
              {v.status === 'pending' ? 'Chưa xử lý' : 'Đã xử lý'}
            </span>
          </div>
          <div className="mt-1.5 space-y-0.5 text-[9px] text-muted-foreground">
            <p className="flex items-center gap-1 truncate">
              <Building2 className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{v.contractorName ?? '—'}{v.teamName ? ` · ${v.teamName}` : ''}</span>
            </p>
            <p className="flex items-center gap-1 truncate">
              <MapPin className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{v.location}</span>
            </p>
            <p className="flex items-center gap-1 tabular-nums">
              <Clock className="w-2.5 h-2.5 shrink-0" />
              {formatDateTime(v.timestamp)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ViolationDesktopRow({
  v,
  isSelected,
  onSelect,
  onPlayback,
  showTrial,
}: {
  v: SafetyViolation
  isSelected: boolean
  onSelect?: () => void
  onPlayback?: (event: Event) => void
  showTrial: () => void
}) {
  const severity = getViolationSeverity(v.type)
  const sevCfg = VIOLATION_SEVERITY_COLORS[severity]
  const workerName = v.workerName ?? '—'
  const avatarColor = getPersonAvatarColor(workerName)
  const avatarSrc = v.workerId ? getPersonAvatarUrl(v.workerId, v.workerName) : undefined

  return (
    <div
      onClick={onSelect}
      className={cn(
        'hidden lg:grid gap-x-2 items-center px-3 py-2.5 cursor-pointer transition-colors group',
        DESKTOP_COLS,
        isSelected ? 'bg-primary/10' : 'hover:bg-[#1a2235]/50',
      )}
    >
      <p className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(v.timestamp)}</p>
      <Avatar name={workerName} color={avatarColor} src={avatarSrc} size="sm" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-foreground truncate">{v.workerName ?? '—'}</p>
        {v.employeeCode && <p className="text-[8px] text-muted-foreground/60 truncate">{v.employeeCode}</p>}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-primary/75 truncate">{v.contractorName ?? '—'}</p>
        {v.teamName && <p className="text-[8px] text-muted-foreground/60 truncate">{v.teamName}</p>}
      </div>
      <p className="text-[10px] text-foreground truncate">{VIOLATION_TYPE_LABELS[v.type]}</p>
      <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded whitespace-nowrap w-fit', sevCfg.color, sevCfg.bg)}>
        {VIOLATION_SEVERITY_LABELS[severity]}
      </span>
      <span className={cn(
        'text-[8px] font-bold px-1 py-0.5 rounded w-fit',
        v.status === 'pending' ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400',
      )}>
        {v.status === 'pending' ? 'Chưa xử lý' : 'Đã xử lý'}
      </span>
      <RowActions v={v} onPlayback={onPlayback} showTrial={showTrial} />
    </div>
  )
}

interface SafetyViolationTableProps {
  violations?: SafetyViolation[]
  selectedId?: string
  onSelectViolation?: (v: SafetyViolation) => void
  onPlayback?: (event: Event) => void
  contractorFilter?: string | null
  zoneFilter?: string | null
  compact?: boolean
}

export function SafetyViolationTable({
  violations = SAFETY_VIOLATIONS,
  selectedId,
  onSelectViolation,
  onPlayback,
  contractorFilter,
  zoneFilter,
  compact = false,
}: SafetyViolationTableProps) {
  const [tab, setTab] = useState<ViolationTabKey>('all')
  const [search, setSearch] = useState('')
  const { show: showTrial } = useTrialLock()

  const filtered = useMemo(() => {
    return violations
      .filter(v => matchesTab(v, tab))
      .filter(v => !contractorFilter || v.contractorName === contractorFilter)
      .filter(v => !zoneFilter || matchZoneId(v.location) === zoneFilter)
      .filter(v => matchesSearch(v, search))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [violations, tab, search, contractorFilter, zoneFilter])

  const counts = useMemo(() => {
    const base = violations
      .filter(v => !contractorFilter || v.contractorName === contractorFilter)
      .filter(v => !zoneFilter || matchZoneId(v.location) === zoneFilter)
    return TABS.reduce<Record<string, number>>((acc, t) => {
      acc[t.key] = base.filter(v => matchesTab(v, t.key)).length
      return acc
    }, {})
  }, [violations, contractorFilter, zoneFilter])

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
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={cn(
                'ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold',
                tab === t.key ? 'bg-primary/20 text-primary' : 'bg-[#1a2235] text-muted-foreground',
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
            placeholder="Tìm vi phạm, nhà thầu, vị trí..."
            className="w-full pl-7 pr-2 py-1.5 text-[10px] bg-[#0b0f1a] border border-[#1e2433] rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {zoneFilter && (
        <div className="px-3 py-1.5 border-b border-[#1e2433] bg-orange-500/5 shrink-0 flex items-center justify-between gap-2">
          <p className="text-[10px] text-orange-400">Đang lọc theo khu vực heatmap</p>
        </div>
      )}

      {contractorFilter && (
        <div className="px-3 py-1.5 border-b border-[#1e2433] bg-primary/5 shrink-0">
          <p className="text-[10px] text-primary">
            Lọc: <span className="font-semibold">{contractorFilter}</span>
          </p>
        </div>
      )}

      <div className={cn(
        'hidden lg:grid gap-x-2 px-3 py-2 border-b border-[#1e2433] shrink-0 sticky top-0 z-10 bg-[#0b0f1a]',
        DESKTOP_COLS,
      )}>
        {['Thời gian', 'Ảnh', 'Người vi phạm', 'Nhà thầu/Đội', 'Loại', 'Mức', 'TT', ''].map(h => (
          <span key={h || 'actions'} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
        ))}
      </div>

      <div className={cn(
        'flex-1 overflow-y-auto min-h-0 divide-y divide-[#1e2433]',
        compact && 'max-lg:max-h-[32vh] max-lg:landscape:max-h-[28vh]',
      )}>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-24">
            <p className="text-[11px] text-muted-foreground">Không có vi phạm</p>
          </div>
        )}

        {filtered.map(v => {
          const isSelected = selectedId === v.id
          return (
            <div key={v.id}>
              <ViolationMobileCard
                v={v}
                isSelected={isSelected}
                onSelect={() => onSelectViolation?.(v)}
                onPlayback={onPlayback}
                showTrial={showTrial}
              />
              <ViolationDesktopRow
                v={v}
                isSelected={isSelected}
                onSelect={() => onSelectViolation?.(v)}
                onPlayback={onPlayback}
                showTrial={showTrial}
              />
            </div>
          )
        })}

        {filtered.length > 0 && (
          <div className="flex items-center justify-center py-3">
            <span className="text-[9px] text-muted-foreground/35">— {filtered.length} vi phạm —</span>
          </div>
        )}
      </div>
    </div>
  )
}

export { SAFETY_VIOLATIONS }
