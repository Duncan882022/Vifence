/**
 * Map bbox pixel BE → % overlay trên video object-cover/contain.
 */
import { describe, expect, it } from 'vitest'
import {
  mapBackendBboxToOverlay,
  videoRectToOverlayPercent,
} from './videoOverlayCoords'

function mockVideo(
  videoWidth: number,
  videoHeight: number,
  clientWidth: number,
  clientHeight: number,
): HTMLVideoElement {
  return {
    videoWidth,
    videoHeight,
    clientWidth,
    clientHeight,
  } as HTMLVideoElement
}

describe('videoRectToOverlayPercent', () => {
  it('contain — map pixel → % trên tile letterbox', () => {
    const box = videoRectToOverlayPercent(
      { x: 960, y: 540, width: 192, height: 192 },
      1920,
      1080,
      400,
      400,
      'contain',
      'center',
    )
    expect(box.x).toBeCloseTo(50, 1)
    expect(box.y).toBeCloseTo(50, 1)
    expect(box.w).toBeCloseTo(10, 1)
    expect(box.h).toBeCloseTo(10, 1)
  })
})

describe('mapBackendBboxToOverlay', () => {
  it('scale bbox từ khung analyze nhỏ hơn video intrinsic (contain)', () => {
    const video = mockVideo(1920, 1080, 640, 360)
    const mapped = mapBackendBboxToOverlay(
      [100, 50, 200, 150],
      960,
      540,
      video,
      'contain',
      'center',
    )
    expect(mapped.x).toBeCloseTo(10.416, 2)
    expect(mapped.y).toBeCloseTo(9.259, 2)
    expect(mapped.w).toBeCloseTo(10.416, 2)
    expect(mapped.h).toBeCloseTo(18.518, 2)
  })

  it('cùng kích thước analyze và video — không lệch', () => {
    const video = mockVideo(960, 540, 480, 270)
    const mapped = mapBackendBboxToOverlay(
      [100, 50, 200, 150],
      960,
      540,
      video,
      'contain',
      'center',
    )
    expect(mapped.x).toBeCloseTo(10.416, 2)
    expect(mapped.y).toBeCloseTo(9.259, 2)
  })

  it('bodycam portrait — bbox nằm trong vùng hiển thị', () => {
    const video = mockVideo(720, 1280, 320, 240)
    const mapped = mapBackendBboxToOverlay(
      [200, 400, 400, 900],
      720,
      1280,
      video,
      'contain',
      'center',
    )
    expect(mapped.x).toBeGreaterThan(0)
    expect(mapped.y).toBeGreaterThan(0)
    expect(mapped.x + mapped.w).toBeLessThanOrEqual(100.5)
    expect(mapped.y + mapped.h).toBeLessThanOrEqual(100.5)
  })
})
