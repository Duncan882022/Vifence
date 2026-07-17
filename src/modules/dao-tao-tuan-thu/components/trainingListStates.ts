/** Shared list UI — đồng bộ Khóa học ↔ Sự kiện ↔ Camera */

export const TRAINING_LIST_EMPTY_TEXT = 'Không có dữ liệu'

export const TRAINING_LIST_STATE_WRAP =
  'flex flex-1 items-center justify-center min-h-[120px] w-full px-4 py-6'

export const TRAINING_LIST_STATE_TEXT =
  'text-[10px] leading-relaxed text-muted-foreground/60 text-center max-w-[220px] mx-auto'

export const TRAINING_LIST_HEADER_ROW =
  'border-b border-[#1e2433] shrink-0 bg-[#0b0f1a] sticky top-0 z-10'

export const TRAINING_LIST_HEADER_TEXT =
  'text-[9px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap truncate min-w-0'

/** Khóa học listing — cột đầu 28px (khớp avatar slot Sự kiện) + cột tỷ lệ minmax */
export const COURSE_LIST_GRID =
  'grid-cols-[28px_minmax(0,1.2fr)_minmax(0,0.55fr)_minmax(0,0.35fr)_minmax(0,1fr)]'

export const TRAINING_TAB_BAR =
  'flex border-b border-[#1e2433] shrink-0 overflow-x-auto scrollbar-none'
