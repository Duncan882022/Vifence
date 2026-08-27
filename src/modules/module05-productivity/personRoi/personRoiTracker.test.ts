/**
 * Patrol Person ROI tracker — khoá đối tượng theo track id BE + mượt bbox.
 */
import { describe, expect, it } from 'vitest'
import { advancePersonRoiTracks, predictPersonRoiTracks, resetPersonRoiTrackSeq } from './personRoiTracker'
import { PATROL_PERSON_ROI_CONFIG } from './patrolPersonRoi.config'
import type { Bbox, PersonRoiDetection, PersonRoiTrack } from './types'

function person(bbox: Bbox, extra: Partial<PersonRoiDetection> = {}): PersonRoiDetection {
  return {
    behavior: 'person',
    label: 'person',
    confidence: 0.6,
    bbox,
    ...extra,
  }
}

function advance(
  tracks: Map<string, PersonRoiTrack>,
  detections: PersonRoiDetection[],
  now: number,
): Map<string, PersonRoiTrack> {
  return advancePersonRoiTracks(tracks, detections, 180, now)
}

function empty(): Map<string, PersonRoiTrack> {
  resetPersonRoiTrackSeq()
  return new Map<string, PersonRoiTrack>()
}

describe('ingest bbox', () => {
  it('ưu tiên bbox display từ BE (đã mở rộng) thay subject_bbox YOLO thô', () => {
    const raw: Bbox = [100, 100, 200, 280]
    const expanded: Bbox = [100, 100, 200, 400]
    const tracks = advance(empty(), [person(expanded, { subject_bbox: raw, track_id: 'p1' })], 1_000)
    const display = predictPersonRoiTracks(tracks, 0)[0].bbox
    expect(display[3] - display[1]).toBeCloseTo(expanded[3] - expanded[1], 0)
    expect(display[3] - display[1]).toBeGreaterThan(raw[3] - raw[1])
  })
})

describe('khoá đối tượng theo track id backend', () => {
  it('giữ nguyên track khi bbox nhảy hẳn ra chỗ khác (bodycam xoay)', () => {
    let tracks = advance(empty(), [person([100, 100, 200, 400], { track_id: 'p1' })], 1_000)
    const firstId = [...tracks.keys()][0]

    // Khung sau bbox không còn chồng lên khung trước — IoU = 0.
    tracks = advance(tracks, [person([600, 120, 700, 420], { track_id: 'p1' })], 1_180)

    expect(tracks.size).toBe(1)
    expect([...tracks.keys()][0]).toBe(firstId)
  })

  it('không có track id thì IoU trượt sẽ sinh track mới', () => {
    let tracks = advance(empty(), [person([100, 100, 200, 400])], 1_000)
    tracks = advance(tracks, [person([600, 120, 700, 420])], 1_180)
    expect(tracks.size).toBe(2)
  })

  it('hai người khác track id không bị gộp dù bbox chồng nhau', () => {
    let tracks = advance(empty(), [person([100, 100, 200, 400], { track_id: 'p1', tier: 'person', worker_id: 'sgc-00000107' })], 1_000)
    tracks = advance(
      tracks,
      [
        person([100, 100, 200, 400], { track_id: 'p1', tier: 'person', worker_id: 'sgc-00000107' }),
        person([110, 105, 210, 405], { track_id: 'p2', tier: 'person', worker_id: 'sgc-00000109' }),
      ],
      1_180,
    )
    const anchors = [...tracks.values()].map(t => t.anchorKey).sort()
    expect(anchors).toEqual(['trk:p1', 'trk:p2'])
  })

  it('Đối tượng trùng Người chỉ còn một track dù khác track_id backend', () => {
    let tracks = advance(
      empty(),
      [
        person([100, 100, 220, 480], { track_id: 'a', tier: 'person', worker_id: 'sgc-00000107' }),
        person([130, 180, 200, 360], { track_id: 'b', tier: 'object', confidence: 0.77 }),
      ],
      1_000,
    )
    expect(tracks.size).toBe(1)
    expect([...tracks.values()][0].tier).toBe('person')
  })

  it('detection có track id hiện ROI ngay từ frame đầu', () => {
    const tracks = advance(empty(), [person([100, 100, 200, 400], { track_id: 'p1' })], 1_000)
    expect(predictPersonRoiTracks(tracks, 0)).toHaveLength(1)
    expect([...tracks.values()][0].state).toBe('confirmed')
  })

  it('không có track id thì vẫn vẽ ngay từ frame đầu', () => {
    const tracks = advance(empty(), [person([100, 100, 200, 400])], 1_000)
    const displays = predictPersonRoiTracks(tracks, 0)
    expect(displays).toHaveLength(1)
    expect([...tracks.values()][0].state).toMatch(/tentative|confirmed/)
  })

  it('worker_id làm khoá khi backend chưa gửi track id', () => {
    let tracks = advance(empty(), [person([100, 100, 200, 400], { worker_id: 'sgc-00000001' })], 1_000)
    const firstId = [...tracks.keys()][0]
    tracks = advance(tracks, [person([600, 120, 700, 420], { worker_id: 'sgc-00000001' })], 1_180)
    expect([...tracks.keys()][0]).toBe(firstId)
  })
})

