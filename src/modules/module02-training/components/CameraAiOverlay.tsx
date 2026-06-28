import { useEffect, useState, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import type { CameraFeedKey } from '../data/trainingCameraFeeds'
import type { AiOverlayBox } from '../data/cameraAiOverlayKeyframes'
import { useFaceOverlayBoxes } from '../hooks/useFaceOverlayBoxes'

export type { AiOverlayBox } from '../data/cameraAiOverlayKeyframes'

interface CameraAiOverlayProps {
  feedKey: CameraFeedKey
  compact?: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  enabled?: boolean
}

function DetectionBox({ box, compact }: { box: AiOverlayBox; compact?: boolean }) {
  const confidence = 0.84 + (box.x % 10) * 0.01
  return (
    <div
      className="absolute pointer-events-none transition-all duration-300 ease-out"
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
    >
      <div className="absolute inset-0 border border-emerald-400/80 rounded-sm" />
      <div className="absolute -top-0.5 -left-0.5 w-2 h-2 border-t border-l border-emerald-400" />
      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 border-t border-r border-emerald-400" />
      <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 border-b border-l border-emerald-400" />
      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 border-b border-r border-emerald-400" />
      <span
        className={cn(
          'absolute -top-3 left-0 px-0.5 py-px bg-emerald-500/25 text-emerald-300 font-mono whitespace-nowrap rounded-sm',
          compact ? 'text-[5px]' : 'text-[7px]',
        )}
      >
        {box.label} {confidence.toFixed(2)}
      </span>
    </div>
  )
}

export function CameraAiOverlay({
  feedKey,
  compact,
  videoRef,
  enabled = true,
}: CameraAiOverlayProps) {
  const [time, setTime] = useState('')
  const boxes = useFaceOverlayBoxes(feedKey, videoRef, enabled)

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

  if (!enabled || boxes.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {boxes.map((box, i) => (
        <DetectionBox key={`${box.label}-${i}-${Math.round(box.x)}`} box={box} compact={compact} />
      ))}

      {!compact && (
        <div className="absolute bottom-2 right-2 font-mono text-[8px] text-white/40 z-[1]">{time}</div>
      )}
    </div>
  )
}
