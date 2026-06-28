import type { SafetyViolation, ViolationSeverity } from '@/types/safety'
import { getViolationSeverity, SAFETY_VIOLATIONS } from '../data/safetyViolations'

export interface HeatmapZoneCell {
  id: string
  label: string
  sublabel?: string
  /** grid placement */
  col: number
  row: number
  colSpan?: number
  rowSpan?: number
  count: number
  pending: number
  peakSeverity: ViolationSeverity | null
}

const ZONE_LAYOUT: Omit<HeatmapZoneCell, 'count' | 'pending' | 'peakSeverity'>[] = [
  { id: 'gate', label: 'Cổng chính', sublabel: 'Khu A', col: 1, row: 1 },
  { id: 'khu-a', label: 'Khu A', sublabel: 'Thi công', col: 2, row: 1, colSpan: 2 },
  { id: 'khu-b', label: 'Khu B', sublabel: 'Cơ điện', col: 1, row: 2, colSpan: 2, rowSpan: 2 },
  { id: 'khu-c', label: 'Khu C', sublabel: 'Sân thi công', col: 3, row: 2 },
  { id: 'khu-d', label: 'Khu D', sublabel: 'Nguy hiểm', col: 3, row: 3 },
  { id: 'yard', label: 'Bãi vật liệu', sublabel: 'Khu C', col: 1, row: 3 },
  { id: 'crane', label: 'Khu cần cẩu', sublabel: 'Khu D', col: 2, row: 3 },
]

export function matchZoneId(location: string): string {
  const loc = location.toLowerCase()
  if (loc.includes('ocp1-b') || loc.includes('sân thực hành') || loc.includes('máy móc') || loc.includes('bãi tập kết') || loc.includes('phòng họp b') || loc.includes('phòng y tế')) return 'khu-b'
  if (loc.includes('ocp1-a') || loc.includes('phòng đào tạo a') || loc.includes('sân tập a') || loc.includes('kho vật tư') || loc.includes('phòng giải lao') || loc.includes('bãi đỗ xe')) return 'khu-a'
  if (loc.includes('khu d') || loc.includes('hầm') || loc.includes('cần cẩu') || loc.includes('nguy hiểm')) return 'khu-d'
  if (loc.includes('khu c') || loc.includes('bãi') || loc.includes('sân thi công')) return 'khu-c'
  if (loc.includes('khu b') || loc.includes('tầng') || loc.includes('giàn') || loc.includes('xưởng')) return 'khu-b'
  if (loc.includes('khu a') || loc.includes('cổng') || loc.includes('hành lang')) return 'khu-a'
  if (loc.includes('cổng') || loc.includes('lối ra')) return 'gate'
  if (loc.includes('bãi vật liệu')) return 'yard'
  if (loc.includes('cần cẩu')) return 'crane'
  if (loc.includes('toàn cảnh') || loc.includes('di động')) return 'khu-b'
  return 'khu-b'
}

const SEVERITY_RANK: Record<ViolationSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

function maxSeverity(a: ViolationSeverity | null, b: ViolationSeverity): ViolationSeverity {
  if (!a) return b
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a
}

export function computeHeatmapZones(
  violations: SafetyViolation[] = SAFETY_VIOLATIONS,
): HeatmapZoneCell[] {
  const counts = new Map<string, { count: number; pending: number; peak: ViolationSeverity | null }>()

  for (const cell of ZONE_LAYOUT) {
    counts.set(cell.id, { count: 0, pending: 0, peak: null })
  }

  for (const v of violations) {
    const zoneId = matchZoneId(v.location)
    const entry = counts.get(zoneId) ?? counts.get('khu-b')!
    entry.count += 1
    if (v.status === 'pending') entry.pending += 1
    entry.peak = maxSeverity(entry.peak, getViolationSeverity(v.type))
  }

  return ZONE_LAYOUT.map(cell => {
    const data = counts.get(cell.id)!
    return {
      ...cell,
      count: data.count,
      pending: data.pending,
      peakSeverity: data.peak,
    }
  })
}

export function getHeatIntensity(count: number, max: number): number {
  if (max === 0 || count === 0) return 0
  return Math.min(1, count / max)
}
