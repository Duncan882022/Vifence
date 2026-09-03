import { describe, expect, it } from 'vitest'
import type { PatrolAppearanceSegment } from '../services/patrolDayEvents.service'
import {
  fillMissingNewestAppearanceSnapshot,
  resolveAppearanceSnapshotUrl,
} from './patrolAppearanceSnapshot'

function makeSegment(over: Partial<PatrolAppearanceSegment>): PatrolAppearanceSegment {
  return {
    id: 1,
    cameraId: 'HC-01',
    zoneId: null,
    startedAt: 1_000,
    endedAt: 1_060,
    gpsLat: null,
    gpsLng: null,
    gpsLatEnd: null,
    gpsLngEnd: null,
    presenceSeq: 1,
    sourceCameras: [],
    snapshotUrl: undefined,
    trackId: 'ptk-1',
    sessionId: 'sess-1',
    counted: false,
    ...over,
  } as PatrolAppearanceSegment
}

describe('resolveAppearanceSnapshotUrl', () => {
  it('trả ảnh của chính lượt đó', () => {
    const segment = makeSegment({ snapshotUrl: 'https://x/luot-2.jpg' })
    expect(resolveAppearanceSnapshotUrl(segment)).toBe('https://x/luot-2.jpg')
  })

  it('lượt không có ảnh thì để trống, không mượn ảnh khác', () => {
    expect(resolveAppearanceSnapshotUrl(makeSegment({}))).toBeUndefined()
  })

  it('chuỗi rỗng hoặc toàn khoảng trắng coi như không có ảnh', () => {
    expect(resolveAppearanceSnapshotUrl(makeSegment({ snapshotUrl: '   ' }))).toBeUndefined()
  })
})

describe('fillMissingNewestAppearanceSnapshot', () => {
  it('chỉ lấp ảnh thẻ cho lượt mới nhất', () => {
    const segments = [
      makeSegment({ id: 2, startedAt: 2_000 }),
      makeSegment({ id: 1, startedAt: 1_000 }),
    ]
    const filled = fillMissingNewestAppearanceSnapshot(segments, 'https://x/card.jpg')

    expect(filled[0].snapshotUrl).toBe('https://x/card.jpg')
    expect(filled[1].snapshotUrl).toBeUndefined()
  })

  it('lượt mới nhất đã có ảnh riêng thì giữ nguyên', () => {
    const segments = [makeSegment({ id: 2, snapshotUrl: 'https://x/luot.jpg' })]
    const filled = fillMissingNewestAppearanceSnapshot(segments, 'https://x/card.jpg')

    expect(filled[0].snapshotUrl).toBe('https://x/luot.jpg')
  })

  it('không có ảnh thẻ thì trả nguyên danh sách', () => {
    const segments = [makeSegment({})]
    expect(fillMissingNewestAppearanceSnapshot(segments, undefined)).toBe(segments)
  })

  it('danh sách rỗng trả nguyên danh sách', () => {
    const segments: PatrolAppearanceSegment[] = []
    expect(fillMissingNewestAppearanceSnapshot(segments, 'https://x/card.jpg')).toBe(segments)
  })

  it('không có hai lượt nào dùng chung một ảnh', () => {
    const segments = [
      makeSegment({ id: 3, snapshotUrl: undefined }),
      makeSegment({ id: 2, snapshotUrl: 'https://x/b.jpg' }),
      makeSegment({ id: 1, snapshotUrl: undefined }),
    ]
    const urls = fillMissingNewestAppearanceSnapshot(segments, 'https://x/card.jpg')
      .map(resolveAppearanceSnapshotUrl)
      .filter((url): url is string => Boolean(url))

    expect(new Set(urls).size).toBe(urls.length)
  })
})
