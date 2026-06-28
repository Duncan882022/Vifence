import { useMemo, useState } from 'react'
import { Search, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Avatar } from '@/components/common/Avatar/Avatar'
import { getPersonAvatarUrl, getPersonAvatarColor } from '@/data/personAvatars'
import { useTrialLock } from '@/hooks/useTrialLock'
import {
  ACCESS_EVENTS,
  countAccessEventsByTab,
  filterAccessEvents,
} from '../data/accessEvents'
import type { AccessEvent, AccessEventTab } from '@/types/access'

const TABS: { key: AccessEventTab; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'person', label: 'Người' },
  { key: 'vehicle', label: 'Xe' },
  { key: 'guest', label: 'Khách' },
]

const LIST_COLS = 'grid-cols-[32px_minmax(0,1.1fr)_minmax(0,0.9fr)_52px_52px_56px_minmax(0,0.7fr)_48px_40px]'

function PresenceDot({ presence }: { presence: AccessEvent['presence'] }) {
  const inside = presence === 'inside'
  return (
    <span className="inline-flex items-center gap-1 text-[9px]">
      <span className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        inside ? 'bg-green-400 animate-pulse' : 'bg-gray-500',
      )} />
      <span className={inside ? 'text-green-400' : 'text-muted-foreground'}>
        {inside ? 'Trong' : 'Ngoài'}
      </span>
    </span>
  )
}

interface AccessEventTableProps {
  selectedId?: string
  onSelectEvent?: (event: AccessEvent) => void
}

export function AccessEventTable({ selectedId, onSelectEvent }: AccessEventTableProps) {
  const [tab, setTab] = useState<AccessEventTab>('all')
  const [query, setQuery] = useState('')
  const { show: showTrial } = useTrialLock()

  const counts = useMemo(() => countAccessEventsByTab(ACCESS_EVENTS), [])
  const filtered = useMemo(
    () => filterAccessEvents(ACCESS_EVENTS, tab, query),
    [tab, query],
  )

  const showSearch = ACCESS_EVENTS.length > 20

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1e2433] shrink-0 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'px-2.5 py-1 text-[9px] font-semibold rounded whitespace-nowrap transition-colors shrink-0 border-b-2 -mb-[9px] pb-2',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={cn(
                'ml-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold',
                tab === t.key ? 'bg-primary/20 text-primary' : 'bg-[#1a2235] text-muted-foreground',
              )}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {showSearch && (
        <div className="px-3 py-2 border-b border-[#1e2433] shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm tên, ID, nhà thầu, cổng…"
              className="w-full pl-7 pr-2 py-1.5 text-[10px] bg-[#1a2235] border border-[#1e2433] rounded text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
        </div>
      )}

      <div className={cn(
        'hidden lg:grid gap-x-2 px-3 py-2 border-b border-[#1e2433] shrink-0 bg-[#0b0f1a]',
        LIST_COLS,
      )}>
        {['Ảnh', 'Tên/ID', 'Nhà thầu/Loại', 'Giờ vào', 'Giờ ra', 'Trạng thái', 'Cổng', 'Thời gian', ''].map(h => (
          <span key={h} className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{h}</span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[#1e2433]">
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-24">
            <p className="text-[11px] text-muted-foreground">Không có dữ liệu</p>
          </div>
        )}

        {filtered.map(event => {
          const avatarId = event.avatarPersonId ?? event.id
          const avatarColor = getPersonAvatarColor(event.name)
          const avatarSrc = event.subjectType === 'person'
            ? getPersonAvatarUrl(avatarId, event.name)
            : undefined

          return (
            <div
              key={event.id}
              onClick={() => onSelectEvent?.(event)}
              className={cn(
                'grid gap-x-2 items-center px-3 py-2 cursor-pointer hover:bg-[#1a2235]/50 transition-colors group',
                'max-lg:grid-cols-[32px_1fr_auto]',
                'lg:grid-cols-[32px_minmax(0,1.1fr)_minmax(0,0.9fr)_52px_52px_56px_minmax(0,0.7fr)_48px_40px]',
                selectedId === event.id && 'bg-primary/10',
              )}
            >
              {event.subjectType === 'person' ? (
                <Avatar name={event.name} color={avatarColor} src={avatarSrc} size="sm" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <span className="text-[8px] font-bold text-amber-400">
                    {event.subjectType === 'vehicle' ? 'Xe' : 'Kh'}
                  </span>
                </div>
              )}

              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-foreground truncate leading-tight">{event.name}</p>
                <p className="text-[9px] text-muted-foreground/60 truncate tabular-nums">{event.subjectId}</p>
                <p className="lg:hidden text-[9px] text-muted-foreground/70 mt-0.5 truncate">
                  {event.contractorOrType} · {event.gate}
                </p>
              </div>

              <div className="hidden lg:block min-w-0">
                <p className="text-[10px] text-foreground/90 truncate">{event.contractorOrType}</p>
              </div>
              <span className="hidden lg:block text-[10px] text-foreground tabular-nums">{event.timeIn}</span>
              <span className="hidden lg:block text-[10px] text-muted-foreground tabular-nums">{event.timeOut ?? '—'}</span>
              <div className="hidden lg:block">
                <PresenceDot presence={event.presence} />
              </div>
              <span className="hidden lg:block text-[10px] text-muted-foreground truncate">{event.gate}</span>
              <span className="hidden lg:block text-[10px] text-muted-foreground tabular-nums">{event.duration}</span>

              <button
                type="button"
                onClick={e => { e.stopPropagation(); showTrial() }}
                className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100 max-lg:opacity-100"
                title="Chi tiết"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