describe('bbox mượt', () => {
  it('kích thước không giật theo một lần đo nhiễu', () => {
    let tracks = empty()
    let now = 1_000
    for (let i = 0; i < 6; i += 1) {
      tracks = advance(tracks, [person([100, 100, 200, 400], { track_id: 'p1' })], now)
      now += 180
    }
    const before = [...tracks.values()][0].kalman.h

    // YOLO trả một khung cao gấp rưỡi trong đúng một frame.
    tracks = advance(tracks, [person([100, 100, 200, 550], { track_id: 'p1' })], now)
    const after = [...tracks.values()][0].kalman.h

    const jump = (after - before) / (450 - before)
    expect(jump).toBeLessThan(0.5)
    expect(jump).toBeGreaterThan(0)
  })

  it('vận tốc bị chặn trần nên box không bay khi extrapolate', () => {
    let tracks = advance(empty(), [person([100, 100, 200, 400], { track_id: 'p1' })], 1_000)
    tracks = advance(tracks, [person([900, 100, 1000, 400], { track_id: 'p1' })], 1_180)

    const kalman = [...tracks.values()][0].kalman
    const maxSpeed = Math.max(kalman.w, kalman.h) * PATROL_PERSON_ROI_CONFIG.maxSpeedBoxPerSec
    expect(Math.abs(kalman.vx)).toBeLessThanOrEqual(maxSpeed + 1e-6)
  })

  it('track có id backend bám nhanh hơn khi người đi đều', () => {
    let anchored = empty()
    let plain = empty()
    let now = 1_000
    let x = 100
    for (let i = 0; i < 8; i += 1) {
      anchored = advance(anchored, [person([x, 100, x + 100, 400], { track_id: 'p1' })], now)
      plain = advance(plain, [person([x, 100, x + 100, 400])], now)
      now += 180
      x += 60
    }

    const measuredCx = (x - 60) + 50
    const anchoredLag = measuredCx - [...anchored.values()][0].kalman.cx
    const plainLag = measuredCx - [...plain.values()][0].kalman.cx

    expect(anchoredLag).toBeLessThan(plainLag)
    expect(anchoredLag).toBeLessThan(45)
  })

  it('extrapolate giới hạn trong một nhịp analyze', () => {
    const tracks = advance(empty(), [person([100, 100, 200, 400], { track_id: 'p1' })], 1_000)
    expect(PATROL_PERSON_ROI_CONFIG.maxPredictMs).toBeGreaterThanOrEqual(600)
    const far = predictPersonRoiTracks(tracks, 5_000)
    const capped = predictPersonRoiTracks(tracks, PATROL_PERSON_ROI_CONFIG.maxPredictMs)
    expect(far[0].bbox).toEqual(capped[0].bbox)
  })

})

describe('tầng định danh từ backend', () => {
  it('mặc định là Đối tượng khi backend chưa gửi tier', () => {
    const tracks = advance(empty(), [person([100, 100, 200, 400], { track_id: 'p1' })], 1_000)
    expect(predictPersonRoiTracks(tracks, 0)[0].tier).toBe('object')
  })

  it('đi lên theo backend: Đối tượng → Người → Định danh', () => {
    let tracks = advance(
      empty(), [person([100, 100, 200, 400], { track_id: 'p1', tier: 'object' })], 1_000,
    )
    expect(predictPersonRoiTracks(tracks, 0)[0].tier).toBe('object')

    tracks = advance(
      tracks, [person([104, 102, 204, 402], { track_id: 'p1', tier: 'person' })], 1_180,
    )
    expect(predictPersonRoiTracks(tracks, 0)[0].tier).toBe('person')

    tracks = advance(
      tracks, [person([108, 104, 208, 404], { track_id: 'p1', tier: 'identity' })], 1_360,
    )
    expect(predictPersonRoiTracks(tracks, 0)[0].tier).toBe('identity')
  })

  it('payload trễ nhịp không kéo nhãn tụt xuống', () => {
    let tracks = advance(
      empty(), [person([100, 100, 200, 400], { track_id: 'p1', tier: 'identity' })], 1_000,
    )
    tracks = advance(
      tracks, [person([104, 102, 204, 402], { track_id: 'p1', tier: 'object' })], 1_180,
    )
    expect(predictPersonRoiTracks(tracks, 0)[0].tier).toBe('identity')
  })
})

