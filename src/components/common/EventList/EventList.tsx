import { useState, useMemo } from 'react'
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/format'
import { StatusBadge, getEventStatusVariant, getEventSeverityVariant } from '@/components/common/StatusBadge/StatusBadge'
import type { Event } from '@/types/event'

interface EventListProps {
  events: Event[]
  onSelectEvent?: (event: Event) => void
  selectedEventId?: string
  className?: string
}

const PAGE_SIZE = 10

export function EventList({ events, onSelectEvent, selectedEventId, className }: EventListProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    let result = events
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(e =>
        e.description.toLowerCase().includes(q) ||
        e.workerName?.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'all') {
      result = result.filter(e => e.status === statusFilter)
    }
    return result
  }, [events, search, statusFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className={cn('flex flex-col flex-1 min-h-0 gap-3', className)}>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm kiếm sự kiện..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full bg-muted border border-border rounded-md pl-7 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">Tất cả</option>
          <option value="pending">Chưa xử lý</option>
          <option value="processed">Đã xử lý</option>
        </select>
        <button className="p-1.5 rounded-md bg-muted border border-border hover:bg-accent transition-colors">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1">
        {paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <p className="text-sm">Không có sự kiện nào</p>
          </div>
        ) : (
          paginated.map((event) => (
            <div
              key={event.id}
              onClick={() => onSelectEvent?.(event)}
              className={cn(
                'p-3 rounded-md border cursor-pointer transition-colors',
                selectedEventId === event.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30 hover:bg-accent/50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">{event.type}</span>
                    <StatusBadge variant={getEventSeverityVariant(event.severity)} label={event.severity === 'critical' ? 'Nghiêm trọng' : event.severity === 'warning' ? 'Cảnh báo' : 'Thông tin'} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.description}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {event.workerName && (
                      <span className="text-[11px] text-muted-foreground">{event.workerName}</span>
                    )}
                    <span className="text-[11px] text-muted-foreground">{event.location}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge variant={getEventStatusVariant(event.status)} label={event.status === 'processed' ? 'Đã xử lý' : 'Chưa xử lý'} />
                  <span className="text-[10px] text-muted-foreground">{formatDateTime(event.timestamp)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between shrink-0 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">{filtered.length} sự kiện</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded hover:bg-accent disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <span className="text-xs text-muted-foreground px-2">{page}/{totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded hover:bg-accent disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
