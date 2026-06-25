import { useState } from 'react'
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, Download, Share2, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Event } from '@/types/event'
import { formatDateTime } from '@/utils/format'

interface PlaybackPanelProps {
  event?: Event | null
  className?: string
}

const SPEEDS = [0.5, 1, 1.5, 2, 4]

export function PlaybackPanel({ event, className }: PlaybackPanelProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(1)
  const [volume, setVolume] = useState(80)

  const speed = SPEEDS[speedIndex]

  if (!event) {
    return (
      <div className={cn('bg-card border border-border rounded-lg flex flex-col items-center justify-center gap-3 p-6 h-full', className)}>
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Play className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground text-center">Chọn sự kiện để xem lại</p>
      </div>
    )
  }

  return (
    <div className={cn('bg-card border border-border rounded-lg flex flex-col gap-0 overflow-hidden h-full', className)}>
      <div className="relative bg-gray-950 aspect-video flex items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center">
          <div className="text-center">
            <Play className="w-10 h-10 text-gray-700 mx-auto mb-2" />
            <p className="text-xs text-gray-600">Video Playback</p>
          </div>
        </div>

        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          <div className="bg-black/60 rounded px-2 py-1">
            <p className="text-[10px] text-white font-medium">{event.cameraName}</p>
            <p className="text-[9px] text-white/60">{formatDateTime(event.timestamp)}</p>
          </div>
          <div className="flex gap-1">
            <button className="p-1.5 rounded bg-black/60 hover:bg-black/80 transition-colors">
              <Share2 className="w-3.5 h-3.5 text-white" />
            </button>
            <button className="p-1.5 rounded bg-black/60 hover:bg-black/80 transition-colors">
              <Download className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 pb-1">
        <div
          className="w-full h-1.5 bg-muted rounded-full cursor-pointer relative group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = ((e.clientX - rect.left) / rect.width) * 100
            setProgress(Math.min(100, Math.max(0, pct)))
          }}
        >
          <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
          <span>00:{String(Math.floor(progress * 0.6)).padStart(2, '0')}</span>
          <span>01:00</span>
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-accent transition-colors">
            <SkipBack className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded-full bg-primary hover:bg-primary/80 transition-colors"
          >
            {isPlaying
              ? <Pause className="w-4 h-4 text-primary-foreground" />
              : <Play className="w-4 h-4 text-primary-foreground" />
            }
          </button>
          <button className="p-1.5 rounded hover:bg-accent transition-colors">
            <SkipForward className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-16 h-1 accent-primary cursor-pointer"
            />
          </div>

          <button
            onClick={() => setSpeedIndex((i) => (i + 1) % SPEEDS.length)}
            className={cn(
              'px-2 py-0.5 rounded text-xs font-medium transition-colors',
              speed !== 1 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {speed}x
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 border-t border-border pt-3">
        <p className="text-xs font-medium text-foreground mb-1">{event.type}</p>
        <p className="text-xs text-muted-foreground">{event.description}</p>
        {event.workerName && (
          <p className="text-xs text-muted-foreground mt-1">
            <span className="text-foreground">{event.workerName}</span> · {event.contractorName}
          </p>
        )}
      </div>

      <div className="px-4 pb-3 flex items-center gap-2">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
          Trước
        </button>
        <button className="flex-1 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-xs font-medium text-primary transition-colors">
          Xuất clip
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
          Sau
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
