export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface KPIData {
  label: string
  value: number | string
  unit?: string
  /** Secondary line under value, e.g. denominator context */
  detail?: string
  change?: number
  changeType?: 'increase' | 'decrease' | 'neutral'
  /** Value at same time yesterday — shown in comparison row */
  previousValue?: number | string
  /** When false, an increase is shown as negative (e.g. exceptions) */
  higherIsBetter?: boolean
  /** Suffix for change display, e.g. "điểm %" */
  changeUnit?: string
  icon?: string
}
