import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  OVERLAY_CYCLE_DEFAULTS,
  OVERLAY_SCAN_TIER_ORDER,
  type OverlayScanTierGroup,
} from '../utils/overlayScanOrder'
import type { RoiCyclePhase } from './useRoiCycleDisplay'

export interface OverlayCycleSyncValue {
  enabled: boolean
  phase: RoiCyclePhase
  /** Index trong OVERLAY_SCAN_TIER_ORDER — subject = 0, condition = 1. */
  tierIndex: number
  activeTier: OverlayScanTierGroup | null
  stepMs: number
  holdMs: number
  /** Tăng mỗi lần reset chu kỳ — overlay reset fingerprint theo tick. */
  cycleTick: number
}

const DEFAULT_SYNC: OverlayCycleSyncValue = {
  enabled: false,
  phase: 'scan',
  tierIndex: 0,
  activeTier: 'subject',
  stepMs: OVERLAY_CYCLE_DEFAULTS.stepMs,
  holdMs: OVERLAY_CYCLE_DEFAULTS.holdMs,
  cycleTick: 0,
}

const OverlayCycleContext = createContext<OverlayCycleSyncValue>(DEFAULT_SYNC)

interface OverlayCycleProviderProps {
  enabled?: boolean
  stepMs?: number
  holdMs?: number
  children: ReactNode
}

/**
 * Clock quét ROI dùng chung — mọi overlay trên cùng camera bước subject → condition → violation cùng lúc.
 */
export function OverlayCycleProvider({
  enabled = true,
  stepMs = OVERLAY_CYCLE_DEFAULTS.stepMs,
  holdMs = OVERLAY_CYCLE_DEFAULTS.holdMs,
  children,
}: OverlayCycleProviderProps) {
  const [phase, setPhase] = useState<RoiCyclePhase>('scan')
  const [tierIndex, setTierIndex] = useState(0)
  const [cycleTick, setCycleTick] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setPhase('violation')
      setTierIndex(0)
      return
    }

    setPhase('scan')
    setTierIndex(0)
    setCycleTick(t => t + 1)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    if (phase === 'violation') {
      const timer = window.setTimeout(() => {
        setPhase('scan')
        setTierIndex(0)
        setCycleTick(t => t + 1)
      }, holdMs)
      return () => window.clearTimeout(timer)
    }

    const timer = window.setTimeout(() => {
      setTierIndex(prev => {
        if (prev + 1 >= OVERLAY_SCAN_TIER_ORDER.length) {
          setPhase('violation')
          return 0
        }
        return prev + 1
      })
    }, stepMs)
    return () => window.clearTimeout(timer)
  }, [enabled, phase, tierIndex, stepMs, holdMs])

  const value = useMemo<OverlayCycleSyncValue>(() => ({
    enabled,
    phase,
    tierIndex,
    activeTier: phase === 'scan' ? OVERLAY_SCAN_TIER_ORDER[tierIndex] ?? null : null,
    stepMs,
    holdMs,
    cycleTick,
  }), [enabled, phase, tierIndex, stepMs, holdMs, cycleTick])

  return (
    <OverlayCycleContext.Provider value={value}>
      {children}
    </OverlayCycleContext.Provider>
  )
}

export function useOverlayCycleSync(): OverlayCycleSyncValue {
  return useContext(OverlayCycleContext)
}
