/** Ngày demo cố định (playback) — filter sự kiện dùng getSafetyTodayDate() */
export const SAFETY_DEMO_TODAY = '2026-07-26'
export const SAFETY_DEMO_YESTERDAY = '2026-07-25'
export const SAFETY_DEMO_WEEK_START = '2026-07-20'
export const SAFETY_DEMO_MONTH_START = '2026-06-26'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Ngày hiện tại theo lịch — dùng filter / count sự kiện AI live */
export function getSafetyTodayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function getSafetyYesterdayDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
