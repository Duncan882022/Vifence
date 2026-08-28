import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { PlaybackDatePicker } from './PlaybackDatePicker'

interface PlaybackControlBarProps {
  date: string
  onDateChange: (date: string) => void
  maxDate?: string
  minDate?: string
  progress: number
  onScrub: (pct: number) => void
  isPlaying: boolean
  onTogglePlay: () => void
  videoSrc: string | null
  currentTime: number
  duration: number
  formatTime: (seconds: number) => string
  muted: boolean
  onToggleMute: () => void
  volume: number
  onVolumeChange: (volume: number) => void
}

export function PlaybackControlBar({
  date,
  onDateChange,
  maxDate,
  minDate,
  progress,
  onScrub,
  isPlaying,
  onTogglePlay,
  videoSrc,
  currentTime,
  duration,
  formatTime,
  muted,
  onToggleMute,
  volume,
  onVolumeChange,
}: PlaybackControlBarProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[#1e2433] bg-[#060b14] shrink-0 min-h-[44px]">
      <PlaybackDatePicker date={date} onDateChange={onDateChange} maxDate={maxDate} minDate={minDate} compact />
      <button
        type="button"
        onClick={onTogglePlay}
        disabled={!videoSrc}
        className="w-7 h-7 rounded-full bg-primary hover:bg-primary/80 disabled:opacity-30 flex items-center justify-center transition-colors shrink-0"
      >
        {isPlaying
          ? <Pause className="w-3.5 h-3.5 text-white" />
          : <Play className="w-3.5 h-3.5 text-white ml-px" />}
      </button>
      <span className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0 w-[72px]">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <div
        className="relative flex-1 min-w-[80px] h-1 bg-[#1a2235] rounded-full cursor-pointer group"
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          onScrub(((e.clientX - rect.left) / rect.width) * 100)
        }}
      >
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary shadow opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 5px)` }}
        />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onToggleMute}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={e => onVolumeChange(Number(e.target.value))}
          className="w-16 h-1 accent-primary cursor-pointer"
        />
      </div>
    </div>
  )
}

export function PlaybackMobileControls({
  date,
  onDateChange,
  maxDate,
  minDate,
  progress,
  onScrub,
  isPlaying,
  onTogglePlay,
  videoSrc,
  currentTime,
  duration,
  formatTime,
  muted,
  onToggleMute,
  volume,
  onVolumeChange,
}: PlaybackControlBarProps) {
  return (
    <div className="rounded-lg border border-[#1e2433] bg-[#060b14] px-3 py-2 shrink-0 space-y-2">
      <PlaybackDatePicker date={date} onDateChange={onDateChange} maxDate={maxDate} minDate={minDate} />
      <div
        className="relative w-full h-1 bg-[#1a2235] rounded-full cursor-pointer group"
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          onScrub(((e.clientX - rect.left) / rect.width) * 100)
        }}
      >
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary shadow opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 5px)` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!videoSrc}
            className="w-6 h-6 rounded-full bg-primary hover:bg-primary/80 disabled:opacity-30 flex items-center justify-center transition-colors"
          >
            {isPlaying
              ? <Pause className="w-3 h-3 text-white" />
              : <Play className="w-3 h-3 text-white ml-px" />}
          </button>
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMute}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={e => onVolumeChange(Number(e.target.value))}
            className="w-14 h-1 accent-primary cursor-pointer"
          />
        </div>
      </div>
    </div>
  )
}
