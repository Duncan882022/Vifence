/**
 * Self-check ROI coast + EMA — mô phỏng nhịp analyze bodycam ~300ms.
 * Pass: không có gap >180ms không có box khi người vẫn trong track.
 */
import {
  advancePersonRoiTracks,
  predictPersonRoiTracks,
  resetPersonRoiTrackSeq,
} from '../src/modules/module05-productivity/personRoi/personRoiTracker.ts'
import { PatrolPersonRoiEngine } from '../src/modules/module05-productivity/personRoi/patrolPersonRoiEngine.ts'

const ANALYZE_MS = 300
const RAF_MS = 1000 / 60
const DURATION_MS = 4000

function person(bbox, extra = {}) {
  return {
    behavior: 'person',
    label: 'person',
    confidence: 0.72,
    bbox,
    track_id: 'ptk0001:person',
    velocity: [85, 12],
    ...extra,
  }
}

function runTrackerBenchmark() {
  resetPersonRoiTrackSeq()
  let tracks = new Map()
  let t = 0
  let visibleFrames = 0
  let totalFrames = 0
  let maxGapMs = 0
  let gapMs = 0

  while (t < DURATION_MS) {
    const isAnalyzeTick = t % ANALYZE_MS < RAF_MS
    if (isAnalyzeTick) {
      const x = 100 + (t / 1000) * 85
      const hasDetection = Math.floor(t / ANALYZE_MS) % 3 !== 1 // miss every 3rd analyze
      const dets = hasDetection
        ? [person([x, 100, x + 100, 400])]
        : []
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
  return { uptime, maxGapMs, totalFrames, visibleFrames }
}

function runEngineBenchmark() {
  const engine = new PatrolPersonRoiEngine('HC-02-test')
  let t = 0
  let lastCx = 0
  let maxJump = 0
  const jumps = []

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
  return { maxJump, avgJump, samples: jumps.length }
}

const coast = runTrackerBenchmark()
const smooth = runEngineBenchmark()

console.log(JSON.stringify({
  coastBenchmark: {
    ...coast,
    passUptime: coast.uptime >= 0.92,
    passMaxGap: coast.maxGapMs <= 120,
  },
  emaBenchmark: {
    ...smooth,
    passMaxJump: smooth.maxJump <= 18,
    passAvgJump: smooth.avgJump <= 6,
  },
}, null, 2))
