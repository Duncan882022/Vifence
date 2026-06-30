import type { ViolationType } from '@/types/safety'

/**
 * Violation detection clips — cắt từ YouTube Unicons Safety Supervisors (Js-1FbF-7yU).
 * Mỗi clip 10s, 1280×720, map 1:1 theo loại hành vi AI phát hiện.
 */
export type SafetyViolationFeedKey =
  | 'no-helmet'
  | 'no-vest'
  | 'no-harness'
  | 'danger-zone'
  | 'work-at-height'
  | 'fall'

export interface ViolationClipManifest {
  src: string
  /** Seconds into the pre-cut clip where AI flags the violation */
  markerSec: number
  /** Source offset in original YouTube video (Js-1FbF-7yU) */
  sourceStartSec: number
  sourceEndSec: number
  label: string
  description: string
}

const FEED_FILES: Record<SafetyViolationFeedKey, string> = {
  'no-helmet': 'violation-no-helmet.mp4',
  'no-vest': 'violation-no-vest.mp4',
  'no-harness': 'violation-no-harness.mp4',
  'danger-zone': 'violation-danger-zone.mp4',
  'work-at-height': 'violation-work-height.mp4',
  'fall': 'violation-fall.mp4',
}

/** Nguồn: https://youtu.be/Js-1FbF-7yU — Life at Unicons S01 · GSAT An toàn */
export const VIOLATION_CLIP_MANIFEST: Record<SafetyViolationFeedKey, ViolationClipManifest> = {
  'no-helmet': {
    src: FEED_FILES['no-helmet'],
    markerSec: 3,
    sourceStartSec: 208,
    sourceEndSec: 218,
    label: 'Không đội mũ',
    description: 'Công nhân không đội mũ bảo hộ khi huấn luyện dây an toàn',
  },
  'no-vest': {
    src: FEED_FILES['no-vest'],
    markerSec: 2,
    sourceStartSec: 172,
    sourceEndSec: 182,
    label: 'Không áo phản quang',
    description: 'Công nhân không mặc áo phản quang tại khu huấn luyện',
  },
  'no-harness': {
    src: FEED_FILES['no-harness'],
    markerSec: 4,
    sourceStartSec: 195,
    sourceEndSec: 205,
    label: 'Không dây an toàn',
    description: 'Huấn luyện móc cáp — công nhân chưa đeo dây an toàn đầy đủ',
  },
  'danger-zone': {
    src: FEED_FILES['danger-zone'],
    markerSec: 5,
    sourceStartSec: 260,
    sourceEndSec: 270,
    label: 'Vào vùng nguy hiểm',
    description: 'Đứng gần lồng thang máy / miệng hố chưa che chắn',
  },
  'work-at-height': {
    src: FEED_FILES['work-at-height'],
    markerSec: 4,
    sourceStartSec: 248,
    sourceEndSec: 258,
    label: 'Làm việc trên cao',
    description: 'Thi công trên sàn cao — kiểm tra PPE và dây an toàn',
  },
  'fall': {
    src: FEED_FILES['fall'],
    markerSec: 3,
    sourceStartSec: 252,
    sourceEndSec: 262,
    label: 'Bị ngã / té ngã',
    description: 'Sitewalk sàn mái — công nhân gần mép / vùng nguy cơ té ngã',
  },
}

const TYPE_TO_FEED: Record<ViolationType, SafetyViolationFeedKey> = {
  'no-helmet': 'no-helmet',
  'no-vest': 'no-vest',
  'no-harness': 'no-harness',
  'danger-zone': 'danger-zone',
  'work-at-height': 'work-at-height',
  'fall': 'fall',
}

export function getViolationFeedUrl(type: ViolationType): string {
  const key = TYPE_TO_FEED[type]
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}camera-feeds/${FEED_FILES[key]}`
}

/** Timestamp offset (seconds) to seek near the violation moment in each clip */
export const VIOLATION_CLIP_MARKERS: Record<SafetyViolationFeedKey, number> = {
  'no-helmet': VIOLATION_CLIP_MANIFEST['no-helmet'].markerSec,
  'no-vest': VIOLATION_CLIP_MANIFEST['no-vest'].markerSec,
  'no-harness': VIOLATION_CLIP_MANIFEST['no-harness'].markerSec,
  'danger-zone': VIOLATION_CLIP_MANIFEST['danger-zone'].markerSec,
  'work-at-height': VIOLATION_CLIP_MANIFEST['work-at-height'].markerSec,
  'fall': VIOLATION_CLIP_MANIFEST['fall'].markerSec,
}

export function getViolationClipMarker(type: ViolationType): number {
  const key = TYPE_TO_FEED[type]
  return VIOLATION_CLIP_MARKERS[key]
}

export function getViolationClipManifest(type: ViolationType): ViolationClipManifest {
  const key = TYPE_TO_FEED[type]
  return VIOLATION_CLIP_MANIFEST[key]
}
