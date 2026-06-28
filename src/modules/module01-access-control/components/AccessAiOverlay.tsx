import { useEffect, useState } from 'react'
import { cn } from '@/utils/cn'
import type { AccessAiDetection, AccessOverlayKind } from '@/types/access'

const OVERLAY_STYLES: Record<AccessOverlayKind, { border: string; bg: string; text: string }> = {
  person: {
    border: 'border-emerald-400/80',
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-300',
  },
  vehicle: {
    border: 'border-amber-400/80',
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
  },
  unregistered: {
    border: 'border-red-400/80',
    bg: 'bg-red-500/20',
    text: 'text-red-300',
  },
}

function DetectionBox({ box, compact }: { box: AccessAiDetection; compact?: boolean }) {
  const style = OVERLAY_STYLES[box.kind]
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
    >
      <div className={cn('absolute inset-0 border rounded-[1px]', style.border)} />
      <div className={cn('absolute -top-0.5 -left-0.5 w-2 h-2 border-t border-l', style.border)} />
      <div className={cn('absolute -top-0.5 -right-0.5 w-2 h-2 border-t border-r', style.border)} />
      <div className={cn('absolute -bottom-0.5 -left-0.5 w-2 h-2 border-b border-l', style.border)} />
      <div className={cn('absolute -bottom-0.5 -right-0.5 w-2 h-2 border-b border-r', style.border)} />
      <span
        className={cn(
          'absolute left-0 px-1 py-px font-mono whitespace-nowrap',
          style.bg, style.text,
          compact ? 'text-[5px] -top-3' : 'text-[7px] -top-4',
        )}
      >
        {box.label}
        {box.sublabel && (
          <span className="opacity-80"> · {box.sublabel}</span>
        )}
      </span>
    </div>
  )
}

interface AccessAiOverlayProps {
  detections: AccessAiDetection[]
  cameraId: string
  zone: string
  compact?: boolean
}

export function AccessAiOverlay({ detections, cameraId, zone, compact }: AccessAiOverlayProps) {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setTime(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`,
      )
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {detections.map((box, i) => (
        <DetectionBox key={`${box.label}-${i}`} box={box} compact={compact} />
      ))}
      {!compact && (
        <>
          <div className="absolute top-2 left-2 font-mono text-[8px] text-white/45 leading-tight">
            <div>{cameraId} · {zone}</div>
          </div>
          <div className="absolute bottom-2 right-2 font-mono text-[8px] text-white/40">{time}</div>
        </>
      )}
    </div>
  )
}
