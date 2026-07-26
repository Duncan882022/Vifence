import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import dayjs from 'dayjs'
import { useRef } from 'react'
import { cn } from '@/utils/cn'

interface PlaybackDatePickerProps {
  date: string
  onDateChange: (date: string) => void
  maxDate?: string
  compact?: boolean
}

export function PlaybackDatePicker({
  date,
  onDateChange,
  maxDate = dayjs().format('YYYY-MM-DD'),
  compact = false,
}: PlaybackDatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const current = dayjs(date)
  const label = current.format('DD/MM/YYYY')
  const isToday = date === maxDate

  const shiftDay = (delta: number) => {
    const next = current.add(delta, 'day')
    if (next.isAfter(dayjs(maxDate), 'day')) return
    onDateChange(next.format('YYYY-MM-DD'))
  }

  const openPicker = () => {
    const input = inputRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') input.showPicker()
    else input.click()
  }

  return (
    <div className={cn(
      'flex items-center min-w-0',
      compact ? 'gap-1 shrink-0' : 'justify-between gap-2 flex-wrap',
    )}>
      {!compact && (
        <span className="text-[8px] font-semibold text-muted-foreground/70 uppercase tracking-wider shrink-0">
          Ngày xem lại
        </span>
      )}
      <div className={cn('flex items-center min-w-0', compact ? 'gap-1' : 'gap-1.5')}>
        <div className="flex items-center rounded-md border border-[#1e2433] bg-[#0b0f1a] p-0.5">
          <button
            type="button"
            aria-label="Ngày trước"
            onClick={() => shiftDay(-1)}
            className={cn(
              'rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors',
              compact ? 'p-1' : 'p-1.5',
            )}
          >
            <ChevronLeft className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          </button>
          <button
            type="button"
            onClick={openPicker}
            className={cn(
              'relative flex items-center rounded font-semibold text-amber-400 hover:bg-[#1a2235] tabular-nums transition-colors justify-center',
              compact
                ? 'gap-1 px-1.5 py-1 text-[10px] min-w-[88px]'
                : 'gap-1.5 px-2.5 py-1.5 text-[11px] min-w-[104px]',
            )}
          >
            <Calendar className={cn('shrink-0 opacity-80', compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
            {label}
            <input
              ref={inputRef}
              type="date"
              value={date}
              max={maxDate}
              onChange={e => {
                if (e.target.value) onDateChange(e.target.value)
              }}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer [color-scheme:dark]"
              aria-label="Chọn ngày"
            />
          </button>
          <button
            type="button"
            aria-label="Ngày sau"
            disabled={isToday}
            onClick={() => shiftDay(1)}
            className={cn(
              'rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none',
              compact ? 'p-1' : 'p-1.5',
            )}
          >
            <ChevronRight className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          </button>
        </div>
        {!isToday && !compact && (
          <button
            type="button"
            onClick={() => onDateChange(maxDate)}
            className="shrink-0 text-[8px] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            Hôm nay
          </button>
        )}
      </div>
    </div>
  )
}
