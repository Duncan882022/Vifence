import { cn } from '@/utils/cn'
import {
  FACE_SCAN_POSE_COUNT,
  FACE_SCAN_POSE_LABELS,
  FACE_SCAN_RING_INDEX_BY_SLOT,
  FACE_SCAN_RING_ROTATION_BY_INDEX,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanPoses'

const CX = 50
const CY = 50
const R = 44
const STROKE = 10
const QUARTER = 25

interface FaceScanFourPoseRingProps {
  activeSlot: ScanPoseSlot
  capturedBySlot: boolean[]
  holdProgress: number
  complete: boolean
}

function segmentDash(filled: number): string {
  const p = Math.max(0, Math.min(1, filled))
  const lit = p * QUARTER
  return `${lit.toFixed(1)} ${100 - lit}`
}

function slotForRingIndex(ringIdx: number): ScanPoseSlot {
  const found = Object.entries(FACE_SCAN_RING_INDEX_BY_SLOT).find(([, v]) => v === ringIdx)
  return Number(found?.[0] ?? 1) as ScanPoseSlot
}

export function FaceScanFourPoseRing({
  activeSlot,
  capturedBySlot,
  holdProgress,
  complete,
}: FaceScanFourPoseRingProps) {
  return (
    <div className="relative w-[76%] max-w-[320px] aspect-square shrink-0 overflow-visible">
      <div
        className="absolute inset-[10%] rounded-full z-[1] pointer-events-none"
        style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.52)' }}
        aria-hidden
      />
      <svg
        className={cn(
          'absolute inset-0 w-full h-full z-[40] pointer-events-none overflow-visible',
          complete && 'animate-pulse',
        )}
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={STROKE}
        />
        {Array.from({ length: FACE_SCAN_POSE_COUNT }, (_, ringIdx) => {
          const slotNum = slotForRingIndex(ringIdx)
          const captured = capturedBySlot[slotNum - 1] || complete
          const active = slotNum === activeSlot && !complete && !captured
          const fill = captured ? 1 : active ? Math.max(holdProgress, 0.06) : 0
          const rotation = FACE_SCAN_RING_ROTATION_BY_INDEX[ringIdx]
          const color = captured || complete ? '#22c55e' : active ? '#0ea5e9' : 'rgba(255,255,255,0.45)'

          return (
            <circle
              key={ringIdx}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={captured ? STROKE + 2 : STROKE}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={segmentDash(fill)}
              transform={`rotate(${rotation} ${CX} ${CY})`}
              style={{
                filter: captured
                  ? 'drop-shadow(0 0 10px rgba(34,197,94,0.95))'
                  : active
                    ? 'drop-shadow(0 0 8px rgba(14,165,233,0.9))'
                    : undefined,
                transition: 'stroke 0.2s ease, stroke-dasharray 0.12s ease',
              }}
            />
          )
        })}
      </svg>
      {Array.from({ length: FACE_SCAN_POSE_COUNT }, (_, ringIdx) => {
        const slotNum = slotForRingIndex(ringIdx)
        const label = FACE_SCAN_POSE_LABELS[slotNum - 1]
        const rotation = FACE_SCAN_RING_ROTATION_BY_INDEX[ringIdx]
        const rad = ((rotation - 90) * Math.PI) / 180
        const lx = CX + Math.cos(rad) * (R + 13)
        const ly = CY + Math.sin(rad) * (R + 13)
        const slotDone = capturedBySlot[slotNum - 1] || complete
        const isActive = slotNum === activeSlot && !complete
        return (
          <span
            key={label}
            className={cn(
              'absolute z-[45] max-w-[4.5rem] text-center text-[7px] font-bold leading-tight tracking-wide pointer-events-none -translate-x-1/2 -translate-y-1/2',
              slotDone && 'text-green-400',
              isActive && !slotDone && 'text-sky-300 animate-pulse',
              !slotDone && !isActive && 'text-white/50',
            )}
            style={{ left: `${lx}%`, top: `${ly}%` }}
          >
            {label}
          </span>
        )
      })}
      <div
        className={cn(
          'absolute inset-[20%] rounded-full z-[20] pointer-events-none border-2',
          complete ? 'border-green-400/70' : 'border-white/30',
        )}
        aria-hidden
      />
    </div>
  )
}
