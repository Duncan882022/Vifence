/**
 * Self-check ROI — mô phỏng nhịp analyze bodycam ~300ms, miss 1/3 frame.
 * Pass = uptime ≥92%, gap tối đa ≤120ms, nhảy bbox trung bình ≤6px.
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
  it('coast benchmark — miss frame vẫn giữ box', () => {
    resetPersonRoiTrackSeq()
    let tracks = new Map<string, ReturnType<typeof advancePersonRoiTracks> extends Map<string, infer T> ? T : never>()
    let t = 0
    let visibleFrames = 0
    let totalFrames = 0
    let maxGapMs = 0
    let gapMs = 0

    while (t < DURATION_MS) {
      const isAnalyzeTick = t % ANALYZE_MS < RAF_MS
      if (isAnalyzeTick) {
        const x = 100 + (t / 1000) * 85
        const hasDetection = Math.floor(t / ANALYZE_MS) % 3 !== 1
        const dets = hasDetection ? [person([x, 100, x + 100, 400])] : []
        tracks = advancePersonRoiTracks(tracks, dets, ANALYZE_MS, Date.now() + t)
      }

      const displays = predictPersonRoiTracks(tracks, (t % ANALYZE_MS) || RAF_MS)
      totalFrames += 1
      if (displays.length > 0) {
        visibleFrames += 1
        gapMs = 0
      } else {
        gapMs += RAF_MS
        maxGapMs = Math.max(maxGapMs, gapMs)
      }
      t += RAF_MS
    }

    const uptime = visibleFrames / totalFrames
    expect(uptime).toBeGreaterThanOrEqual(0.92)
    expect(maxGapMs).toBeLessThanOrEqual(120)
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
    expect(maxJump).toBeLessThanOrEqual(18)
    expect(avgJump).toBeLessThanOrEqual(6)
    expect(PATROL_PERSON_ROI_CONFIG.displayEmaAlpha).toBeGreaterThan(0.3)
  })
})
