import { describe, expect, it } from 'vitest'
import {
  clearPatrolPersonRoiEngine,
  clearPatrolPersonRoiTracks,
  getPatrolPersonRoiEngine,
  PatrolPersonRoiEngine,
} from './patrolPersonRoiEngine'
import { resolvePatrolPersonRoiConfig } from './patrolPersonRoi.config'
import type { Bbox, PersonRoiDetection } from './types'

function person(bbox: Bbox, trackId: string): PersonRoiDetection {
  return { behavior: 'person', label: 'person', confidence: 0.6, bbox, track_id: trackId }
}

const STALE_MS = resolvePatrolPersonRoiConfig('HC-01', null).displayMaxStaleMs

describe('PatrolPersonRoiEngine — luồng detections đứt', () => {
  it('gỡ hộp cuối cùng thay vì để nó đứng mãi trên video', () => {
    const engine = new PatrolPersonRoiEngine('HC-01')
    engine.ingest([person([100, 100, 200, 400], 'p1')], 1_000)

    expect(engine.predictDisplay(1_100)).toHaveLength(1)
    // `missStreak` không tăng khi không còn nhịp ingest nào — chỉ có hạn dùng
    // theo đồng hồ mới phát hiện được là luồng đã chết.
    expect(engine.predictDisplay(1_000 + STALE_MS + 50)).toHaveLength(0)
  })

  it('nối lại luồng thì bám từ vị trí mới, không hồi sinh track cũ', () => {
    const engine = new PatrolPersonRoiEngine('HC-01')
    engine.ingest([person([100, 100, 200, 400], 'p1')], 1_000)
    engine.predictDisplay(1_000 + STALE_MS + 50)

    engine.ingest([person([600, 100, 700, 400], 'p1')], 5_000)
    const tracks = engine.predictDisplay(5_050)
    expect(tracks).toHaveLength(1)
    expect(tracks[0].bbox[0]).toBeGreaterThan(500)
  })
})

describe('clearPatrolPersonRoiTracks', () => {
  it('xoá track nhưng giữ đúng instance cho overlay đang mounted', () => {
    clearPatrolPersonRoiEngine('DR-03')
    const engine = getPatrolPersonRoiEngine('DR-03')
    engine.ingest([person([100, 100, 200, 400], 'p1')])
    expect(engine.getDisplayTracks()).toHaveLength(1)

    clearPatrolPersonRoiTracks('DR-03')

    expect(engine.getDisplayTracks()).toHaveLength(0)
    expect(getPatrolPersonRoiEngine('DR-03')).toBe(engine)
  })
})
