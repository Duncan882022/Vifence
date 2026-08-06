import { formatVnDate, formatVnDateOffsetDays, getSharedEventDateParam } from '@/utils/vnDateTime'

/** Ngày demo cố định (playback mock cũ) */
export const SAFETY_DEMO_TODAY = '2026-07-26'
export const SAFETY_DEMO_YESTERDAY = '2026-07-25'
export const SAFETY_DEMO_WEEK_START = '2026-07-20'
export const SAFETY_DEMO_MONTH_START = '2026-06-26'

/** Ngày filter sự kiện AI — ưu tiên ?date= trên URL, mặc định theo giờ VN (đồng bộ mọi trình duyệt). */
export function getSafetyTodayDate(): string {
  const shared = getSharedEventDateParam()
  if (shared) return shared
  return formatVnDate()
}

export function getSafetyYesterdayDate(): string {
  const shared = getSharedEventDateParam()
  if (shared) return formatVnDateOffsetDays(-1, shared)
  return formatVnDateOffsetDays(-1)
}
