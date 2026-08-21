import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Volume2, Camera } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Event } from '@/types/event'
import { formatDateTime } from '@/utils/format'
import {
  getViolationClipMarker,
  getViolationFeedUrl,
} from '../data/safetyViolationFeeds'
import { groupIdToFeedType, groupIdToViolationType } from '../utils/groupToViolationType'
import { VIOLATION_TYPE_LABELS } from '../data/safetyViolations'
import type { ViolationType } from '@/types/safety'
import { getSafetyCameraDisplayName } from '../utils/safetyCameraBridge'
import {
  getVideoObjectFitForCamera,
  getVideoObjectPositionForCamera,
} from '@/modules/module02-training/data/trainingCameraFeeds'
import { EventPlaybackViewport, useEventClipPlayback } from './EventPlaybackViewport'
import { playbackViolationRoiClass } from '../utils/roiBoxRole'
import { EVENT_PLAYBACK_CLIP_SEC, buildEventClipWindow } from '../utils/eventPlaybackClip'

const SPEEDS = [0.5, 1, 1.5, 2]

const CCTV_SCANLINE = {
  backgroundImage:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
} as const

interface SafetyPlaybackProps {
  event: Event | null
  className?: string
  /** embedded = trong modal/trang con · panel = tier Camera (metadata ở strip riêng) */
  variant?: 'embedded' | 'panel'
}

function resolveViolationType(event: Event): ViolationType | null {
  if (event.violationCategory) {
    return groupIdToViolationType(event.violationCategory)
  }
  const entry = Object.entries(VIOLATION_TYPE_LABELS).find(([, label]) => label === event.type)
  return entry ? entry[0] as ViolationType : null
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SafetyPlayback({ event, className, variant = 'embedded' }: SafetyPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [clipDuration, setClipDuration] = useState(EVENT_PLAYBACK_CLIP_SEC)
  const [speedIndex, setSpeedIndex] = useState(1)
  const [volume, setVolume] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  const feedType = event?.violationCategory ? groupIdToFeedType(event.violationCategory) : resolveViolationType(event!)
  const videoSrc = event?.videoUrl ?? (feedType ? getViolationFeedUrl(feedType) : undefined)
  const seekSec = event?.playbackSeekSec ?? (feedType ? getViolationClipMarker(feedType) : 0)
  const clipSec = event?.clipDurationSec ?? EVENT_PLAYBACK_CLIP_SEC
  const speed = SPEEDS[speedIndex]
  const cameraLabel = event
    ? getSafetyCameraDisplayName(event.cameraId, event.cameraName)
    : undefined
  const playbackFit = event
    ? getVideoObjectFitForCamera(event.cameraId)
    : 'contain'
  const playbackObjectPosition = event
    ? getVideoObjectPositionForCamera(event.cameraId)
    : 'center'

  useEffect(() => {
    return () => {
      const video = videoRef.current
      if (video) {
        video.pause()
        video.src = ''
        video.load()
      }
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.pause()
    setIsPlaying(false)
    setProgress(0)
    setClipDuration(clipSec)
    setSpeedIndex(1)
    setLoadError(null)
  }, [event?.id, clipSec])

  useEventClipPlayback(videoRef, {
    enabled: Boolean(event && videoSrc),
    videoSrc,
    seekSec,
    clipDurationSec: clipSec,
    autoPlay: true,
    onClipProgress: (current, duration) => {
      setClipDuration(duration)
      setProgress(duration > 0 ? (current / duration) * 100 : 0)
      setIsPlaying(true)
    },
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = speed
  }, [speed])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume / 100
    video.muted = volume === 0
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
        <p className="text-sm text-center">Chọn sự kiện để xem clip</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full min-h-0 bg-[#0b0f1a]', className)}>
      <div className="relative w-full aspect-video max-h-[min(52vh,420px)] bg-[#060b14] overflow-hidden shrink-0">
        {loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14] px-4 text-center">
            <Play className="w-8 h-8 text-red-400/60" />
            <p className="text-[10px] text-red-400/90">{loadError}</p>
          </div>
        ) : videoSrc ? (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
            <EventPlaybackViewport
              videoRef={videoRef}
              bbox={event.violationBbox}
              subjectBbox={event.subjectBbox}
              relatedBbox={event.relatedBbox}
              relatedRoiLabel={event.relatedRoiLabel}
              frameWidth={event.frameWidth}
              frameHeight={event.frameHeight}
              videoFit={playbackFit}
              videoObjectPosition={playbackObjectPosition}
              violationRoiClass={playbackViolationRoiClass(event.scenarioId)}
            >
              <video
                key={event.id}
                ref={videoRef}
                src={videoSrc}
                muted={volume === 0}
                playsInline
                preload="auto"
                className={cn(
                  'absolute inset-0 h-full w-full bg-black',
                  playbackFit === 'contain' ? 'object-contain' : 'object-cover',
                  playbackObjectPosition === 'bottom' && playbackFit === 'cover' && 'object-bottom',
                  'saturate-[0.82] contrast-[1.06] brightness-[0.9]',
                )}
                onError={() => setLoadError('Không tải được clip vi phạm')}
              />
            </EventPlaybackViewport>
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/55 backdrop-blur-sm pointer-events-none z-[10]">
              <Camera className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] text-white/80 font-medium truncate">{cameraLabel}</span>
            </div>
            <p className="absolute bottom-2 left-2 text-[9px] text-white/60 tabular-nums pointer-events-none z-[10]">
              {formatDateTime(event.timestamp)}
            </p>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]">
            <Play className="w-10 h-10 text-gray-700" />
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pt-2 pb-1 border-t border-[#1e2433]">
        <div
          className="relative w-full h-1.5 bg-[#1a2235] rounded-full cursor-pointer"
          onClick={e => {
            const video = videoRef.current
            if (!video || clipDuration <= 0) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            const clip = buildEventClipWindow(seekSec, video.duration || seekSec + clipSec, clipSec)
            video.currentTime = clip.start + pct * clip.duration
            setProgress(pct * 100)
          }}
        >
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1 tabular-nums">
          <span>{formatTime((progress / 100) * clipDuration)}</span>
          <span>{formatTime(clipDuration)}</span>
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 flex items-center justify-between gap-2 border-t border-[#1e2433]/60 pt-2">
        <button
          type="button"
          onClick={() => setIsPlaying(p => !p)}
          className="p-1.5 rounded-full bg-primary hover:bg-primary/80 text-primary-foreground"
          aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
          {variant === 'embedded' && (
            <p className="text-[10px] text-foreground/90 truncate mr-auto">{event.scenario ?? event.type}</p>
          )}
          <Volume2 className="w-3 h-3 text-muted-foreground shrink-0" />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={e => setVolume(Number(e.target.value))}
            className="w-12 h-1 accent-primary"
          />
          <button
            type="button"
            onClick={() => setSpeedIndex(i => (i + 1) % SPEEDS.length)}
            className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#1a2235] text-muted-foreground shrink-0"
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  )
}
