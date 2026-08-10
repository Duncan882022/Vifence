import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import { mapBackendBboxToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import {
  buildEventClipWindow,
  unionBboxes,
  type ViolationBbox,
} from '../utils/eventPlaybackClip'

interface EventPlaybackViewportProps {
  videoRef: RefObject<HTMLVideoElement | null>
  /** Khung vi phạm chính — solid đỏ. */
  bbox?: ViolationBbox
  /** Người vi phạm — dashed vàng (CN). */
  subjectBbox?: ViolationBbox
  /** Máy/đối tượng liên quan — dashed xanh (DZ). */
  relatedBbox?: ViolationBbox
  /** Zoom ROI — mặc định union các khung trên. */
  zoomBbox?: ViolationBbox
  frameWidth?: number
  frameHeight?: number
  videoFit?: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  /** Bật zoom ROI — desktop mặc định; mobile/tablet chỉ khung ROI. */
  zoomEnabled?: boolean
  className?: string
  children: ReactNode
}

function mapBboxToOverlay(
  bbox: ViolationBbox,
  frameWidth: number,
  frameHeight: number,
  video: HTMLVideoElement,
  fit: 'cover' | 'contain',
  objectPosition: 'center' | 'bottom',
) {
  return mapBackendBboxToOverlay(
    bbox,
    frameWidth,
    frameHeight,
    video,
    fit,
    objectPosition,
  )
}

function mapOverlayBox(
  bbox: ViolationBbox,
  frameWidth: number,
  frameHeight: number,
  video: HTMLVideoElement,
  fit: 'cover' | 'contain',
  objectPosition: 'center' | 'bottom',
) {
  const box = mapBboxToOverlay(bbox, frameWidth, frameHeight, video, fit, objectPosition)
  if (box.w <= 0.4 || box.h <= 0.4) return undefined
  return box
}

interface PlaybackRoiBoxProps {
  box: { x: number; y: number; w: number; h: number }
  className: string
  label?: string
}

function PlaybackRoiBox({ box, className, label }: PlaybackRoiBoxProps) {
  return (
    <div
      className={cn('absolute rounded-sm pointer-events-none z-[6]', className)}
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
      }}
      aria-hidden
    >
      {label && (
        <span className="absolute -top-3.5 left-0 text-[8px] font-semibold px-1 py-0.5 rounded bg-black/70 text-white/90 whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  )
}

export function EventPlaybackViewport({
  videoRef,
  bbox,
  subjectBbox,
  relatedBbox,
  zoomBbox,
  frameWidth,
  frameHeight,
  videoFit = 'contain',
  videoObjectPosition = 'center',
  zoomEnabled,
  className,
  children,
}: EventPlaybackViewportProps) {
  const { isDesktop } = useShellLayout()
  const allowZoom = zoomEnabled ?? isDesktop
  const [layoutTick, setLayoutTick] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const bump = () => setLayoutTick(t => t + 1)
    video.addEventListener('loadedmetadata', bump)
    video.addEventListener('loadeddata', bump)
    video.addEventListener('resize', bump)
    window.addEventListener('resize', bump)

    if (video.videoWidth > 0) bump()

    return () => {
      video.removeEventListener('loadedmetadata', bump)
      video.removeEventListener('loadeddata', bump)
      video.removeEventListener('resize', bump)
      window.removeEventListener('resize', bump)
    }
  }, [videoRef, bbox, subjectBbox, relatedBbox, zoomBbox, frameWidth, frameHeight])

  const overlayBoxes = useMemo(() => {
    const video = videoRef.current
    if (!frameWidth || !frameHeight || !video?.videoWidth || !video.videoHeight) {
      return undefined
    }

    const map = (target?: ViolationBbox) => (
      target
        ? mapOverlayBox(target, frameWidth, frameHeight, video, videoFit, videoObjectPosition)
        : undefined
    )

    return {
      violation: map(bbox),
      subject: map(subjectBbox),
      related: map(relatedBbox),
      zoom: map(
        zoomBbox
        ?? unionBboxes(bbox, subjectBbox, relatedBbox)
        ?? bbox
        ?? subjectBbox
        ?? relatedBbox,
      ),
    }
  }, [bbox, subjectBbox, relatedBbox, zoomBbox, frameWidth, frameHeight, videoRef, videoFit, videoObjectPosition, layoutTick])

  const zoomStyle = useMemo(() => {
    if (!allowZoom || !overlayBoxes?.zoom) return undefined
    const overlayBox = overlayBoxes.zoom
    const cx = overlayBox.x + overlayBox.w / 2
    const cy = overlayBox.y + overlayBox.h / 2
    const boxW = Math.max(overlayBox.w / 100, 0.08)
    const boxH = Math.max(overlayBox.h / 100, 0.08)
    const maxScale = isDesktop ? 2.6 : 1.35
    const scale = Math.min(0.88 / boxW, 0.88 / boxH, maxScale)
    return {
      transformOrigin: `${cx}% ${cy}%`,
      transform: `scale(${scale})`,
    }
  }, [allowZoom, overlayBoxes, isDesktop])

  const hasRoiOverlay = Boolean(
    overlayBoxes?.violation || overlayBoxes?.subject || overlayBoxes?.related,
  )

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      <div
        className={cn(
          'absolute inset-0',
          zoomStyle && 'will-change-transform',
        )}
        style={zoomStyle}
      >
        {children}
        {overlayBoxes?.related && (
          <PlaybackRoiBox
            box={overlayBoxes.related}
            className="border-2 border-dashed border-sky-400/90 shadow-[0_0_8px_rgba(56,189,248,0.25)]"
            label="Máy"
          />
        )}
        {overlayBoxes?.subject && (
          <PlaybackRoiBox
            box={overlayBoxes.subject}
            className="border border-dashed border-amber-300/90 shadow-[0_0_6px_rgba(252,211,77,0.2)]"
            label="CN"
          />
        )}
        {overlayBoxes?.violation && (
          <PlaybackRoiBox
            box={overlayBoxes.violation}
            className="border-2 border-red-400/95 shadow-[0_0_10px_rgba(248,113,113,0.35)]"
          />
        )}
        {!hasRoiOverlay && overlayBoxes?.zoom && (
          <PlaybackRoiBox
            box={overlayBoxes.zoom}
            className="border-2 border-red-400/95 shadow-[0_0_10px_rgba(248,113,113,0.35)]"
          />
        )}
      </div>
    </div>
  )
}

