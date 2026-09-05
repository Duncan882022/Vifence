/**
 * Gate hiển thị (vẽ ROI) rộng hơn gate ghi sự kiện — yêu cầu nghiệp vụ:
 * bbox mọi người trong khung, nhưng chỉ ghi sự kiện cho đầu + ≥30% thân.
 */
import { describe, expect, it } from 'vitest'
import {
  patrolPersonLimbFragmentBbox,
  patrolPersonMeetsDetectionGate,
  patrolPersonMeetsDisplayGate,
  patrolMotorcycleSeatLikeFpBox,
  patrolPersonOverlapsVehicleFp,
  patrolPersonOversizedDisplayBbox,
  suppressPatrolObjectOverlappingIdentified,
  type Bbox4,
} from './patrolPersonVisibility'
import { bboxToPixelSpace } from '@/modules/module02-training/utils/videoOverlayCoords'

const FRAME_W = 1280
const FRAME_H = 720

function gates(bbox: Bbox4) {
  return {
    display: patrolPersonMeetsDisplayGate({ bbox, frameW: FRAME_W, frameH: FRAME_H }),
    event: patrolPersonMeetsDetectionGate({ bbox, frameW: FRAME_W, frameH: FRAME_H }),
  }
}

describe('gate hiển thị ROI', () => {
  it('người đứng đủ đầu + thân qua cả hai gate', () => {
    const { display, event } = gates([520, 140, 700, 660])
    expect(display).toBe(true)
    expect(event).toBe(true)
  })

  it('thân trên không thấy đầu vẫn vẽ ROI nhưng không ghi sự kiện', () => {
    const bbox: Bbox4 = [500, FRAME_H * 0.42, 800, FRAME_H * 0.72]
    const { display, event } = gates(bbox)
    expect(display).toBe(true)
    expect(event).toBe(false)
  })

  it('chỉ thấy chân thì cả hai gate đều loại', () => {
    const bbox: Bbox4 = [560, FRAME_H * 0.72, 640, FRAME_H * 0.98]
    const { display, event } = gates(bbox)
    expect(display).toBe(false)
    expect(event).toBe(false)
  })

  it('khung quá mảnh không thể là người thì loại', () => {
    const { display } = gates([600, 200, 606, 640])
    expect(display).toBe(false)
  })

  it('frame chưa có kích thước thì không vẽ', () => {
    expect(
      patrolPersonMeetsDisplayGate({ bbox: [0, 0, 10, 10], frameW: 0, frameH: 0 }),
    ).toBe(false)
  })

  it('người ngồi ghế nằm nửa dưới khung vẫn được vẽ ROI', () => {
    const bbox: Bbox4 = [FRAME_W * 0.38, FRAME_H * 0.55, FRAME_W * 0.62, FRAME_H * 0.88]
    const { display, event } = gates(bbox)
    expect(display).toBe(true)
    expect(event).toBe(false)
  })

  it('chân của chính người đeo camera dính đáy khung thì loại', () => {
    const bbox: Bbox4 = [FRAME_W * 0.30, FRAME_H * 0.66, FRAME_W * 0.70, FRAME_H * 0.99]
    expect(patrolPersonLimbFragmentBbox(bbox, FRAME_W, FRAME_H)).toBe(true)
    expect(gates(bbox).display).toBe(false)
  })

  it('gate hiển thị không bao giờ chặt hơn gate sự kiện', () => {
    const samples: Bbox4[] = [
      [520, 140, 700, 660],
      [500, 300, 800, 520],
      [900, 200, 1000, 500],
      [40, 60, 300, 690],
    ]
    for (const bbox of samples) {
      const { display, event } = gates(bbox)
      if (event) expect(display).toBe(true)
    }
  })

  it('biển hiệu ngang phía trên bị loại ở cả hai gate', () => {
    const bbox: Bbox4 = [FRAME_W * 0.15, FRAME_H * 0.05, FRAME_W * 0.85, FRAME_H * 0.28]
    const { display, event } = gates(bbox)
    expect(display).toBe(false)
    expect(event).toBe(false)
  })

  it('bbox YOLO crowd gần full-frame (normalized) bị loại khỏi ROI', () => {
    const normalized: Bbox4 = [0.6, 0.1, 0.9, 0.9]
    expect(patrolPersonOversizedDisplayBbox(normalized, FRAME_W, FRAME_H)).toBe(true)
    expect(
      patrolPersonMeetsDisplayGate({ bbox: normalized, frameW: FRAME_W, frameH: FRAME_H }),
    ).toBe(false)
  })

  it('bbox bodycam cận cảnh hợp lệ (normalized) vẫn vẽ sau chuyển pixel', () => {
    const normalized: Bbox4 = [0.7, 0.2, 0.8, 0.5]
    expect(patrolPersonOversizedDisplayBbox(normalized, FRAME_W, FRAME_H)).toBe(false)
    const pixel = bboxToPixelSpace(normalized, FRAME_W, FRAME_H)
    expect(
      patrolPersonMeetsDisplayGate({ bbox: pixel, frameW: FRAME_W, frameH: FRAME_H }),
    ).toBe(true)
  })

  it('người cận cảnh pixel cao >55% khung vẫn vẽ (không nhầm với crowd)', () => {
    const bbox: Bbox4 = [520, 140, 700, 660]
    expect(patrolPersonOversizedDisplayBbox(bbox, FRAME_W, FRAME_H)).toBe(false)
    expect(gates(bbox).display).toBe(true)
  })

  it('yên xe ngang bị loại khỏi ROI', () => {
    const seat: Bbox4 = [FRAME_W * 0.35, FRAME_H * 0.52, FRAME_W * 0.58, FRAME_H * 0.68]
    expect(patrolMotorcycleSeatLikeFpBox(seat, FRAME_W, FRAME_H)).toBe(true)
    expect(gates(seat).display).toBe(false)
  })

  it('person chồng bbox xe máy (yên) bị loại', () => {
    const motorcycle: Bbox4 = [FRAME_W * 0.30, FRAME_H * 0.45, FRAME_W * 0.70, FRAME_H * 0.75]
    const seat: Bbox4 = [FRAME_W * 0.38, FRAME_H * 0.52, FRAME_W * 0.58, FRAME_H * 0.68]
    expect(
      patrolPersonOverlapsVehicleFp(seat, [motorcycle], FRAME_W, FRAME_H),
    ).toBe(true)
    expect(
      patrolPersonMeetsDisplayGate({
        bbox: seat,
        frameW: FRAME_W,
        frameH: FRAME_H,
        vehicleBoxes: [motorcycle],
      }),
    ).toBe(false)
  })

  it('người cưỡi cao vẫn vẽ khi chồng bbox xe', () => {
    const motorcycle: Bbox4 = [FRAME_W * 0.30, FRAME_H * 0.50, FRAME_W * 0.65, FRAME_H * 0.82]
    const rider: Bbox4 = [FRAME_W * 0.42, FRAME_H * 0.22, FRAME_W * 0.58, FRAME_H * 0.68]
    expect(
      patrolPersonOverlapsVehicleFp(rider, [motorcycle], FRAME_W, FRAME_H),
    ).toBe(false)
    expect(
      patrolPersonMeetsDisplayGate({
        bbox: rider,
        frameW: FRAME_W,
        frameH: FRAME_H,
        vehicleBoxes: [motorcycle],
      }),
    ).toBe(true)
  })
})

