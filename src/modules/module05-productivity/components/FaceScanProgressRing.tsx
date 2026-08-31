import { cn } from '@/utils/cn'
import {
  FACE_SCAN_POSE_COUNT,
  FACE_SCAN_RING_INDEX_BY_SLOT,
  FACE_SCAN_RING_QUADRANT_LABELS,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanPoses'
import { computeFaceScanRingProgress } from '../utils/patrolFaceScanProgress'

const CX = 50
const CY = 50
const R = 46
const TICK_COUNT = 72
const TICK_LEN = 3.2
const TICK_W = 1.1

interface FaceScanProgressRingProps {
  activeSlot: ScanPoseSlot
  capturedCount: number
  facesRequired: number
  holdProgress: number
  approachProgress?: number
  complete: boolean
  scanLine?: boolean
}

function tickEndpoints(index: number): { x1: number; y1: number; x2: number; y2: number } {
  const angle = (index / TICK_COUNT) * Math.PI * 2 - Math.PI / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const inner = R - TICK_LEN
  return {
    x1: CX + cos * inner,
    y1: CY + sin * inner,
    x2: CX + cos * R,
    y2: CY + sin * R,
  }
}

export function FaceScanProgressRing({
  activeSlot,
  capturedCount,
  facesRequired,
  holdProgress,
  approachProgress = 0,
  complete,
  scanLine = true,
}: FaceScanProgressRingProps) {
  const required = facesRequired || FACE_SCAN_POSE_COUNT
  const ringProgress = computeFaceScanRingProgress(
    capturedCount,
    required,
    holdProgress,
    complete,
    approachProgress,
  )
  const litTicks = Math.round(ringProgress * TICK_COUNT)

  return (
    <div className="relative w-[min(78vw,320px)] aspect-square shrink-0">
      {/* Circular viewport mask — Face ID style cutout */}
      <div
        className="absolute inset-[11%] rounded-full z-[1] pointer-events-none"
        style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.88)' }}
        aria-hidden
      />

      {/* Radial tick progress ring */}
      <svg
        className="absolute inset-0 w-full h-full z-[40] pointer-events-none overflow-visible"
        viewBox="0 0 100 100"
        aria-hidden
      >
        {Array.from({ length: TICK_COUNT }, (_, i) => {
          const { x1, y1, x2, y2 } = tickEndpoints(i)
          const lit = complete || i < litTicks
          const isActiveBand = !complete && i >= capturedCount * (TICK_COUNT / required) && i < litTicks + 1
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={lit
                ? (complete
                  ? '#4ade80'
                  : isActiveBand
                    ? '#4ade80'
                    : holdProgress > 0 || approachProgress > 0.08
                      ? '#86efac'
                      : '#ffffff')
                : 'rgba(255,255,255,0.22)'}
              strokeWidth={isActiveBand ? TICK_W + 0.4 : TICK_W}
              strokeLinecap="round"
              style={{
                opacity: lit ? (complete ? 1 : isActiveBand ? 1 : 0.85) : 0.55,
                filter: lit && !complete ? 'drop-shadow(0 0 2px rgba(255,255,255,0.6))' : undefined,
                transition: 'stroke 0.15s ease, opacity 0.15s ease',
              }}
            />
          )
        })}
      </svg>

      {/* Inner ring edge */}
      <div
        className={cn(
          'absolute inset-[18%] rounded-full z-[20] pointer-events-none border',
          complete ? 'border-green-400/50' : 'border-white/15',
        )}
        aria-hidden
      />

      {/* Scan line animation */}
      {scanLine && !complete && (
        <div
          className="absolute inset-[18%] rounded-full z-[30] pointer-events-none overflow-hidden"
          aria-hidden
        >
          <div className="absolute inset-x-[8%] h-px bg-sky-400/90 shadow-[0_0_8px_rgba(56,189,248,0.9)] animate-face-scan-line" />
        </div>
      )}

      {/* Direction labels on ring — live guide like Face ID */}
      {!complete && (
        <div className="absolute inset-0 z-[38] pointer-events-none" aria-hidden>
          {FACE_SCAN_RING_QUADRANT_LABELS.map((label, idx) => {
            const activeIdx = FACE_SCAN_RING_INDEX_BY_SLOT[activeSlot]
            const active = idx === activeIdx
            const positions = [
              'top-[6%] left-1/2 -translate-x-1/2',
              'right-[5%] top-1/2 -translate-y-1/2',
              'bottom-[6%] left-1/2 -translate-x-1/2',
              'left-[5%] top-1/2 -translate-y-1/2',
            ]
            return (
              <span
                key={label}
                className={cn(
                  'absolute text-[8px] font-bold tracking-[0.18em] uppercase transition-colors duration-200',
                  positions[idx],
                  active ? 'text-sky-300' : 'text-white/20',
                )}
              >
                {label}
              </span>
            )
          })}
        </div>
      )}

      {/* Active slot indicator (subtle) */}
      {!complete && (
        <div className="absolute inset-0 flex items-center justify-center z-[35] pointer-events-none">
          <span className="absolute -bottom-1 text-[8px] font-semibold tracking-widest text-white/35 uppercase">
            {activeSlot}/{required}
          </span>
        </div>
      )}
    </div>
  )
}
