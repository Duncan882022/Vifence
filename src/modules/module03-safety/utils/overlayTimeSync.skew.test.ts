import { describe, expect, it } from 'vitest'
import { OverlayTimeBuffer } from './overlayTimeSync'
import type { VmsDetectionSnapshot } from '../services/vmsDetections.service'

function snap(updatedAtSec: number): VmsDetectionSnapshot {
  return {
    camera_id: 'HC-02',
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

describe('OverlayTimeBuffer client-server skew', () => {
  it('fallback lag trừ skewMs khi chọn snapshot', () => {
    const buffer = new OverlayTimeBuffer()
    const nowSec = Math.floor(Date.now() / 1000)
    buffer.push(snap(nowSec - 6))
    buffer.push(snap(nowSec - 4))

    const skewMs = 2000
    const result = buffer.resolve(null, { fallbackLagMs: 5000, clientServerSkewMs: skewMs })
    expect(result.matched).toBe(true)
    expect(result.snapshot?.updated_at).toBe(nowSec - 6)
  })
})
