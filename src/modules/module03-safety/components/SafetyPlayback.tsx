import { useEffect, useRef, useState } from 'react'
import {
  Play, Pause, Volume2, Download, SkipBack, SkipForward,
  ChevronLeft, ChevronRight, Car, User, MapPin, Camera,
} from 'lucide-react'
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
import { ViolationTypeIcon } from './ViolationTypeIcon'
import { getSafetyCameraDisplayName } from '../utils/safetyCameraBridge'
import { EventPlaybackViewport, useEventClipPlayback } from './EventPlaybackViewport'
import { EVENT_PLAYBACK_CLIP_SEC, buildEventClipWindow } from '../utils/eventPlaybackClip'

const SPEEDS = [0.5, 1, 1.5, 2]

const CCTV_SCANLINE = {
  backgroundImage:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
} as const

interface SafetyPlaybackProps {
  event: Event | null
  className?: string
}

function resolveViolationType(event: Event): ViolationType | null {
  if (event.violationCategory) {
    return groupIdToViolationType(event.violationCategory)
  }
  const entry = Object.entries(VIOLATION_TYPE_LABELS).find(([, label]) => label === event.type)
  return entry ? entry[0] as ViolationType : null
}

export function SafetyPlayback({ event, className }: SafetyPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [clipDuration, setClipDuration] = useState(EVENT_PLAYBACK_CLIP_SEC)
  const [speedIndex, setSpeedIndex] = useState(1)
  const [volume, setVolume] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  const violationType = event ? resolveViolationType(event) : null
  const feedType = event?.violationCategory ? groupIdToFeedType(event.violationCategory) : violationType
  const videoSrc = event?.videoUrl ?? (feedType ? getViolationFeedUrl(feedType) : undefined)
  const seekSec = event?.playbackSeekSec ?? (feedType ? getViolationClipMarker(feedType) : 0)
  const clipSec = event?.clipDurationSec ?? EVENT_PLAYBACK_CLIP_SEC
  const violationBbox = event?.violationBbox
  const frameWidth = event?.frameWidth
  const frameHeight = event?.frameHeight
  const speed = SPEEDS[speedIndex]
  const cameraLabel = event
    ? getSafetyCameraDisplayName(event.cameraId, event.cameraName)
    : undefined

  // Pause and release video source on unmount to prevent orphaned audio after modal close
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
        <p className="text-sm text-center">Chọn vi phạm để xem playback</p>
      </div>
    )
  }

  const markerPct = clipDuration > 0 ? 50 : 35

  return (
    <div className={cn('flex flex-col h-full min-h-0 bg-[#0b0f1a]', className)}>
      <div className="relative w-full aspect-video max-h-[min(52vh,420px)] sm:max-h-[min(56vh,480px)] lg:max-h-none lg:flex-1 lg:min-h-[180px] bg-[#060b14] overflow-hidden shrink-0">
        {loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14] px-4 text-center">
            <Play className="w-8 h-8 text-red-400/60" />
            <p className="text-[10px] text-red-400/90">{loadError}</p>
            <p className="text-[9px] text-muted-foreground/70 break-all">{videoSrc}</p>
          </div>
        ) : videoSrc ? (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
            <EventPlaybackViewport
              bbox={violationBbox}
              frameWidth={frameWidth}
              frameHeight={frameHeight}
            >
              <video
                key={event.id}
                ref={videoRef}
                src={videoSrc}
                muted={volume === 0}
                playsInline
                preload="auto"
                className={cn(
                  'absolute inset-0 h-full w-full object-contain bg-black',
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
            <div className="absolute top-2 right-2 pointer-events-none z-[10] flex items-center gap-1">
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/55 text-sky-200 border border-sky-400/30">
                Clip {clipSec}s
              </span>
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/90 text-white">
                AI PHÁT HIỆN
              </span>
            </div>
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-none z-[10]">
              <span className="text-[10px] font-bold px-2 py-1 rounded bg-red-500/85 text-white border border-red-300/40 whitespace-nowrap">
                {event.type}
              </span>
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
        <div className="relative w-full h-1.5 bg-[#1a2235] rounded-full cursor-pointer group"
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
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-400 shadow"
            style={{ left: `calc(${markerPct}% - 4px)` }}
            title="Thời điểm vi phạm"
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1 tabular-nums">
          <span>{formatTime((progress / 100) * clipDuration)}</span>
          <span>{formatTime(clipDuration)}</span>
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
            className="p-1.5 rounded-full bg-primary hover:bg-primary/80 text-primary-foreground"
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
            className="w-12 h-1 accent-primary"
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
        {violationType && (
          <div className="flex items-start gap-2 mb-1">
            <ViolationTypeIcon type={violationType} size="xs" />
            <div className="min-w-0">
              {event.scenario ? (
                <>
                  <p className="text-[10px] font-semibold text-foreground leading-snug">{event.scenario}</p>
                  <p className="text-[8px] text-muted-foreground uppercase tracking-wide mt-0.5">{event.type}</p>
                </>
              ) : (
                <p className="text-[10px] font-medium text-foreground">{event.type}</p>
              )}
            </div>
          </div>
        )}
        {!violationType && (
          <div className="mb-1">
            {event.scenario ? (
              <>
                <p className="text-[10px] font-semibold text-foreground leading-snug">{event.scenario}</p>
                {event.violationCategory && (
                  <p className="text-[8px] text-muted-foreground uppercase tracking-wide mt-0.5">{event.violationCategory}</p>
                )}
              </>
            ) : (
              <p className="text-[10px] font-medium text-foreground">{event.type}</p>
            )}
          </div>
        )}
        <p className="text-[9px] text-muted-foreground line-clamp-2">{event.description}</p>
        {(() => {
          const showSite = event.trafficSubject === 'site'
          const showPerson = event.trafficSubject
            ? event.trafficSubject === 'person' || event.trafficSubject === 'both'
            : Boolean(event.workerName)
          const showVehicle = event.trafficSubject
            ? event.trafficSubject === 'vehicle' || event.trafficSubject === 'both'
            : Boolean(event.vehiclePlate)

          if (!showSite && !showPerson && !showVehicle) return null

          return (
            <div className="mt-1.5 space-y-1">
              {showSite && (
                <div>
                  <p className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-0.5">Hiện trường</p>
                  <p className="text-[9px] text-foreground/90 flex items-start gap-1 truncate">
                    <MapPin className="w-2.5 h-2.5 shrink-0 text-amber-400/80 mt-0.5" aria-hidden />
                    <span className="truncate">
                      {event.location}
                      {event.contractorName && (
                        <span className="text-muted-foreground"> · {event.contractorName}</span>
                      )}
                    </span>
                  </p>
                </div>
              )}
              {showPerson && event.workerName && (
                <div>
                  {event.trafficSubject === 'both' && (
                    <p className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-0.5">Người</p>
                  )}
                  <p className="text-[9px] text-foreground/90 flex items-center gap-1 truncate">
                    <User className="w-2.5 h-2.5 shrink-0 text-muted-foreground/70" aria-hidden />
                    <span className="truncate">
                      {event.workerName}
                      {event.trafficRole && (
                        <span className="text-muted-foreground"> · {event.trafficRole}</span>
                      )}
                    </span>
                  </p>
                </div>
              )}
              {showVehicle && event.vehiclePlate && (
                <div>
                  {event.trafficSubject === 'both' && (
                    <p className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-0.5">Xe</p>
                  )}
                  <p className="text-[9px] text-cyan-400/90 flex items-center gap-1 truncate tabular-nums">
                    <Car className="w-2.5 h-2.5 shrink-0" aria-hidden />
                    <span className="truncate">
                      <span className="font-semibold">{event.vehiclePlate}</span>
                      {event.vehicleType && (
                        <span className="text-muted-foreground"> · {event.vehicleType}</span>
                      )}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      <div className="shrink-0 px-3 pb-3 flex items-center gap-1.5">
        <button type="button" className="flex items-center gap-1 px-2 py-1 rounded bg-[#1a2235] text-[9px] text-muted-foreground">
          <ChevronLeft className="w-3 h-3" /> Trước
        </button>
        <button type="button" className="flex-1 py-1 rounded bg-primary/15 text-[9px] font-semibold text-primary">
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
