import { useEffect, useState, type RefObject } from 'react'
import type { CameraFeedKey } from '../data/trainingCameraFeeds'
import {
  type AiOverlayBox,
  feedUsesKeyframeFallback,
  getKeyframesForFeed,
  interpolateBoxes,
} from '../data/cameraAiOverlayKeyframes'
import { detectPeopleInVideo, preloadFaceDetection } from '../services/faceDetection.service'

const DETECT_INTERVAL_MS = 800

function staggerMs(feedKey: CameraFeedKey): number {
  let hash = 0
  for (let i = 0; i < feedKey.length; i++) hash += feedKey.charCodeAt(i)
  return (hash % 6) * 110
}

/**
 * Box overlay: COCO-SSD detect người (mọi góc) + BlazeFace bổ sung mặt.
 * Keyframe chỉ dùng cho feed legacy (Mixkit).
 */
export function useFaceOverlayBoxes(
  feedKey: CameraFeedKey,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): AiOverlayBox[] {
  const [boxes, setBoxes] = useState<AiOverlayBox[]>([])
  const allowKeyframeFallback = feedUsesKeyframeFallback(feedKey)

  useEffect(() => {
    preloadFaceDetection()
  }, [])

  useEffect(() => {
    if (!enabled) {
      setBoxes([])
      return
    }

    const video = videoRef.current
    if (!video) return

    const keyframes = getKeyframesForFeed(feedKey)
    let detectTimer: number | undefined
    let startTimer: number | undefined
    let resizeObserver: ResizeObserver | undefined
    let cancelled = false
    let detecting = false
    let emptyStreak = 0

    const applyKeyframes = () => {
      if (!allowKeyframeFallback) return
      if (!video.duration || Number.isNaN(video.currentTime)) return
      setBoxes(interpolateBoxes(keyframes, video.currentTime))
    }

    const runDetection = async () => {
      if (cancelled || detecting) return
      if (!video.videoWidth || video.readyState < 2) return

      detecting = true
      try {
        const people = await detectPeopleInVideo(video, feedKey)
        if (cancelled) return

        if (people.length > 0) {
          emptyStreak = 0
          setBoxes(people)
          return
        }

        emptyStreak += 1
        if (allowKeyframeFallback && emptyStreak >= 3) {
          applyKeyframes()
        } else if (!allowKeyframeFallback) {
          setBoxes([])
        }
      } finally {
        detecting = false
      }
    }

    const start = () => {
      if (allowKeyframeFallback) applyKeyframes()
      void runDetection()
      detectTimer = window.setInterval(() => {
        void runDetection()
      }, DETECT_INTERVAL_MS)
    }

    startTimer = window.setTimeout(start, staggerMs(feedKey))

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        void runDetection()
      })
      resizeObserver.observe(video)
    }

    return () => {
      cancelled = true
      if (startTimer) window.clearTimeout(startTimer)
      if (detectTimer) window.clearInterval(detectTimer)
      resizeObserver?.disconnect()
    }
  }, [allowKeyframeFallback, enabled, feedKey, videoRef])

  return boxes
}
