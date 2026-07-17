import { useEffect, useState } from 'react'
import { cn } from '@/utils/cn'
import type { CameraFeedKey } from '../data/trainingCameraFeeds'

export interface AiOverlayBox {
  x: number
  y: number
  w: number
  h: number
  label: string
}

/** Vị trí box ước lượng theo từng clip Mixkit (góc rộng / toàn cảnh). */
export const AI_OVERLAY_BY_FEED: Record<CameraFeedKey, AiOverlayBox[]> = {
  'toolbox-blueprint': [
    { x: 22, y: 28, w: 18, h: 42, label: 'Học viên' },
    { x: 48, y: 24, w: 20, h: 46, label: 'Giảng viên' },
  ],
  'training-plans': [
    { x: 18, y: 30, w: 16, h: 38, label: 'Học viên' },
    { x: 42, y: 26, w: 18, h: 44, label: 'Giám sát' },
    { x: 68, y: 32, w: 14, h: 36, label: 'Học viên' },
  ],
  'safety-briefing': [
    { x: 25, y: 32, w: 15, h: 40, label: 'Học viên' },
    { x: 52, y: 28, w: 16, h: 44, label: 'Học viên' },
  ],
  'safety-helmets': [
    { x: 20, y: 30, w: 14, h: 38, label: 'NV' },
    { x: 38, y: 28, w: 15, h: 40, label: 'NV' },
    { x: 58, y: 32, w: 14, h: 36, label: 'NV' },
  ],
  'yard-builders': [
    { x: 28, y: 34, w: 16, h: 36, label: 'Thợ' },
    { x: 55, y: 30, w: 18, h: 40, label: 'Giám sát' },
  ],
  'workshop-weld': [
    { x: 32, y: 26, w: 20, h: 48, label: 'Kỹ thuật' },
    { x: 62, y: 34, w: 14, h: 34, label: 'Học viên' },
  ],
  'site-gate': [
    { x: 35, y: 38, w: 10, h: 28, label: 'NV' },
    { x: 58, y: 36, w: 11, h: 30, label: 'NV' },
  ],
  'site-cranes': [
    { x: 40, y: 42, w: 12, h: 26, label: 'NV' },
  ],
}

interface CameraAiOverlayProps {
  feedKey: CameraFeedKey
  cameraId: string
  zone: string
  courseName?: string
  compact?: boolean
}

function DetectionBox({ box, compact }: { box: AiOverlayBox; compact?: boolean }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
    >
      <div className="absolute inset-0 border border-emerald-400/70 rounded-[1px]" />
      <div className="absolute -top-0.5 -left-0.5 w-2 h-2 border-t border-l border-emerald-400" />
      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 border-t border-r border-emerald-400" />
      <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 border-b border-l border-emerald-400" />
      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 border-b border-r border-emerald-400" />
      <span
        className={cn(
          'absolute -top-3.5 left-0 px-1 py-px bg-emerald-500/20 text-emerald-300 font-mono whitespace-nowrap',
          compact ? 'text-[6px]' : 'text-[8px]',
        )}
      >
        {box.label} 0.{Math.round(84 + (box.x % 10))}
      </span>
    </div>
  )
}

export function CameraAiOverlay({ feedKey, cameraId, zone, courseName, compact }: CameraAiOverlayProps) {
  const [time, setTime] = useState('')
  const boxes = AI_OVERLAY_BY_FEED[feedKey]

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
      {boxes.map((box, i) => (
        <DetectionBox key={`${box.label}-${i}`} box={box} compact={compact} />
      ))}

      {!compact && (
        <>
          <div className="absolute top-2 left-2 font-mono text-[8px] text-white/45 leading-tight">
            <div>{cameraId} · {zone}</div>
            {courseName && <div className="text-emerald-400/60">{courseName}</div>}
          </div>
          <div className="absolute bottom-2 right-2 font-mono text-[8px] text-white/40">{time}</div>
        </>
      )}
    </div>
  )
}
