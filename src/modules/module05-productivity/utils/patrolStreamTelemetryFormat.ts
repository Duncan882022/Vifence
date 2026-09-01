import { formatVnDisplayTimestamp } from '@/utils/vnDateTime'

export function formatPatrolTelemetryCoordinate(
  value: number,
  axis: 'lat' | 'lng',
): string {
  const abs = Math.abs(value)
  const suffix = axis === 'lat'
    ? (value >= 0 ? 'N' : 'S')
    : (value >= 0 ? 'E' : 'W')
  return `${abs.toFixed(4)}°${suffix}`
}

export function formatPatrolTelemetryHeading(heading: number): string {
  const deg = ((heading % 360) + 360) % 360
  return `${Math.round(deg)}°`
}

export function formatPatrolStreamTelemetryDatetime(date: Date): string {
  return formatVnDisplayTimestamp(date)
}
