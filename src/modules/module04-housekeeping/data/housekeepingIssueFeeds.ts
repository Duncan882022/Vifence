import type { IssueType } from '@/types/housekeeping'

export type HousekeepingIssueFeedKey =
  | 'waste-pile'
  | 'misplaced-material'
  | 'blocked-path'
  | 'unsanitary-zone'

const FEED_FILES: Record<HousekeepingIssueFeedKey, string> = {
  'waste-pile': 'violation-no-vest.mp4',
  'misplaced-material': 'violation-no-helmet.mp4',
  'blocked-path': 'violation-work-height.mp4',
  'unsanitary-zone': 'violation-fall.mp4',
}

const TYPE_TO_FEED: Record<IssueType, HousekeepingIssueFeedKey> = {
  'waste-pile': 'waste-pile',
  'misplaced-material': 'misplaced-material',
  'standing-water': 'unsanitary-zone',
  'messy-area': 'blocked-path',
  'blocked-path': 'blocked-path',
  'unsanitary-zone': 'unsanitary-zone',
}

export function getIssueFeedUrl(type: IssueType): string {
  const key = TYPE_TO_FEED[type]
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}camera-feeds/${FEED_FILES[key]}`
}

/** Timestamp offset (seconds) to seek near the issue moment in each clip */
export const ISSUE_CLIP_MARKERS: Record<HousekeepingIssueFeedKey, number> = {
  'waste-pile': 2,
  'misplaced-material': 1,
  'blocked-path': 4,
  'unsanitary-zone': 3,
}

export function getIssueClipMarker(type: IssueType): number {
  const key = TYPE_TO_FEED[type]
  return ISSUE_CLIP_MARKERS[key]
}
