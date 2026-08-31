import { cn } from '@/utils/cn'
import {
  FACE_SCAN_RING_INDEX_BY_SLOT,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanPoses'

/** Số vạch radial — giống Face ID (~72 tick). */
const DASH_COUNT = 72
const DASHES_PER_QUADRANT = DASH_COUNT / 4

const CX = 50
const CY = 50
const R_INNER = 40.5
const R_OUTER = 47.5

/** Góc phần tư 0→3: trên · phải · dưới · trái → slot gallery 1 · 3 · 4 · 2 */
const QUADRANT_SLOTS: ScanPoseSlot[] = [1, 3, 4, 2]

interface FaceScanFourPoseRingProps {
  activeSlot: ScanPoseSlot
  capturedBySlot: boolean[]
  holdProgress: number
  complete: boolean
  className?: string
}

function quadrantForDashIndex(index: number): number {
  return Math.floor(index / DASHES_PER_QUADRANT) % 4
}

function slotForDashIndex(index: number): ScanPoseSlot {
  return QUADRANT_SLOTS[quadrantForDashIndex(index)]
}

function dashAngleRad(index: number): number {
  const deg = (index / DASH_COUNT) * 360 - 90
  return (deg * Math.PI) / 180
}

function dashStyle(
  index: number,
  activeSlot: ScanPoseSlot,
  capturedBySlot: boolean[],
  holdProgress: number,
  complete: boolean,
): { stroke: string; opacity: number } {
  const slot = slotForDashIndex(index)
  const captured = capturedBySlot[slot - 1] || complete
  const active = slot === activeSlot && !complete && !captured

  if (complete || captured) {
    return { stroke: '#4ade80', opacity: 0.95 }
  }

  if (active) {
    const posInQuad = index % DASHES_PER_QUADRANT
    const lit = Math.floor(Math.max(0.08, holdProgress) * DASHES_PER_QUADRANT)
    if (posInQuad < lit) return { stroke: '#4ade80', opacity: 1 }
    if (posInQuad === lit) return { stroke: '#4ade80', opacity: 0.65 }
    return { stroke: '#ffffff', opacity: 0.28 }
  }

  return { stroke: '#ffffff', opacity: 0.2 }
}

export function FaceScanFourPoseRing({
  activeSlot,
  capturedBySlot,
  holdProgress,
  complete,
  className,
}: FaceScanFourPoseRingProps) {
  return (
    <svg
      className={cn('absolute inset-0 w-full h-full pointer-events-none', className)}
      viewBox="0 0 100 100"
      aria-hidden
    >
      {Array.from({ length: DASH_COUNT }, (_, i) => {
        const rad = dashAngleRad(i)
        const x1 = CX + R_INNER * Math.cos(rad)
        const y1 = CY + R_INNER * Math.sin(rad)
        const x2 = CX + R_OUTER * Math.cos(rad)
        const y2 = CY + R_OUTER * Math.sin(rad)
        const { stroke, opacity } = dashStyle(i, activeSlot, capturedBySlot, holdProgress, complete)
        const slot = slotForDashIndex(i)
        const isActiveQuadrant = slot === activeSlot && !complete && !capturedBySlot[slot - 1]

        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={stroke}
            strokeWidth={isActiveQuadrant ? 1.35 : 1.05}
            strokeLinecap="round"
            opacity={opacity}
            style={{
              filter: stroke === '#4ade80'
                ? 'drop-shadow(0 0 2px rgba(74,222,128,0.85))'
                : undefined,
              transition: 'stroke 0.15s ease, opacity 0.15s ease',
            }}
          />
        )
      })}
      {/* Vòng mờ phía trong — căn mặt */}
      <circle
        cx={CX}
        cy={CY}
        r={R_INNER - 0.5}
        fill="none"
        stroke={complete ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.08)'}
        strokeWidth={0.4}
      />
    </svg>
  )
}

/** Góc phần tư đang active — dùng highlight vùng (tuỳ chọn). */
export function activeRingQuadrantIndex(slot: ScanPoseSlot): number {
  return FACE_SCAN_RING_INDEX_BY_SLOT[slot]
}
