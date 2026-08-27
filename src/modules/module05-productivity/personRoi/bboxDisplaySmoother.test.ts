import { describe, expect, it } from 'vitest'
import { BboxDisplaySmoother } from './bboxDisplaySmoother'

describe('BboxDisplaySmoother', () => {
  it('làm mượt từng bước thay vì nhảy thẳng tới raw', () => {
    const smoother = new BboxDisplaySmoother()
    const first = smoother.smooth('t1', [100, 100, 200, 400])
    const second = smoother.smooth('t1', [130, 110, 230, 420], { alpha: 0.5 })

    expect(first).toEqual([100, 100, 200, 400])
    expect(second[0]).toBeGreaterThan(100)
    expect(second[0]).toBeLessThan(130)
  })

  it('snap khi nhảy quá xa', () => {
    const smoother = new BboxDisplaySmoother()
    smoother.smooth('t1', [100, 100, 200, 400])
    const jumped = smoother.smooth('t1', [500, 100, 600, 400], { alpha: 0.2, snapDiagonalRatio: 0.1 })
    expect(jumped[0]).toBeGreaterThan(450)
  })
})
