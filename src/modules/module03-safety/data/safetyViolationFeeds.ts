import type { ViolationType } from '@/types/safety'

export type SafetyViolationFeedKey =
  | 'no-helmet'
  | 'no-vest'
  | 'work-at-height'
  | 'fall'
  | 'no-harness'
  | 'danger-zone'

const FEED_FILES: Record<SafetyViolationFeedKey, string> = {
  'no-helmet': 'violation-no-helmet.mp4',
  'no-vest': 'violation-no-vest.mp4',
  'work-at-height': 'violation-work-height.mp4',
  'fall': 'violation-fall.mp4',
  'no-harness': 'violation-fall.mp4',
  'danger-zone': 'violation-work-height.mp4',
}

const TYPE_TO_FEED: Record<ViolationType, SafetyViolationFeedKey> = {
  'no-helmet': 'no-helmet',
  'no-vest': 'no-vest',
  'work-at-height': 'work-at-height',
  'no-harness': 'no-harness',
  'danger-zone': 'danger-zone',
  'fall': 'fall',
}

export function getViolationFeedUrl(type: ViolationType): string {
  const key = TYPE_TO_FEED[type]
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}camera-feeds/${FEED_FILES[key]}`
}

/** Timestamp offset (seconds) to seek near the violation moment in each clip */
export const VIOLATION_CLIP_MARKERS: Record<SafetyViolationFeedKey, number> = {
  'no-helmet': 2,
  'no-vest': 1,
  'work-at-height': 4,
  'fall': 3,
  'no-harness': 2,
  'danger-zone': 5,
}

export function getViolationClipMarker(type: ViolationType): number {
  const key = TYPE_TO_FEED[type]
  return VIOLATION_CLIP_MARKERS[key]
}
