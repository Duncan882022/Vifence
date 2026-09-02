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
  it('WHEP (no PDT, không fallbackLag): snapshot mới nhất', () => {
    const buffer = new OverlayTimeBuffer()
    const nowSec = Math.floor(Date.now() / 1000)
    buffer.push(snap(nowSec - 12))
    buffer.push(snap(nowSec - 5))
    buffer.push(snap(nowSec))

    const result = buffer.resolve(null)
    expect(result.snapshot?.updated_at).toBe(nowSec)
    expect(result.matched).toBe(false)
  })

  it('HLS chưa có PDT: buffer ~5s khi có fallbackLagMs', () => {
    const buffer = new OverlayTimeBuffer()
    const nowSec = Math.floor(Date.now() / 1000)
    buffer.push(snap(nowSec - 12))
    buffer.push(snap(nowSec - 5))
    buffer.push(snap(nowSec))

    const result = buffer.resolve(null, { fallbackLagMs: 5000 })
    expect(result.matched).toBe(true)
    expect(result.snapshot?.updated_at).toBe(nowSec - 5)
  })

  it('patrol HLS — bỏ snapshot AI mới hơn khung đang phát', () => {
    const buffer = new OverlayTimeBuffer()
    const displayMs = 1_700_000_000_000
    buffer.push(snap(Math.floor((displayMs - 5000) / 1000)))
    buffer.push(snap(Math.floor((displayMs + 5000) / 1000)))

    const result = buffer.resolve(displayMs, { fallbackLagMs: 5000 })
    expect(result.matched).toBe(true)
    expect(result.snapshot?.frame_wallclock_ms).toBe(displayMs - 5000)
  })
})
