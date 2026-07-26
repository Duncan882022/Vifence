import type { ViolationType } from '@/types/safety'

/**
 * Violation detection clips — cắt từ YouTube Unicons Safety Supervisors (Js-1FbF-7yU).
 * Mỗi clip 10s, 1280×720 — map theo clip có sẵn, gán vào 6 nhóm Safety Monitoring Dictionary.
 */
export type SafetyViolationFeedKey =
  | 'ppe-helmet'
  | 'ppe-vest'
  | 'work-at-height'
  | 'danger-zone'
  | 'traffic'
  | 'method-statement'
  | 'fire-hot-work'

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
  'ppe-helmet': 'violation-no-helmet.mp4',
  'ppe-vest': 'violation-no-vest.mp4',
  'work-at-height': 'violation-work-height.mp4',
  'danger-zone': 'violation-danger-zone.mp4',
  traffic: 'violation-danger-zone.mp4',
  'method-statement': 'violation-work-height.mp4',
  'fire-hot-work': 'violation-fall.mp4',
}

/** Nguồn: https://youtu.be/Js-1FbF-7yU — Life at Unicons S01 · GSAT An toàn */
export const VIOLATION_CLIP_MANIFEST: Record<SafetyViolationFeedKey, ViolationClipManifest> = {
  'ppe-helmet': {
    src: FEED_FILES['ppe-helmet'],
    markerSec: 3,
    sourceStartSec: 208,
    sourceEndSec: 218,
    label: 'PPE — Không đội mũ',
    description: 'Công nhân không đội mũ bảo hộ khi huấn luyện dây an toàn',
  },
  'ppe-vest': {
    src: FEED_FILES['ppe-vest'],
    markerSec: 2,
    sourceStartSec: 172,
    sourceEndSec: 182,
    label: 'PPE — Không áo bảo hộ',
    description: 'Công nhân không mặc áo bảo hộ tại khu huấn luyện',
  },
  'work-at-height': {
    src: FEED_FILES['work-at-height'],
    markerSec: 4,
    sourceStartSec: 248,
    sourceEndSec: 258,
    label: 'Làm việc trên cao',
    description: 'Thi công trên sàn cao — kiểm tra dây an toàn và mép biên',
  },
  'danger-zone': {
    src: FEED_FILES['danger-zone'],
    markerSec: 5,
    sourceStartSec: 260,
    sourceEndSec: 270,
    label: 'Khu vực nguy hiểm',
    description: 'Đứng gần lồng thang máy / miệng hố chưa che chắn',
  },
  traffic: {
    src: FEED_FILES.traffic,
    markerSec: 5,
    sourceStartSec: 260,
    sourceEndSec: 270,
    label: 'An toàn giao thông',
    description: 'Phương tiện di chuyển trong công trường — giám sát tốc độ và điều hướng',
  },
  'method-statement': {
    src: FEED_FILES['method-statement'],
    markerSec: 4,
    sourceStartSec: 248,
    sourceEndSec: 258,
    label: 'Biện pháp thi công',
    description: 'Thi công trên cao — kiểm tra lan can, lưới chống rơi theo biện pháp',
  },
  'fire-hot-work': {
    src: FEED_FILES['fire-hot-work'],
    markerSec: 3,
    sourceStartSec: 252,
    sourceEndSec: 262,
    label: 'PCCC & CV nóng',
    description: 'Phát hiện hàn cắt, khói hoặc nguồn lửa tại hiện trường',
  },
}

const TYPE_TO_FEED: Record<ViolationType, SafetyViolationFeedKey> = {
  ppe: 'ppe-helmet',
  'work-at-height': 'work-at-height',
  'danger-zone': 'danger-zone',
  'traffic-safety': 'traffic',
  'method-statement': 'method-statement',
  'fire-hot-work': 'fire-hot-work',
}

export function getViolationFeedUrl(type: ViolationType): string {
  const key = TYPE_TO_FEED[type]
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}camera-feeds/${FEED_FILES[key]}`
}

/** Timestamp offset (seconds) to seek near the violation moment in each clip */
export const VIOLATION_CLIP_MARKERS: Record<SafetyViolationFeedKey, number> = {
  'ppe-helmet': VIOLATION_CLIP_MANIFEST['ppe-helmet'].markerSec,
  'ppe-vest': VIOLATION_CLIP_MANIFEST['ppe-vest'].markerSec,
  'work-at-height': VIOLATION_CLIP_MANIFEST['work-at-height'].markerSec,
  'danger-zone': VIOLATION_CLIP_MANIFEST['danger-zone'].markerSec,
  traffic: VIOLATION_CLIP_MANIFEST.traffic.markerSec,
  'method-statement': VIOLATION_CLIP_MANIFEST['method-statement'].markerSec,
  'fire-hot-work': VIOLATION_CLIP_MANIFEST['fire-hot-work'].markerSec,
}

export function getViolationClipMarker(type: ViolationType): number {
  const key = TYPE_TO_FEED[type]
  return VIOLATION_CLIP_MARKERS[key]
}

export function getViolationClipManifest(type: ViolationType): ViolationClipManifest {
  const key = TYPE_TO_FEED[type]
  return VIOLATION_CLIP_MANIFEST[key]
}
