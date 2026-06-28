import type { ScoreTier } from '@/types/housekeeping'
import type { ViolationSeverity } from '@/types/safety'

export type DigitalTwinMapMode = 'violations' | 'score' | 'traffic'

export interface DigitalTwinZone {
  id: string
  label: string
  sublabel?: string
  /** 0–1 heat intensity */
  intensity: number
  /** Heat / overlay color (hex) */
  color: string
  /** Optional metric shown on zone label */
  value?: number | string
  /** Optional badge count (e.g. pending violations) */
  badge?: number
  /** Point heat (traffic mode) vs zone polygon */
  heatShape?: 'zone' | 'point'
  cx?: number
  cy?: number
  polygon?: { x: number; y: number }[]
}

export interface LegendItem {
  color: string
  label: string
}

export function polygonPoints(pts: { x: number; y: number }[]): string {
  return pts.map(p => `${p.x},${p.y}`).join(' ')
}

export function getViolationHeatColor(
  intensity: number,
  peakSeverity: ViolationSeverity | null,
): string {
  if (intensity === 0) return '#64748b'
  if (peakSeverity === 'high' || intensity > 0.7) return '#ef4444'
  if (peakSeverity === 'medium' || intensity > 0.4) return '#f97316'
  return '#fbbf24'
}

export function getScoreHeatColor(tier: ScoreTier): string {
  if (tier === 'good') return '#22c55e'
  if (tier === 'average') return '#f97316'
  return '#ef4444'
}

export function getScoreHeatIntensity(tier: ScoreTier, score: number): number {
  if (tier === 'poor') return 0.75 + (60 - score) / 120
  if (tier === 'average') return 0.45 + (80 - score) / 80
  return 0.2 + score / 500
}

export function getLegendItems(mode: DigitalTwinMapMode): LegendItem[] {
  if (mode === 'score') {
    return [
      { color: 'bg-emerald-500/60', label: '≥ 80 — Tốt' },
      { color: 'bg-orange-500/60', label: '60–79 — Trung bình' },
      { color: 'bg-red-500/60', label: '< 60 — Kém' },
    ]
  }
  if (mode === 'traffic') {
    return [
      { color: 'bg-emerald-500/60', label: 'Thấp' },
      { color: 'bg-orange-500/60', label: 'Trung bình' },
      { color: 'bg-red-500/60', label: 'Cao' },
    ]
  }
  return [
    { color: 'bg-slate-600/60', label: 'Không' },
    { color: 'bg-amber-500/50', label: 'Thấp' },
    { color: 'bg-orange-500/60', label: 'TB' },
    { color: 'bg-red-500/70', label: 'Cao' },
  ]
}
