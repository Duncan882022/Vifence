import { describe, expect, it } from 'vitest'
import { OverlayTimeBuffer } from './overlayTimeSync'
import type { VmsDetectionSnapshot } from '../services/vmsDetections.service'

function snap(updatedAtSec: number, id: string): VmsDetectionSnapshot {
  return {
    camera_id: 'HC-01',
    updated_at: updatedAtSec,
    frame_wallclock_ms: updatedAtSec * 1000,
    width: 1280,
    height: 720,
    detections: [],
    metrics: {},
  } as VmsDetectionSnapshot
}

describe('OverlayTimeBuffer fallback lag', () => {
  it('uses snapshot ~5s ago instead of latest when PDT missing', () => {
    const buffer = new OverlayTimeBuffer()
    const nowSec = Math.floor(Date.now() / 1000)
    buffer.push(snap(nowSec - 12, 'old'))
    buffer.push(snap(nowSec - 5, 'target'))
    buffer.push(snap(nowSec, 'latest'))

    const result = buffer.resolve(null, { fallbackLagMs: 5000 })
    expect(result.matched).toBe(true)
    expect(result.snapshot?.updated_at).toBe(nowSec - 5)
  })
})
