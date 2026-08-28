/**
 * Module 05 — heatmap time window helpers.
 */

export type HeatmapTimeWindow = 'live' | '5m' | '15m' | '1h' | 'shift'

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

export function isVerifiedWorkerLabel(label?: string | null): boolean {
  if (!label) return false
  const t = label.trim()
  if (!t || t === 'person' || t === 'unknown') return false
  if (t.startsWith('sgc-') || t.startsWith('obj-') || t.startsWith('track-')) return false
  if (/^p[-_]?\d+$/i.test(t)) return false
  if (/^[0-9a-f]{6,16}$/i.test(t)) return false
  if (/^p\d+:/i.test(t) || t.includes(':person:')) return false
  return true
}
