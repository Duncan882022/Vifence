import dayjs from 'dayjs'
import 'dayjs/locale/vi'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)
dayjs.locale('vi')

export function formatDateTime(date: string | Date): string {
  return dayjs(date).format('DD/MM/YYYY HH:mm')
}

/** Sự kiện ATLĐ — dd/mm/yyyy - hh:mm */
export function formatEventDateTime(date: string | Date): string {
  return dayjs(date).format('DD/MM/YYYY - HH:mm')
}

export function formatDate(date: string | Date): string {
  return dayjs(date).format('DD/MM/YYYY')
}

export function formatTime(date: string | Date): string {
  return dayjs(date).format('HH:mm:ss')
}

export function formatTimeShort(date: string | Date): string {
  return dayjs(date).format('HH:mm')
}

export function formatRelative(date: string | Date): string {
  return dayjs(date).fromNow()
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}
