/**
 * Gate hiển thị (vẽ ROI) rộng hơn gate ghi sự kiện — yêu cầu nghiệp vụ:
 * bbox mọi người trong khung, nhưng chỉ ghi sự kiện cho đầu + ≥30% thân.
 */
import { describe, expect, it } from 'vitest'
import {
  patrolPersonMeetsDetectionGate,
  patrolPersonMeetsDisplayGate,
  type Bbox4,
} from './patrolPersonVisibility'

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

  it('gate hiển thị không bao giờ chặt hơn gate sự kiện', () => {
    const samples: Bbox4[] = [
      [520, 140, 700, 660],
      [500, 300, 800, 520],
      [200, 80, 1100, 700],
      [900, 200, 1000, 500],
      [40, 60, 300, 690],
    ]
    for (const bbox of samples) {
      const { display, event } = gates(bbox)
      if (event) expect(display).toBe(true)
    }
  })
})
