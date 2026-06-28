import type { HousekeepingIssue, IssueSeverity } from '@/types/housekeeping'
import type { HousekeepingZoneScore, ScoreTier } from '@/types/housekeeping'
import { getIssueSeverity, HOUSEKEEPING_ISSUES } from '../data/housekeepingIssues'
import { HOUSEKEEPING_ZONE_SCORES } from '../data/housekeepingScores'
import {
  matchZoneId,
  getHeatIntensity,
  type HeatmapZoneCell,
} from '@/modules/module03-safety/services/safetyHeatmap.service'

export type { HeatmapZoneCell }
export { matchZoneId, getHeatIntensity }

const ZONE_LAYOUT: Omit<HeatmapZoneCell, 'count' | 'pending' | 'peakSeverity'>[] = [
  { id: 'gate', label: 'Cổng chính', sublabel: 'Khu A', col: 1, row: 1 },
  { id: 'khu-a', label: 'Khu A', sublabel: 'Thi công', col: 2, row: 1, colSpan: 2 },
  { id: 'khu-b', label: 'Khu B', sublabel: 'Cơ điện', col: 1, row: 2, colSpan: 2, rowSpan: 2 },
  { id: 'khu-c', label: 'Khu C', sublabel: 'Sân thi công', col: 3, row: 2 },
  { id: 'khu-d', label: 'Khu D', sublabel: 'Nguy hiểm', col: 3, row: 3 },
  { id: 'yard', label: 'Bãi vật liệu', sublabel: 'Khu C', col: 1, row: 3 },
  { id: 'crane', label: 'Khu cần cẩu', sublabel: 'Khu D', col: 2, row: 3 },
]

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

function maxSeverity(a: IssueSeverity | null, b: IssueSeverity): IssueSeverity {
  if (!a) return b
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a
}

export function computeHousekeepingHeatmapZones(
  issues: HousekeepingIssue[] = HOUSEKEEPING_ISSUES,
): HeatmapZoneCell[] {
  const counts = new Map<string, { count: number; pending: number; peak: IssueSeverity | null }>()

  for (const cell of ZONE_LAYOUT) {
    counts.set(cell.id, { count: 0, pending: 0, peak: null })
  }

  for (const issue of issues) {
    const zoneId = matchZoneId(issue.location)
    const entry = counts.get(zoneId) ?? counts.get('khu-b')!
    entry.count += 1
    if (issue.status === 'pending') entry.pending += 1
    entry.peak = maxSeverity(entry.peak, getIssueSeverity(issue.type))
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

export interface ScoreZoneCell {
  id: string
  label: string
  sublabel?: string
  score: number
  tier: ScoreTier
  col: number
  row: number
  colSpan?: number
  rowSpan?: number
}

const ZONE_SCORE_MAP: Record<string, string> = {
  gate: 'khu-a',
  'khu-a': 'khu-a',
  'khu-b': 'khu-b',
  'khu-c': 'khu-c',
  yard: 'khu-c',
  'khu-d': 'khu-d',
  crane: 'khu-d',
}

function lookupZoneScore(zoneId: string, scores: HousekeepingZoneScore[]): HousekeepingZoneScore {
  const mainId = ZONE_SCORE_MAP[zoneId] ?? 'khu-b'
  return scores.find(z => z.id === mainId) ?? scores[0]
}

export function computeHousekeepingScoreZones(
  scores: HousekeepingZoneScore[] = HOUSEKEEPING_ZONE_SCORES,
): ScoreZoneCell[] {
  return ZONE_LAYOUT.map(cell => {
    const zoneScore = lookupZoneScore(cell.id, scores)
    return {
      ...cell,
      score: zoneScore.score,
      tier: zoneScore.tier,
    }
  })
}

export function getScoreBarHeight(score: number): number {
  return 8 + (score / 100) * 52
}

export function getScoreZoneColors(tier: ScoreTier): { top: string; front: string; right: string } {
  if (tier === 'good') {
    return {
      top: 'rgba(56,189,248,0.55)',
      front: 'rgba(14,116,180,0.75)',
      right: 'rgba(8,80,130,0.85)',
    }
  }
  if (tier === 'average') {
    return {
      top: 'rgba(249,115,22,0.5)',
      front: 'rgba(190,80,15,0.72)',
      right: 'rgba(140,55,10,0.82)',
    }
  }
  return {
    top: 'rgba(239,68,68,0.5)',
    front: 'rgba(180,45,45,0.75)',
    right: 'rgba(130,30,30,0.85)',
  }
}
