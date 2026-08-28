import { describe, expect, it } from 'vitest'
import { getPatrolPersonRoiEngine } from '@/modules/module05-productivity/personRoi/patrolPersonRoiEngine'
import {
  buildVmsOverlaySyncKey,
  clearVmsDetectionOverlayFrame,
} from './liveOverlaySync'
import type { VmsDetectionSnapshot } from '../services/vmsDetections.service'

function sampleSnapshot(cameraId: string): VmsDetectionSnapshot {
  return {
    camera_id: cameraId,
    width: 720,
    height: 1280,
    updated_at: Date.now(),
    vms_ready: true,
    detections: [],
    roi_zones: [],
    metrics: {},
  }
}

describe('clearVmsDetectionOverlayFrame', () => {
  it('đổi sync key overlay nhưng giữ patrol ROI engine (ingest tự cập nhật)', () => {
    const cameraId = 'HC-TEST-CLEAR'
    const engine = getPatrolPersonRoiEngine(cameraId)
    engine.ingest([
      {
        behavior: 'person',
        label: 'person',
        confidence: 0.9,
        bbox: [10, 20, 110, 220],
      },
    ])
    expect(engine.getDisplayTracks().length).toBeGreaterThan(0)

    const beforeKey = buildVmsOverlaySyncKey(sampleSnapshot(cameraId))
    clearVmsDetectionOverlayFrame(cameraId)
    const afterKey = buildVmsOverlaySyncKey(sampleSnapshot(cameraId))

    expect(afterKey).not.toBe(beforeKey)
    expect(getPatrolPersonRoiEngine(cameraId).getDisplayTracks().length).toBeGreaterThan(0)
  })
})