describe('gate hiển thị flycam', () => {
  const flycamDisplay = (bbox: Bbox4) =>
    patrolPersonMeetsDisplayGate({ bbox, frameW: FRAME_W, frameH: FRAME_H, flycam: true })

  const proximityDisplay = (bbox: Bbox4) =>
    patrolPersonMeetsDisplayGate({
      bbox,
      frameW: FRAME_W,
      frameH: FRAME_H,
      proximityFlycam: true,
    })

  it('tầm thấp — người lớn giữa khung vẫn vẽ ROI', () => {
    const bbox: Bbox4 = [FRAME_W * 0.38, FRAME_H * 0.22, FRAME_W * 0.62, FRAME_H * 0.78]
    expect(proximityDisplay(bbox)).toBe(true)
  })

  it('người ngồi co lại rộng hơn cao vẫn được vẽ ROI', () => {
    const bbox: Bbox4 = [FRAME_W * 0.45, FRAME_H * 0.50, FRAME_W * 0.45 + 200, FRAME_H * 0.50 + 30]
    expect(flycamDisplay(bbox)).toBe(true)
  })

  it('người rất nhỏ trên không vẫn được vẽ ROI', () => {
    const bbox: Bbox4 = [FRAME_W * 0.49, FRAME_H * 0.40, FRAME_W * 0.51, FRAME_H * 0.415]
    expect(flycamDisplay(bbox)).toBe(true)
  })

  it('đốm nhiễu vài pixel thì loại', () => {
    const bbox: Bbox4 = [FRAME_W * 0.5, FRAME_H * 0.5, FRAME_W * 0.5 + 3, FRAME_H * 0.5 + 4]
    expect(flycamDisplay(bbox)).toBe(false)
  })
})

