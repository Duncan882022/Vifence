import { describe, expect, it } from 'vitest'
import { OverlayTimeBuffer } from './overlayTimeSync'
import type { VmsDetectionSnapshot } from '../services/vmsDetections.service'

function snap(updatedAtSec: number): VmsDetectionSnapshot {
  return {
    camera_id: 'HC-01',
    updated_at: updatedAtSec,
    frame_wallclock_ms: updatedAtSec * 1000,
    width: 1280,
    height: 720,
    detections: [],
    roi_zones: [],
    vms_ready: true,
    metrics: {},
  }
}

describe('OverlayTimeBuffer fallback lag', () => {
  it('uses snapshot ~5s ago instead of latest when PDT missing', () => {
    const buffer = new OverlayTimeBuffer()
    const nowSec = Math.floor(Date.now() / 1000)
    buffer.push(snap(nowSec - 12))
    buffer.push(snap(nowSec - 5))
    buffer.push(snap(nowSec))

    const result = buffer.resolve(null, { fallbackLagMs: 5000 })
    expect(result.matched).toBe(true)
    expect(result.snapshot?.updated_at).toBe(nowSec - 5)
  })
})
