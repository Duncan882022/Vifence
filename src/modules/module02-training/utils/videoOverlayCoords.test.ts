/**
 * Map bbox pixel BE → % overlay trên video object-cover/contain.
 * Module 05: bbox chuẩn hoá 0–1 được denormalize trước khi map.
 */
import { describe, expect, it } from 'vitest'
import {
  bboxToPixelSpace,
  isNormalizedBbox,
  mapBackendBboxToOverlay,
  resolveOverlayAnalyzeFrameSize,
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

describe('normalized bbox Module 05', () => {
  it('detects 0–1 coordinates', () => {
    expect(isNormalizedBbox([0.1, 0.2, 0.3, 0.5])).toBe(true)
    expect(isNormalizedBbox([100, 50, 200, 150])).toBe(false)
  })

  it('denormalizes to pixel space', () => {
    const pixel = bboxToPixelSpace([0.5, 0.25, 0.6, 0.75], 1920, 1080)
    expect(pixel[0]).toBeCloseTo(960)
    expect(pixel[1]).toBeCloseTo(270)
    expect(pixel[2]).toBeCloseTo(1152)
    expect(pixel[3]).toBeCloseTo(810)
  })

  it('mapBackendBboxToOverlay accepts normalized bbox', () => {
    const video = mockVideo(1920, 1080, 640, 360)
    const mapped = mapBackendBboxToOverlay(
      [0.5, 0.25, 0.6, 0.75],
      1920,
      1080,
      video,
      'contain',
    )
    expect(mapped.w).toBeGreaterThan(0)
    expect(mapped.h).toBeGreaterThan(0)
  })
})

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

  it('fallback frame intrinsic khi iOS chưa có videoWidth (WHEP)', () => {
    const video = mockVideo(0, 0, 320, 240)
    const mapped = mapBackendBboxToOverlay(
      [100, 200, 300, 600],
      720,
      1280,
      video,
      'contain',
      'center',
    )
    expect(mapped.w).toBeGreaterThan(0)
    expect(mapped.h).toBeGreaterThan(0)
  })
})

describe('resolveOverlayAnalyzeFrameSize', () => {
  it('ưu tiên snapshot khi aspect khớp video', () => {
    const video = mockVideo(1920, 1080, 640, 360)
    const size = resolveOverlayAnalyzeFrameSize(video, 1920, 1080)
    expect(size).toEqual({ width: 1920, height: 1080 })
  })

  it('fallback video intrinsic khi snapshot aspect lệch', () => {
    const video = mockVideo(720, 1280, 320, 240)
    const size = resolveOverlayAnalyzeFrameSize(video, 1920, 1080)
    expect(size).toEqual({ width: 1920, height: 1080 })
  })

  it('mapBackendBboxToOverlay — snapshot ngang, video dọc (HC-02 mobile)', () => {
    const video = mockVideo(720, 1280, 320, 240)
    const mapped = mapBackendBboxToOverlay(
      [0.35, 0.25, 0.65, 0.75],
      1920,
      1080,
      video,
      'contain',
      'center',
    )
    expect(mapped.w).toBeGreaterThan(1)
    expect(mapped.h).toBeGreaterThan(1)
    expect(mapped.x).toBeGreaterThan(0)
    expect(mapped.y).toBeGreaterThan(0)
    expect(mapped.x + mapped.w).toBeLessThanOrEqual(100.5)
    expect(mapped.y + mapped.h).toBeLessThanOrEqual(100.5)
  })
})
