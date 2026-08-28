import { describe, expect, it } from 'vitest'
import {
  bboxToPixelSpace,
  isNormalizedBbox,
  mapBackendBboxToOverlay,
} from './videoOverlayCoords'

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
    const video = {
      videoWidth: 1920,
      videoHeight: 1080,
      clientWidth: 640,
      clientHeight: 360,
    } as HTMLVideoElement
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
