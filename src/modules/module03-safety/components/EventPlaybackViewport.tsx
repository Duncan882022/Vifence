import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import { mapVideoRectToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import {
  buildEventClipWindow,
  type ViolationBbox,
} from '../utils/eventPlaybackClip'

interface EventPlaybackViewportProps {
  videoRef: RefObject<HTMLVideoElement | null>
  bbox?: ViolationBbox
  frameWidth?: number
  frameHeight?: number
  videoFit?: 'cover' | 'contain'
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
) {
  const sx = video.videoWidth / frameWidth
  const sy = video.videoHeight / frameHeight
  return mapVideoRectToOverlay(
    {
      x: bbox[0] * sx,
      y: bbox[1] * sy,
      width: (bbox[2] - bbox[0]) * sx,
      height: (bbox[3] - bbox[1]) * sy,
    },
    video,
    fit,
  )
}

export function EventPlaybackViewport({
  videoRef,
  bbox,
  frameWidth,
  frameHeight,
  videoFit = 'contain',
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
  }, [videoRef, bbox, frameWidth, frameHeight])

  const overlayBox = useMemo(() => {
    const video = videoRef.current
    if (!bbox || !frameWidth || !frameHeight || !video?.videoWidth || !video.videoHeight) {
      return undefined
    }
    const box = mapBboxToOverlay(bbox, frameWidth, frameHeight, video, videoFit)
    if (box.w <= 0.4 || box.h <= 0.4) return undefined
    return box
  }, [bbox, frameWidth, frameHeight, videoRef, videoFit, layoutTick])

  const zoomStyle = useMemo(() => {
    if (!allowZoom || !overlayBox) return undefined
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
  }, [allowZoom, overlayBox, isDesktop])

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
        {overlayBox && (
          <div
            className="absolute border-2 border-red-400/95 rounded-sm pointer-events-none z-[6] shadow-[0_0_10px_rgba(248,113,113,0.35)]"
            style={{
              left: `${overlayBox.x}%`,
              top: `${overlayBox.y}%`,
              width: `${overlayBox.w}%`,
              height: `${overlayBox.h}%`,
            }}
            aria-hidden
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
