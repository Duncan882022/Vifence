import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'

interface EquipmentTablePaginationProps {
  startRow: number
  endRow: number
  total: number
  pageSize: number
  onPageSizeChange: (size: number) => void
  pageNumbers: number[]
  currentPage: number
  onPageChange: (page: number) => void
  onPrevious: () => void
  onNext: () => void
  canPrevious: boolean
  canNext: boolean
  unitLabel?: string
}

/** Footer phân trang bảng MMTB — stack trên mobile, hàng ngang từ sm. */
export function EquipmentTablePagination({
  startRow,
  endRow,
  total,
  pageSize,
  onPageSizeChange,
  pageNumbers,
  currentPage,
  onPageChange,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
  unitLabel = 'thiết bị',
}: EquipmentTablePaginationProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2 border-t border-[#1e2433] shrink-0 bg-[#0b0f1a]/40">
      <span className="text-[10px] text-muted-foreground/70 tabular-nums">
        Hiển thị{' '}
        <span className="text-foreground/80 font-medium">{startRow}–{endRow}</span>
        {' / '}
        <span className="text-foreground/80 font-medium">{total}</span>
        {' '}{unitLabel}
      </span>

      <div className="flex items-center justify-between sm:justify-end gap-1 flex-wrap">
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="mr-auto sm:mr-1.5 px-2 py-1 rounded-lg bg-[#060b14] border border-[#1e2433] text-[10px] text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none"
        >
          {[10, 20, 50].map(n => (
            <option key={n} value={n}>{n} / trang</option>
          ))}
        </select>

        <button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious}
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#1e2433] text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[#1a2235] hover:enabled:text-foreground hover:enabled:border-[#2a3855]"
          aria-label="Trang trước"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {pageNumbers.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={cn(
              'min-w-[28px] h-7 rounded-lg text-[10px] font-bold tabular-nums px-1.5 transition-colors',
              p === currentPage
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                : 'text-muted-foreground hover:bg-[#1a2235] hover:text-foreground border border-transparent hover:border-[#1e2433]',
            )}
          >
            {p + 1}
          </button>
        ))}

        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#1e2433] text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[#1a2235] hover:enabled:text-foreground hover:enabled:border-[#2a3855]"
          aria-label="Trang sau"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
