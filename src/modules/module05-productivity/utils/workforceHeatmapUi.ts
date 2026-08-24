/**
 * Module 05 — temporary UI helpers aligned with
 * specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md
 */

export type HeatmapTimeWindow = 'live' | '5m' | '15m' | '1h' | 'shift'

export const HEATMAP_TIME_TABS: { key: HeatmapTimeWindow; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: '5m', label: '5 phút' },
  { key: '15m', label: '15 phút' },
  { key: '1h', label: '1 giờ' },
  { key: 'shift', label: 'Ca' },
]

/** Milliseconds lookback; `live` uses TTL window (ACTIVE+RECENT). */
export function heatmapWindowMs(window: HeatmapTimeWindow): number {
  switch (window) {
    case 'live':
      return 120_000
    case '5m':
      return 5 * 60_000
    case '15m':
      return 15 * 60_000
    case '1h':
      return 60 * 60_000
    case 'shift':
      return 8 * 60 * 60_000
  }
}

export type ObservabilityBand = 'HIGH' | 'MEDIUM' | 'LOW'

/** Stub until Scene Observability engine ships. */
export function stubObservabilityBand(opts: {
  personCount: number
  historicalDotCount: number
  hasGps: boolean
}): ObservabilityBand {
  if (!opts.hasGps) return 'LOW'
  if (opts.personCount >= 8 || opts.historicalDotCount >= 12) return 'HIGH'
  if (opts.personCount >= 3 || opts.historicalDotCount >= 4) return 'MEDIUM'
  if (opts.personCount <= 1 && opts.historicalDotCount <= 2) return 'LOW'
  return 'MEDIUM'
}

export function isVerifiedWorkerLabel(label?: string | null): boolean {
  if (!label) return false
  const t = label.trim()
  if (!t || t === 'person' || t === 'unknown') return false
  if (t.startsWith('sgc-') || t.startsWith('obj-') || t.startsWith('track-')) return false
  if (/^p[-_]?\d+$/i.test(t)) return false
  // Event uuid / track hash — không phải tên gallery
  if (/^[0-9a-f]{6,16}$/i.test(t)) return false
  if (/^p\d+:/i.test(t) || t.includes(':person:')) return false
  return true
}

/** @deprecated Dùng PatrolEventsPanel FILTER_TABS (object/person/identity). */
export type WorkforceEventCategory = 'all' | 'object' | 'person' | 'identity'
