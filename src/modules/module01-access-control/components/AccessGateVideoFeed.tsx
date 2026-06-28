import { useEffect, useRef } from 'react'
import { cn } from '@/utils/cn'
import { AccessAiOverlay } from './AccessAiOverlay'
import type { AccessAiDetection } from '@/types/access'

interface AccessGateVideoFeedProps {
  cameraId: string
  zone: string
  src: string
  detections: AccessAiDetection[]
  playing?: boolean
  compact?: boolean
}

export function AccessGateVideoFeed({
  cameraId,
  zone,
  src,
  detections,
  playing = true,
  compact,
}: AccessGateVideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [src, playing])

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className={cn(
          'absolute inset-0 h-full w-full object-cover',
          'scale-[1.04] saturate-[0.82] contrast-[1.06] brightness-[0.9]',
        )}
      />
      {!compact && (
        <AccessAiOverlay
          detections={detections}
          cameraId={cameraId}
          zone={zone}
          compact={compact}
        />
      )}
    </>
  )
}