interface UseEventClipPlaybackOptions {
  enabled: boolean
  videoSrc?: string | null
  seekSec: number
  clipDurationSec?: number
  autoPlay?: boolean
  onClipProgress?: (currentInClip: number, clipDuration: number) => void
  onClipReady?: (clipStart: number, clipEnd: number) => void
}

export function useEventClipPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  {
    enabled,
    videoSrc,
    seekSec,
    clipDurationSec = 3,
    autoPlay = true,
    onClipProgress,
    onClipReady,
  }: UseEventClipPlaybackOptions,
) {
  const clipRef = useRef({ start: 0, end: clipDurationSec, duration: clipDurationSec })

  useEffect(() => {
    const video = videoRef.current
    if (!video || !enabled || !videoSrc) return

    const applyClip = () => {
      const dur = video.duration
      if (!Number.isFinite(dur) || dur <= 0) return
      const clip = buildEventClipWindow(seekSec, dur, clipDurationSec)
      clipRef.current = clip
      video.currentTime = clip.start
      onClipReady?.(clip.start, clip.end)
      onClipProgress?.(0, clip.duration)
      if (autoPlay) {
        video.muted = true
        void video.play().catch(() => {})
      }
    }

    const onLoaded = () => applyClip()
    video.addEventListener('loadedmetadata', onLoaded)
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) applyClip()

    return () => video.removeEventListener('loadedmetadata', onLoaded)
  }, [videoRef, enabled, videoSrc, seekSec, clipDurationSec, autoPlay, onClipProgress, onClipReady])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !enabled || !videoSrc) return

    const onTimeUpdate = () => {
      const clip = clipRef.current
      if (video.currentTime >= clip.end - 0.04) {
        video.currentTime = clip.start
      }
      onClipProgress?.(
        Math.max(0, video.currentTime - clip.start),
        clip.duration,
      )
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [videoRef, enabled, videoSrc, onClipProgress])
}