describe('mồi vận tốc từ backend', () => {
  it('track mới đã có vận tốc nên không trễ một nhịp analyze', () => {
    const tracks = advance(
      empty(),
      [person([100, 100, 200, 400], { track_id: 'p1', velocity: [240, 0] })],
      1_000,
    )
    const kalman = [...tracks.values()][0].kalman
    expect(kalman.vx).toBeGreaterThan(0)

    const [still, moved] = [
      predictPersonRoiTracks(tracks, 0)[0].bbox,
      predictPersonRoiTracks(tracks, 200)[0].bbox,
    ]
    expect(moved[0]).toBeGreaterThan(still[0])
  })

  it('vận tốc backend vẫn bị chặn theo trần tốc độ', () => {
    const tracks = advance(
      empty(),
      [person([100, 100, 200, 400], { track_id: 'p1', velocity: [999_999, 0] })],
      1_000,
    )
    const kalman = [...tracks.values()][0].kalman
    const maxSpeed = Math.max(kalman.w, kalman.h) * PATROL_PERSON_ROI_CONFIG.maxSpeedBoxPerSec
    expect(Math.abs(kalman.vx)).toBeLessThanOrEqual(maxSpeed + 1e-6)
  })
})

describe('vòng đời track', () => {
  it('miss một nhịp vẫn coast ROI thay vì tắt ngay', () => {
    let tracks = advance(empty(), [person([100, 100, 200, 400], { track_id: 'p1' })], 1_000)
    expect(predictPersonRoiTracks(tracks, 0)).toHaveLength(1)

    tracks = advance(tracks, [], 1_180)
    expect([...tracks.values()][0].state).toBe('lost')
    const coasting = predictPersonRoiTracks(tracks, 120)
    expect(coasting).toHaveLength(1)
    expect(coasting[0].displayOpacity).toBeLessThan(1)
  })

  it('track mất dấu vẫn nằm trong bộ nhớ để nhận lại sau lúc bị che', () => {
    let tracks = advance(empty(), [person([100, 100, 200, 400], { track_id: 'p1' })], 1_000)
    const firstId = [...tracks.keys()][0]

    tracks = advance(tracks, [], 1_180)
    expect(predictPersonRoiTracks(tracks, 0).length).toBeGreaterThan(0)

    tracks = advance(tracks, [person([120, 110, 220, 410], { track_id: 'p1' })], 1_360)
    expect([...tracks.keys()][0]).toBe(firstId)
    expect(predictPersonRoiTracks(tracks, 0)).toHaveLength(1)
  })

  it('độ tin cậy suy giảm, không giữ đỉnh của cả đời track', () => {
    // Nhãn "93%" đứng nguyên trong khi track đã yếu hẳn là thông tin sai.
    let tracks = advance(empty(), [person([100, 100, 200, 400], { track_id: 'p1', confidence: 0.93 })], 1_000)
    expect([...tracks.values()][0].confidence).toBeCloseTo(0.93, 2)

    tracks = advance(tracks, [person([104, 102, 204, 402], { track_id: 'p1', confidence: 0.30 })], 1_180)
    const after = [...tracks.values()][0].confidence
    expect(after).toBeLessThan(0.93)
    expect(after).toBeGreaterThanOrEqual(0.30)
  })

  it('track quay lại sau khi mất vẫn giữ nguyên id', () => {
    let tracks = advance(empty(), [person([100, 100, 200, 400], { track_id: 'p1' })], 1_000)
    const firstId = [...tracks.keys()][0]
    tracks = advance(tracks, [], 1_180)
    tracks = advance(tracks, [person([120, 110, 220, 410], { track_id: 'p1' })], 1_360)
    expect(tracks.size).toBe(1)
    expect([...tracks.keys()][0]).toBe(firstId)
    expect([...tracks.values()][0].state).toBe('confirmed')
  })
})
