import { useEffect, useMemo, useState } from 'react'
import {
  defaultScanRank,
  overlayScanTierGroup,
  OVERLAY_CYCLE_DEFAULTS,
  type OverlayScanTierGroup,
} from '../utils/overlayScanOrder'
import { useOverlayCycleSync } from './useOverlayCycleSync'

export type RoiCyclePhase = 'scan' | 'violation'

type BboxItem = { behavior: string; bbox: number[] }

export interface RoiCycleOptions<T extends BboxItem = BboxItem> {
  /** Bật chế độ quét ROI — mặc định true */
  enabled?: boolean
  /** Thời gian nháy mỗi ROI ngữ cảnh (ms) */
  stepMs?: number
  /** Thời gian giữ vi phạm trước khi quét lại (ms) */
  holdMs?: number
  /**
   * @deprecated Dùng OverlayCycleProvider — luôn quét subject → condition → violation.
   */
  leadWithViolations?: boolean
  /** Thứ tự quét ngữ cảnh — rank thấp = subject, rank ≥100 = condition. */
  getScanRank?: (item: T) => number
  /** Thứ tự hiển thị vi phạm khi giữ phase violation. */
  getViolationRank?: (item: T) => number
}

function fingerprintItems(items: BboxItem[]): string {
  return items
    .map((d, i) => `${d.behavior}-${d.bbox.map(v => Math.round(v)).join(',')}-${i}`)
    .join('|')
}

function sortByRank<T extends BboxItem>(items: T[], rankFn: (item: T) => number): T[] {
  return [...items].sort((a, b) => {
    const diff = rankFn(a) - rankFn(b)
    if (diff !== 0) return diff
    return a.bbox[0] - b.bbox[0]
  })
}

function itemsInTier<T extends BboxItem>(
  items: T[],
  tier: OverlayScanTierGroup,
  rankFn: (item: T) => number,
): T[] {
  return items.filter(d => overlayScanTierGroup(rankFn(d)) === tier)
}

/**
 * Quét ROI theo 3 tầng: người/máy (subject) → điều kiện (condition) → giữ vi phạm.
 * Mỗi tầng hiện đủ bbox cùng lúc; các nhóm overlay đồng bộ qua OverlayCycleProvider.
 */
export function useRoiCycleDisplay<T extends BboxItem>(
  items: T[],
  isViolation: (item: T) => boolean,
  options: RoiCycleOptions<T> = {},
): { visible: T[]; phase: RoiCyclePhase; pulse: boolean } {
  const {
    enabled = true,
    stepMs = OVERLAY_CYCLE_DEFAULTS.stepMs,
    holdMs = OVERLAY_CYCLE_DEFAULTS.holdMs,
    leadWithViolations = false,
    getScanRank,
    getViolationRank,
  } = options

  const scanRank = getScanRank ?? ((d: T) => defaultScanRank(d.behavior))
  const violationRank = getViolationRank ?? scanRank
  const sync = useOverlayCycleSync()
  const useSharedClock = sync.enabled

  const fp = useMemo(() => fingerprintItems(items), [items])
  const contextItems = useMemo(
    () => sortByRank(items.filter(d => !isViolation(d)), scanRank),
    [items, isViolation, scanRank],
  )
  const violationItems = useMemo(
    () => sortByRank(items.filter(d => isViolation(d)), violationRank),
    [items, isViolation, violationRank],
  )

  const subjectItems = useMemo(
    () => itemsInTier(contextItems, 'subject', scanRank),
    [contextItems, scanRank],
  )
  const conditionItems = useMemo(
    () => itemsInTier(contextItems, 'condition', scanRank),
    [contextItems, scanRank],
  )

  const [phase, setPhase] = useState<RoiCyclePhase>('scan')
  const [tierIndex, setTierIndex] = useState(() =>
    subjectItems.length > 0 ? 0 : conditionItems.length > 0 ? 1 : 0,
  )

  useEffect(() => {
    if (useSharedClock) return
    if (leadWithViolations && violationItems.length > 0) {
      setPhase('violation')
    } else {
      setPhase('scan')
    }
    setTierIndex(subjectItems.length > 0 ? 0 : conditionItems.length > 0 ? 1 : 0)
  }, [fp, leadWithViolations, violationItems.length, useSharedClock, sync.cycleTick, subjectItems.length, conditionItems.length])

  useEffect(() => {
    if (useSharedClock) return
    if (!enabled || items.length === 0) return

    if (phase === 'scan') {
      if (subjectItems.length === 0 && conditionItems.length === 0) {
        setPhase('violation')
        return
      }
      const timer = window.setTimeout(() => {
        if (tierIndex === 0) {
          if (conditionItems.length > 0) {
            setTierIndex(1)
          } else {
            setPhase('violation')
          }
          return
        }
        setPhase('violation')
      }, stepMs)
      return () => window.clearTimeout(timer)
    }

    const timer = window.setTimeout(() => {
      setPhase('scan')
      setTierIndex(subjectItems.length > 0 ? 0 : conditionItems.length > 0 ? 1 : 0)
    }, holdMs)
    return () => window.clearTimeout(timer)
  }, [
    useSharedClock,
    enabled,
    items.length,
    phase,
    tierIndex,
    subjectItems.length,
    conditionItems.length,
    stepMs,
    holdMs,
  ])

  if (!enabled) {
    return { visible: items, phase: 'violation', pulse: false }
  }

  const activePhase = useSharedClock ? sync.phase : phase
  const activeTierIndex = useSharedClock ? sync.tierIndex : tierIndex

  if (activePhase === 'violation') {
    return { visible: violationItems, phase: 'violation', pulse: false }
  }

  const activeTier: OverlayScanTierGroup = activeTierIndex === 0 ? 'subject' : 'condition'
  const tierItems = activeTier === 'subject' ? subjectItems : conditionItems

  if (tierItems.length === 0) {
    return { visible: [], phase: 'scan', pulse: false }
  }

  return {
    visible: tierItems,
    phase: 'scan',
    pulse: true,
  }
}
