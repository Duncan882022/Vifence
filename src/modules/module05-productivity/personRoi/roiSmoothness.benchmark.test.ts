/**
 * Self-check ROI — mô phỏng nhịp analyze bodycam ~300ms.
 * displayCoastMaxMiss=0: miss frame ẩn ngay (không ghost). EMA glide=1: bám sát measurement.
 */
import { describe, expect, it } from 'vitest'
import {
  advancePersonRoiTracks,
  predictPersonRoiTracks,
  resetPersonRoiTrackSeq,
} from './personRoiTracker'
import { PatrolPersonRoiEngine } from './patrolPersonRoiEngine'
import { PATROL_PERSON_ROI_CONFIG } from './patrolPersonRoi.config'

const ANALYZE_MS = 300
const RAF_MS = 1000 / 60
const DURATION_MS = 4000

function person(bbox: [number, number, number, number], extra: Record<string, unknown> = {}) {
  return {
    behavior: 'person' as const,
    label: 'person',
    confidence: 0.72,
    bbox,
    track_id: 'ptk0001:person',
    velocity: [85, 12] as [number, number],
    ...extra,
  }
}

describe('ROI smoothness self-check', () => {
  it('uptime benchmark — detection liên tục, rAF nội suy giữa nhịp analyze', () => {
    resetPersonRoiTrackSeq()
    let tracks = new Map<string, ReturnType<typeof advancePersonRoiTracks> extends Map<string, infer T> ? T : never>()
    let t = 0
    let visibleFrames = 0
    let totalFrames = 0

    while (t < DURATION_MS) {
      const isAnalyzeTick = t % ANALYZE_MS < RAF_MS
      if (isAnalyzeTick) {
        const x = 100 + (t / 1000) * 85
        tracks = advancePersonRoiTracks(
          tracks,
          [person([x, 100, x + 100, 400], { face_eligible: true, tier: 'person' })],
          ANALYZE_MS,
          Date.now() + t,
        )
      }

      const displays = predictPersonRoiTracks(tracks, (t % ANALYZE_MS) || RAF_MS)
      totalFrames += 1
      if (displays.length > 0) visibleFrames += 1
      t += RAF_MS
    }

    const uptime = visibleFrames / totalFrames
    expect(uptime).toBeGreaterThanOrEqual(0.92)
  })

  it('miss frame — ẩn ngay, không coast ghost', () => {
    resetPersonRoiTrackSeq()
    let tracks = advancePersonRoiTracks(
      new Map(),
      [person([100, 100, 200, 400], { track_id: 'p1', tier: 'person', face_eligible: true })],
      ANALYZE_MS,
      1_000,
    )
    expect(predictPersonRoiTracks(tracks, 0)).toHaveLength(1)

    tracks = advancePersonRoiTracks(tracks, [], ANALYZE_MS, 1_300)
    expect(predictPersonRoiTracks(tracks, 0)).toHaveLength(0)
  })

  it('EMA benchmark — nhảy bbox giữa các frame rAF', () => {
    const engine = new PatrolPersonRoiEngine('HC-02-bench')
    let t = 0
    let lastCx = 0
    let maxJump = 0
    const jumps: number[] = []

    while (t < DURATION_MS) {
      if (t % ANALYZE_MS < RAF_MS) {
        const x = 120 + (t / 1000) * 90
        engine.ingest([person([x, 110, x + 100, 410])], t)
      }
      const displays = engine.predictDisplay(t)
      if (displays[0]) {
        const cx = (displays[0].bbox[0] + displays[0].bbox[2]) / 2
        if (lastCx > 0) {
          const jump = Math.abs(cx - lastCx)
          jumps.push(jump)
          maxJump = Math.max(maxJump, jump)
        }
        lastCx = cx
      }
      t += RAF_MS
    }

    const avgJump = jumps.length ? jumps.reduce((a, b) => a + b, 0) / jumps.length : 0
    expect(maxJump).toBeLessThanOrEqual(30)
    expect(avgJump).toBeLessThanOrEqual(8)
    expect(PATROL_PERSON_ROI_CONFIG.displayEmaGlideAlpha).toBeGreaterThanOrEqual(0.9)
  })
})
