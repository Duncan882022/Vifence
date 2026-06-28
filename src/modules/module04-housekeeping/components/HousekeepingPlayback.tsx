import { useEffect, useRef, useState } from 'react'
import {
  Play, Pause, Volume2, Download, SkipBack, SkipForward,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Event } from '@/types/event'
import { formatDateTime } from '@/utils/format'
import {
  getIssueClipMarker,
  getIssueFeedUrl,
} from '../data/housekeepingIssueFeeds'
import { HOUSEKEEPING_ISSUES, ISSUE_TYPE_LABELS } from '../data/housekeepingIssues'
import type { IssueType } from '@/types/housekeeping'

const SPEEDS = [0.5, 1, 1.5, 2]

interface HousekeepingPlaybackProps {
  event: Event | null
  className?: string
}

function resolveIssueType(event: Event): IssueType | null {
  const match = HOUSEKEEPING_ISSUES.find(i => i.id === event.id)
  if (match) return match.type
  const entry = Object.entries(ISSUE_TYPE_LABELS).find(([, label]) => label === event.type)
  return entry ? entry[0] as IssueType : null
}

export function HousekeepingPlayback({ event, className }: HousekeepingPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(1)
  const [volume, setVolume] = useState(80)

  const issueType = event ? resolveIssueType(event) : null
  const videoSrc = event?.videoUrl ?? (issueType ? getIssueFeedUrl(issueType) : undefined)
  const markerSec = issueType ? getIssueClipMarker(issueType) : 0
  const speed = SPEEDS[speedIndex]

  useEffect(() => {
    setIsPlaying(false)
    setProgress(0)
    setSpeedIndex(1)
  }, [event?.id])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSrc) return
    video.load()
    const onLoaded = () => {
      const seek = Math.min(markerSec, video.duration || markerSec)
      video.currentTime = seek
      setDuration(video.duration || 0)
      setProgress(video.duration ? (seek / video.duration) * 100 : 0)
    }
    video.addEventListener('loadedmetadata', onLoaded)
    return () => video.removeEventListener('loadedmetadata', onLoaded)
  }, [videoSrc, markerSec])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = speed
  }, [speed])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume / 100
  }, [volume])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.play().catch(() => setIsPlaying(false))
    } else {
      video.pause()
    }
  }, [isPlaying])

  if (!event) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-3 p-6 h-full text-muted-foreground', className)}>
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Play className="w-6 h-6 text-muted-foreground/60" />
        </div>
        <p className="text-sm text-center">Chọn sự cố để xem playback</p>
      </div>
    )
  }

  const markerPct = duration > 0 ? (markerSec / duration) * 100 : 35

  return (
    <div className={cn('flex flex-col h-full min-h-0 bg-[#0b0f1a]', className)}>
      <div className="relative flex-1 min-h-[140px] bg-gray-950 overflow-hidden">
        {videoSrc ? (
          <>
            <video
              ref={videoRef}
              src={videoSrc}
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover saturate-[0.88] contrast-[1.05] brightness-[0.92]"
              onTimeUpdate={e => {
                const v = e.currentTarget
                if (v.duration) setProgress((v.currentTime / v.duration) * 100)
              }}
            />
            <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2 pointer-events-none">
              <div className="bg-black/65 rounded px-2 py-1 max-w-[70%]">
                <p className="text-[10px] text-white font-medium truncate">{event.cameraName}</p>
                <p className="text-[9px] text-white/60 tabular-nums">{formatDateTime(event.timestamp)}</p>
              </div>
              <span className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded bg-teal-500/90 text-white">
                AI PHÁT HIỆN
              </span>
            </div>
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-none">
              <span className="text-[10px] font-bold px-2 py-1 rounded bg-teal-500/85 text-white border border-teal-300/40 whitespace-nowrap">
                {event.type}
              </span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-950">
            <Play className="w-10 h-10 text-gray-700" />
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pt-2 pb-1 border-t border-[#1e2433]">
        <div className="relative w-full h-1.5 bg-[#1a2235] rounded-full cursor-pointer group"
          onClick={e => {
            const video = videoRef.current
            if (!video?.duration) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            video.currentTime = pct * video.duration
            setProgress(pct * 100)
          }}
        >
          <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400 shadow"
            style={{ left: `calc(${markerPct}% - 4px)` }}
            title="Thời điểm sự cố"
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1 tabular-nums">
          <span>{formatTime((progress / 100) * duration)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="shrink-0 px-3 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <button type="button" className="p-1 rounded hover:bg-[#1a2235] text-muted-foreground">
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsPlaying(p => !p)}
            className="p-1.5 rounded-full bg-teal-600 hover:bg-teal-500 text-white"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button type="button" className="p-1 rounded hover:bg-[#1a2235] text-muted-foreground">
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Volume2 className="w-3 h-3 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={e => setVolume(Number(e.target.value))}
            className="w-12 h-1 accent-teal-500"
          />
          <button
            type="button"
            onClick={() => setSpeedIndex(i => (i + 1) % SPEEDS.length)}
            className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#1a2235] text-muted-foreground"
          >
            {speed}x
          </button>
        </div>
      </div>

      <div className="shrink-0 px-3 pb-2 border-t border-[#1e2433] pt-2">
        <p className="text-[10px] font-medium text-foreground">{event.type}</p>
        <p className="text-[9px] text-muted-foreground line-clamp-2">{event.description}</p>
      </div>

      <div className="shrink-0 px-3 pb-3 flex items-center gap-1.5">
        <button type="button" className="flex items-center gap-1 px-2 py-1 rounded bg-[#1a2235] text-[9px] text-muted-foreground">
          <ChevronLeft className="w-3 h-3" /> Trước
        </button>
        <button type="button" className="flex-1 py-1 rounded bg-teal-500/15 text-[9px] font-semibold text-teal-400">
          Xuất clip
        </button>
        <button type="button" className="flex items-center gap-1 px-2 py-1 rounded bg-[#1a2235] text-[9px] text-muted-foreground">
          Sau <ChevronRight className="w-3 h-3" />
        </button>
        <button type="button" className="p-1 rounded bg-[#1a2235] text-muted-foreground" title="Tải xuống">
          <Download className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