describe('ẩn ROI trùng tầng thấp', () => {
  const personDet = (
    bbox: Bbox4,
    extra: {
      worker_id?: string
      track_id?: string
      tier?: 'object' | 'person' | 'identity'
      confidence?: number
    } = {},
  ) => ({
    behavior: 'person',
    bbox,
    confidence: extra.confidence ?? 0.7,
    ...extra,
  })

  it('ẩn Đối tượng khi chồng Người đã có tk — kể cả khác track_id', () => {
    const input = [
      personDet([100, 100, 220, 480], { worker_id: 'tk-00000107', track_id: 'trk-a', tier: 'person' }),
      personDet([130, 180, 200, 360], { track_id: 'trk-b', tier: 'object', confidence: 0.77 }),
    ]
    const out = suppressPatrolObjectOverlappingIdentified(input)
    expect(out).toHaveLength(1)
    expect(out[0].worker_id).toBe('tk-00000107')
  })

  it('giữ hai người khác mã dù bbox chồng nhau', () => {
    const input = [
      personDet([100, 100, 220, 480], { worker_id: 'tk-00000107', tier: 'person' }),
      personDet([110, 105, 210, 470], { worker_id: 'tk-00000109', tier: 'person' }),
    ]
    const out = suppressPatrolObjectOverlappingIdentified(input)
    expect(out).toHaveLength(2)
  })

  it('giữ hai object khác track_id dù bbox chồng nhau', () => {
    const input = [
      personDet([100, 100, 220, 480], { tier: 'object', track_id: 'ptk0001:person', confidence: 0.77 }),
      personDet([120, 140, 190, 420], { tier: 'object', track_id: 'ptk0002:person', confidence: 0.72 }),
    ]
    const out = suppressPatrolObjectOverlappingIdentified(input)
    expect(out).toHaveLength(2)
  })

  it('giữ hai object cùng tầng khi tâm bbox cách xa dù chạm mép', () => {
    const input = [
      personDet([100, 120, 200, 480], { tier: 'object', track_id: 'ptk-a', confidence: 0.8 }),
      personDet([520, 130, 620, 470], { tier: 'object', track_id: 'ptk-b', confidence: 0.75 }),
    ]
    const out = suppressPatrolObjectOverlappingIdentified(input, 1280, 720)
    expect(out).toHaveLength(2)
  })

  it('chỉ giữ một hộp khi cùng tầng object trùng vùng', () => {
    const input = [
      personDet([100, 100, 220, 480], { tier: 'object', confidence: 0.55 }),
      personDet([120, 140, 190, 420], { tier: 'object', confidence: 0.77 }),
    ]
    const out = suppressPatrolObjectOverlappingIdentified(input)
    expect(out).toHaveLength(1)
    expect(out[0].confidence).toBe(0.55)
  })
})

/**
 * Đo trên HC-01 thật: 9/11 hộp lọt cổng ghi thẻ cao 20–29 px trong khung cao
 * 540, tỉ lệ cao/rộng 0.95–1.11 — cắt ra chỉ là vệt mờ. Mirror
 * `test_patrol_speck_box_gate.py` bên backend.
 */
describe('vệt vuông nhỏ không được vẽ ROI', () => {
  // Cùng tỉ lệ như hộp đo được: cao 3.7% khung, gần vuông.
  const speck: Bbox4 = [700, 100, 700 + 28, 100 + 27]

  it('loại vệt vuông ở góc mặt đất', () => {
    expect(patrolPersonMeetsDisplayGate({ bbox: speck, frameW: FRAME_W, frameH: FRAME_H }))
      .toBe(false)
  })

  it('tỉ lệ cao/rộng không phải cửa lách — rác trải tới tỉ lệ 1.6', () => {
    const tall: Bbox4 = [700, 100, 700 + 14, 100 + 32]
    expect(patrolPersonMeetsDisplayGate({ bbox: tall, frameW: FRAME_W, frameH: FRAME_H }))
      .toBe(false)
  })

  it('giữ người ở xa khi đã đủ lớn để nhìn ra', () => {
    // Rộng 52 px để tỉ lệ ~1.9 — hẹp hơn nữa thì luật cột dọc loại trước.
    const distant: Bbox4 = [700, 100, 700 + 52, 100 + FRAME_H * 0.14]
    expect(patrolPersonMeetsDisplayGate({ bbox: distant, frameW: FRAME_W, frameH: FRAME_H }))
      .toBe(true)
  })

  it('không áp cho luồng bay — từ drone người thật vốn nhỏ và bẹt', () => {
    expect(
      patrolPersonMeetsDisplayGate({
        bbox: speck, frameW: FRAME_W, frameH: FRAME_H, flycam: true,
      }),
    ).toBe(true)
  })
})
