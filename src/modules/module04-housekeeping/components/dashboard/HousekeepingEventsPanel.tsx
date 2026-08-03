import { useMemo, useState } from 'react'
import { Camera, Clock, Search } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { HousekeepingEventRecord } from '../../types/housekeepingAi.types'
import { getHousekeepingScenarioName } from '../../data/housekeepingScenarios'
import {
  GROUP_BADGE,
  GROUP_BORDER_ACCENT,
  SEVERITY_BADGE,
  SEVERITY_LABELS,
  STATUS_LABELS,
  isUnhandledEvent,
} from '../../services/housekeepingDashboard.service'

type FilterTab = 'all' | 'LOG' | 'HK' | 'unhandled' | 'closed'

interface HousekeepingEventsPanelProps {
  all: HousekeepingEventRecord[]
  selectedGroupId?: string | null
  onSelect?: (record: HousekeepingEventRecord) => void
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EventCard({
  record,
  onSelect,
}: {
  record: HousekeepingEventRecord
  onSelect?: (r: HousekeepingEventRecord) => void
}) {
  const snapshotUrl = record.snapshotUrl ?? record.evidence?.fullFrameUrl

  return (
    <article
      role="button"
      tabIndex={0}
      className={cn(
        'group relative flex gap-3 p-2.5 overflow-hidden rounded-lg border border-[#1e2433] border-l-[3px] bg-[#0a0e17]',
        'hover:border-[#2a3855] hover:bg-[#0c1019] transition-colors cursor-pointer',
        GROUP_BORDER_ACCENT[record.groupId],
      )}
      onClick={() => onSelect?.(record)}
      onKeyDown={e => e.key === 'Enter' && onSelect?.(record)}
    >
      <div className="relative shrink-0 w-[72px] h-[54px] overflow-hidden rounded-md border border-[#1e2433] bg-black">
        {snapshotUrl ? (
          <img src={snapshotUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-[#0a0e17]" />
        )}
      </div>

      <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
        <div className="flex flex-wrap items-center gap-1">
          <span className={cn('text-[8px] px-1 py-0.5 rounded border font-semibold', GROUP_BADGE[record.groupId])}>
            {record.groupId}
          </span>
          <span className={cn('text-[8px] px-1 py-0.5 rounded border', SEVERITY_BADGE[record.severity])}>
            {SEVERITY_LABELS[record.severity]}
          </span>
          <span className="text-[8px] px-1 py-0.5 rounded border bg-[#1a2235]/50 text-muted-foreground border-[#1e2433]">
            {STATUS_LABELS[record.status]}
          </span>
        </div>

        <h3 className="text-[11px] font-semibold text-foreground leading-snug line-clamp-2">
          {getHousekeepingScenarioName(record.scenarioId)}
        </h3>

        {record.description && (
          <p className="text-[8px] text-muted-foreground line-clamp-1">{record.description}</p>
        )}

        <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground">
          <Clock className="w-2.5 h-2.5 shrink-0" aria-hidden />
          <span className="tabular-nums">{formatDateTime(record.detectedAt)}</span>
          <span className="text-muted-foreground/30">·</span>
          <Camera className="w-2.5 h-2.5 shrink-0" aria-hidden />
          <span className="truncate">{record.sourceDeviceId}</span>
          <span className="text-muted-foreground/30">·</span>
          <span>{record.roiType}</span>
        </div>
      </div>
    </article>
  )
}

export function HousekeepingEventsPanel({
  all,
  selectedGroupId = null,
  onSelect,
}: HousekeepingEventsPanelProps) {
  const [tab, setTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let rows = all
    if (selectedGroupId) rows = rows.filter(r => r.groupId === selectedGroupId)
    if (tab === 'LOG' || tab === 'HK') rows = rows.filter(r => r.groupId === tab)
    if (tab === 'unhandled') rows = rows.filter(isUnhandledEvent)
    if (tab === 'closed') rows = rows.filter(r => r.status === 'CLOSED')
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(r =>
        getHousekeepingScenarioName(r.scenarioId).toLowerCase().includes(q)
        || r.description?.toLowerCase().includes(q)
        || r.sourceDeviceId.toLowerCase().includes(q),
      )
    }
    return rows
  }, [all, selectedGroupId, tab, search])

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'Tất cả', count: all.length },
    { id: 'LOG', label: 'Logistics', count: all.filter(r => r.groupId === 'LOG').length },
    { id: 'HK', label: 'Housekeeping', count: all.filter(r => r.groupId === 'HK').length },
    { id: 'unhandled', label: 'Chưa xử lý', count: all.filter(isUnhandledEvent).length },
    { id: 'closed', label: 'Đã đóng', count: all.filter(r => r.status === 'CLOSED').length },
  ]

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap gap-1 pb-2 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'text-[8px] px-2 py-1 rounded border transition-colors',
              tab === t.id
                ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                : 'bg-[#0b0f1a] text-muted-foreground border-[#1e2433] hover:border-[#2a3855]',
            )}
          >
            {t.label} {t.count}
          </button>
        ))}
      </div>

      {all.length > 20 && (
        <div className="relative mb-2 shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm sự kiện..."
            className="w-full pl-7 pr-2 py-1.5 text-[9px] rounded border border-[#1e2433] bg-[#0b0f1a] text-foreground placeholder:text-muted-foreground/40"
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin space-y-2">
        {filtered.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-6">Không có sự kiện</p>
        ) : (
          filtered.map(r => <EventCard key={r.id} record={r} onSelect={onSelect} />)
        )}
      </div>
    </div>
  )
}
